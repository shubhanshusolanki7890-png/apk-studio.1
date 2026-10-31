import crypto from 'crypto';
import path from 'path';
import fs from 'fs';
import { spawnSync } from 'child_process';
import { db } from '../database/db';
import { BuildService } from '../services/build.service';
import { CONFIG } from '../config';
import { verifyGeneratedApk } from '../utils/apkVerifier';

export class BuildsController {
  public static trigger(req: any, res: any): void {
    const { projectId } = req.params;
    const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId);
    if (!project) {
      res.status(404).json({ error: 'Project not found' });
      return;
    }

    const buildType: 'debug' | 'release' =
      req.body?.buildType === 'release' ? 'release' : 'debug';
    const id = crypto.randomUUID();

    db.prepare(`
      INSERT INTO builds (id, project_id, build_type, status, stage, progress)
      VALUES (?, ?, ?, 'queued', 'queued', 0)
    `).run(id, projectId, buildType);

    setImmediate(() => {
      BuildService.executeBuild(id, projectId, buildType);
    });

    res.status(202).json({ buildId: id, status: 'queued', buildType });
  }

  public static getStatus(req: any, res: any): void {
    const { buildId } = req.params;
    const build = db.prepare('SELECT * FROM builds WHERE id = ?').get(buildId);
    if (!build) {
      res.status(404).json({ error: 'Build ID not found' });
      return;
    }
    res.json(build);
  }

  public static listByProject(req: any, res: any): void {
    const { projectId } = req.params;
    const builds = db.prepare('SELECT * FROM builds WHERE project_id = ? ORDER BY started_at DESC').all(projectId);
    res.json(builds);
  }

  public static downloadApk(req: any, res: any): void {
    const { buildId } = req.params;
    const build = db.prepare('SELECT * FROM builds WHERE id = ?').get(buildId) as any;
    if (!build || build.status !== 'success' || !build.apk_filename) {
      res.status(404).json({
        error: 'Verified APK artifact not found. Builds must succeed and pass binary verification before download.'
      });
      return;
    }

    const apkPath = path.join(CONFIG.BUILDS_DIR, buildId, build.apk_filename);
    const verification = verifyGeneratedApk(apkPath);
    if (!verification.valid) {
      res.status(404).json({ error: `APK verification failed on disk: ${verification.reason}` });
      return;
    }

    res.download(apkPath, build.apk_filename);
  }

  /**
   * Exports the prepared Android Studio / Gradle project directory as a ZIP archive
   * so users on hosts without a local Android SDK can open and compile it in Android Studio.
   */
  public static exportPreparedProject(req: any, res: any): void {
    const { buildId } = req.params;
    const build = db.prepare('SELECT * FROM builds WHERE id = ?').get(buildId) as any;
    if (!build) {
      res.status(404).json({ error: 'Build record not found.' });
      return;
    }

    const buildDir = path.join(CONFIG.BUILDS_DIR, buildId);
    if (!fs.existsSync(path.join(buildDir, 'app', 'build.gradle'))) {
      res.status(404).json({ error: 'Prepared Android Gradle project directory not found on disk.' });
      return;
    }

    const exportZipName = `android-project-${buildId.substring(0, 8)}.zip`;
    const exportZipPath = path.join(CONFIG.BUILDS_DIR, exportZipName);

    const pyZipScript = `
import os, sys, zipfile
src_dir = sys.argv[1]
out_zip = sys.argv[2]
with zipfile.ZipFile(out_zip, 'w', zipfile.ZIP_DEFLATED) as zf:
    for root, dirs, files in os.walk(src_dir):
        for f in files:
            full = os.path.join(root, f)
            rel = os.path.relpath(full, src_dir)
            zf.write(full, rel)
`;
    const proc = spawnSync('python3', ['-c', pyZipScript, buildDir, exportZipPath], { encoding: 'utf-8' });
    if (proc.status !== 0 || !fs.existsSync(exportZipPath)) {
      res.status(500).json({ error: 'Failed to archive prepared Android project.' });
      return;
    }

    res.download(exportZipPath, exportZipName);
  }
}
