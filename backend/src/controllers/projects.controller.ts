import crypto from 'crypto';
import fs from 'fs';
import path from 'path';
import { db } from '../database/db';
import { CONFIG } from '../config';
import { StorageService } from '../services/storage.service';
import { removeDirSync } from '../utils/fsUtils';
import { BuildService } from '../services/build.service';
import { validateCustomizationInput } from '../validators/project.validator';

function formatCustomizationRow(row: any) {
  if (!row) return null;
  let parsedPerms: string[] = [];
  try {
    parsedPerms = JSON.parse(row.permissions || '[]');
  } catch {
    parsedPerms = ['android.permission.INTERNET'];
  }
  return {
    ...row,
    fullscreen: Boolean(row.fullscreen),
    light_status_bar: Boolean(row.light_status_bar),
    allow_cleartext: row.allow_cleartext !== 0,
    enable_zoom: Boolean(row.enable_zoom),
    keep_screen_on: Boolean(row.keep_screen_on),
    splash_enabled: row.splash_enabled !== 0,
    permissions: parsedPerms
  };
}

function formatAnimationRow(row: any) {
  if (!row) {
    return {
      splash_animation: 'fade',
      splash_duration_ms: 1500,
      pulse_duration_s: 2.0,
      glass_blur_px: 30,
      page_transition: 'fade',
      loader_style: 'spinner',
      button_effect: 'scale-press',
      inject_stylesheet: true
    };
  }
  return {
    ...row,
    inject_stylesheet: row.inject_stylesheet !== 0
  };
}

export class ProjectsController {
  public static list(_req: any, res: any): void {
    const projects = db.prepare(`
      SELECT
        p.*,
        c.app_name,
        c.package_id,
        c.version_name,
        c.version_code,
        (
          SELECT b.status
          FROM builds b
          WHERE b.project_id = p.id
          ORDER BY b.started_at DESC
          LIMIT 1
        ) AS last_build_status
      FROM projects p
      LEFT JOIN project_customization c ON p.id = c.project_id
      ORDER BY p.updated_at DESC
    `).all();
    res.json(projects);
  }

  public static create(req: any, res: any): void {
    const { name, type } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim() || !['html', 'python'].includes(type)) {
      res.status(400).json({ error: "Valid project name and type ('html' or 'python') are required." });
      return;
    }

    const trimmedName = name.trim();
    const id = crypto.randomUUID();
    const cleanPkg = trimmedName.toLowerCase().replace(/[^a-z0-9]/g, '');
    const safeSegment = cleanPkg && /^[a-z]/.test(cleanPkg) ? cleanPkg : `app${cleanPkg}`;
    const packageId = `com.apkstudio.${safeSegment}`;

    const insertProject = db.transaction(() => {
      db.prepare('INSERT INTO projects (id, name, type, status) VALUES (?, ?, ?, ?)')
        .run(id, trimmedName, type, 'ready');
      db.prepare(`
        INSERT INTO project_customization
        (project_id, app_name, package_id, version_name, version_code, orientation, fullscreen)
        VALUES (?, ?, ?, '1.0.0', 1, 'portrait', 0)
      `).run(id, trimmedName, packageId);
      db.prepare(`
        INSERT INTO project_animations
        (project_id, splash_animation, splash_duration_ms, pulse_duration_s, glass_blur_px, page_transition, loader_style, button_effect, inject_stylesheet)
        VALUES (?, 'fade', 1500, 2.0, 30, 'fade', 'spinner', 'scale-press', 1)
      `).run(id);
    });

    insertProject();

    // Generate initial starter scaffold from build-engine/templates
    const templateSubdir = type === 'html' ? 'html-starter' : 'python-starter';
    const templateDir = path.join(CONFIG.STARTER_TEMPLATES_DIR, templateSubdir);
    if (fs.existsSync(templateDir)) {
      const files = fs.readdirSync(templateDir);
      for (const file of files) {
        const raw = fs.readFileSync(path.join(templateDir, file), 'utf-8');
        const populated = raw.replace(/__PROJECT_NAME__/g, trimmedName);
        StorageService.writeFile(id, file, populated);
      }
    } else {
      StorageService.writeFile(id, 'index.html', `<!DOCTYPE html><html><head><title>${trimmedName}</title></head><body><h1>${trimmedName}</h1></body></html>`);
    }

    const created = db.prepare(`
      SELECT p.*, c.app_name, c.package_id, c.version_name, c.version_code
      FROM projects p
      LEFT JOIN project_customization c ON p.id = c.project_id
      WHERE p.id = ?
    `).get(id);

    res.status(201).json(created);
  }

  public static get(req: any, res: any): void {
    const { id } = req.params;
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const customizationRow = db.prepare('SELECT * FROM project_customization WHERE project_id = ?').get(id);
    const animationRow = db.prepare('SELECT * FROM project_animations WHERE project_id = ?').get(id);

    res.json({
      project,
      customization: formatCustomizationRow(customizationRow),
      animations: formatAnimationRow(animationRow)
    });
  }

  public static rename(req: any, res: any): void {
    const { id } = req.params;
    const { name } = req.body || {};
    if (!name || typeof name !== 'string' || !name.trim()) {
      res.status(400).json({ error: 'A non-empty project name is required.' });
      return;
    }
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }
    const trimmed = name.trim();
    db.prepare('UPDATE projects SET name = ?, updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(trimmed, id);
    const updated = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    res.json(updated);
  }

  public static duplicate(req: any, res: any): void {
    const { id } = req.params;
    const sourceProject = db.prepare('SELECT * FROM projects WHERE id = ?').get(id) as any;
    if (!sourceProject) {
      res.status(404).json({ error: 'Source project not found' });
      return;
    }
    const sourceCust = db.prepare('SELECT * FROM project_customization WHERE project_id = ?').get(id) as any;
    const sourceAnim = db.prepare('SELECT * FROM project_animations WHERE project_id = ?').get(id) as any;

    const newId = crypto.randomUUID();
    const newName = (req.body && req.body.name && String(req.body.name).trim()) || `${sourceProject.name} (Copy)`;
    const cleanSuffix = Math.random().toString(36).substring(2, 6);
    const newPkgId = sourceCust?.package_id ? `${sourceCust.package_id}copy${cleanSuffix}` : `com.apkstudio.copy${cleanSuffix}`;

    db.transaction(() => {
      db.prepare('INSERT INTO projects (id, name, type, status) VALUES (?, ?, ?, ?)')
        .run(newId, newName, sourceProject.type, 'ready');

      db.prepare(`
        INSERT INTO project_customization (
          project_id, app_name, package_id, version_name, version_code,
          orientation, fullscreen, status_bar_color, nav_bar_color, light_status_bar,
          theme_color, background_color, offline_mode, allow_cleartext, enable_zoom,
          keep_screen_on, splash_enabled, splash_color, splash_duration_ms, splash_animation,
          icon_data_url, splash_image_data_url, permissions
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newId,
        newName,
        newPkgId,
        sourceCust?.version_name || '1.0.0',
        sourceCust?.version_code || 1,
        sourceCust?.orientation || 'portrait',
        sourceCust?.fullscreen || 0,
        sourceCust?.status_bar_color || '#1f1c2c',
        sourceCust?.nav_bar_color || '#1f1c2c',
        sourceCust?.light_status_bar || 0,
        sourceCust?.theme_color || '#6c5ce7',
        sourceCust?.background_color || '#1f1c2c',
        sourceCust?.offline_mode || 'cache_first',
        sourceCust?.allow_cleartext ?? 1,
        sourceCust?.enable_zoom || 0,
        sourceCust?.keep_screen_on || 0,
        sourceCust?.splash_enabled ?? 1,
        sourceCust?.splash_color || '#1f1c2c',
        sourceCust?.splash_duration_ms ?? 1500,
        sourceCust?.splash_animation || 'fade',
        sourceCust?.icon_data_url || null,
        sourceCust?.splash_image_data_url || null,
        sourceCust?.permissions || '["android.permission.INTERNET"]'
      );

      db.prepare(`
        INSERT INTO project_animations (
          project_id, splash_animation, splash_duration_ms, pulse_duration_s,
          glass_blur_px, page_transition, loader_style, button_effect, inject_stylesheet
        ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `).run(
        newId,
        sourceAnim?.splash_animation || 'fade',
        sourceAnim?.splash_duration_ms ?? 1500,
        sourceAnim?.pulse_duration_s ?? 2.0,
        sourceAnim?.glass_blur_px ?? 30,
        sourceAnim?.page_transition || 'fade',
        sourceAnim?.loader_style || 'spinner',
        sourceAnim?.button_effect || 'scale-press',
        sourceAnim?.inject_stylesheet ?? 1
      );
    })();

    StorageService.copyProjectFiles(id, newId);

    const duplicated = db.prepare(`
      SELECT p.*, c.app_name, c.package_id, c.version_name, c.version_code
      FROM projects p
      LEFT JOIN project_customization c ON p.id = c.project_id
      WHERE p.id = ?
    `).get(newId);

    res.status(201).json(duplicated);
  }

  public static updateCustomization(req: any, res: any): void {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const validation = validateCustomizationInput(req.body);
    if (!validation.valid) {
      res.status(400).json({ error: validation.errors.join(' '), errors: validation.errors });
      return;
    }

    const b = req.body;
    db.prepare(`
      UPDATE project_customization SET
        app_name = ?,
        package_id = ?,
        version_name = ?,
        version_code = ?,
        orientation = ?,
        fullscreen = ?,
        status_bar_color = ?,
        nav_bar_color = ?,
        light_status_bar = ?,
        theme_color = ?,
        background_color = ?,
        offline_mode = ?,
        allow_cleartext = ?,
        enable_zoom = ?,
        keep_screen_on = ?,
        splash_enabled = ?,
        splash_color = ?,
        splash_duration_ms = ?,
        splash_animation = ?,
        icon_data_url = ?,
        splash_image_data_url = ?,
        permissions = ?
      WHERE project_id = ?
    `).run(
      b.app_name.trim(),
      b.package_id.trim(),
      b.version_name.trim(),
      Number(b.version_code),
      b.orientation || 'portrait',
      b.fullscreen ? 1 : 0,
      b.status_bar_color || '#1f1c2c',
      b.nav_bar_color || '#1f1c2c',
      b.light_status_bar ? 1 : 0,
      b.theme_color || '#6c5ce7',
      b.background_color || '#1f1c2c',
      b.offline_mode || 'cache_first',
      b.allow_cleartext !== false ? 1 : 0,
      b.enable_zoom ? 1 : 0,
      b.keep_screen_on ? 1 : 0,
      b.splash_enabled !== false ? 1 : 0,
      b.splash_color || '#1f1c2c',
      Number(b.splash_duration_ms ?? 1500),
      b.splash_animation || 'fade',
      b.icon_data_url || null,
      b.splash_image_data_url || null,
      JSON.stringify(b.permissions || ['android.permission.INTERNET']),
      id
    );

    db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    const updated = db.prepare('SELECT * FROM project_customization WHERE project_id = ?').get(id);
    res.json({ success: true, customization: formatCustomizationRow(updated) });
  }

  public static updateAnimations(req: any, res: any): void {
    const { id } = req.params;
    const existing = db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
    if (!existing) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const b = req.body || {};
    const splashAnimation = ['fade', 'scale', 'slide', 'pulse', 'none'].includes(b.splash_animation)
      ? b.splash_animation
      : 'fade';
    const splashDurationMs = Math.max(0, Math.min(15000, Number(b.splash_duration_ms ?? 1500)));
    const pulseDurationS = Math.max(0.2, Math.min(20, Number(b.pulse_duration_s ?? 2.0)));
    const glassBlurPx = Math.max(0, Math.min(100, Number(b.glass_blur_px ?? 30)));
    const pageTransition = ['fade', 'slide-up', 'zoom', 'none'].includes(b.page_transition)
      ? b.page_transition
      : 'fade';
    const loaderStyle = ['spinner', 'pulse-ring', 'progress-bar', 'dots', 'none'].includes(b.loader_style)
      ? b.loader_style
      : 'spinner';
    const buttonEffect = ['scale-press', 'glow-hover', 'ripple', 'none'].includes(b.button_effect)
      ? b.button_effect
      : 'scale-press';
    const injectStylesheet = b.inject_stylesheet !== false ? 1 : 0;

    db.prepare(`
      INSERT INTO project_animations (
        project_id, splash_animation, splash_duration_ms, pulse_duration_s,
        glass_blur_px, page_transition, loader_style, button_effect, inject_stylesheet, updated_at
      ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, CURRENT_TIMESTAMP)
      ON CONFLICT(project_id) DO UPDATE SET
        splash_animation = excluded.splash_animation,
        splash_duration_ms = excluded.splash_duration_ms,
        pulse_duration_s = excluded.pulse_duration_s,
        glass_blur_px = excluded.glass_blur_px,
        page_transition = excluded.page_transition,
        loader_style = excluded.loader_style,
        button_effect = excluded.button_effect,
        inject_stylesheet = excluded.inject_stylesheet,
        updated_at = CURRENT_TIMESTAMP
    `).run(
      id,
      splashAnimation,
      splashDurationMs,
      pulseDurationS,
      glassBlurPx,
      pageTransition,
      loaderStyle,
      buttonEffect,
      injectStylesheet
    );

    // Sync splash animation with project_customization as well
    db.prepare(`
      UPDATE project_customization
      SET splash_animation = ?, splash_duration_ms = ?
      WHERE project_id = ?
    `).run(splashAnimation, splashDurationMs, id);

    // Write apk_studio_animations.css directly into project workspace so live preview reflects it
    if (injectStylesheet) {
      const css = BuildService.generateAnimationStylesheet({
        pulse_duration_s: pulseDurationS,
        glass_blur_px: glassBlurPx,
        page_transition: pageTransition,
        button_effect: buttonEffect
      });
      StorageService.writeFile(id, 'apk_studio_animations.css', css);
    }

    db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(id);
    const updated = db.prepare('SELECT * FROM project_animations WHERE project_id = ?').get(id);
    res.json({ success: true, animations: formatAnimationRow(updated) });
  }

  public static delete(req: any, res: any): void {
    const { id } = req.params;
    const builds = db.prepare('SELECT id FROM builds WHERE project_id = ?').all(id) as Array<{ id: string }>;
    for (const b of builds) {
      const bDir = path.join(CONFIG.BUILDS_DIR, b.id);
      if (fs.existsSync(bDir)) {
        removeDirSync(bDir);
      }
    }
    StorageService.deleteProjectDirectory(id);
    db.prepare('DELETE FROM projects WHERE id = ?').run(id);
    res.json({ success: true });
  }
}
