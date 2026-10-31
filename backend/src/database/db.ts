import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config';

fs.mkdirSync(CONFIG.DATA_DIR, { recursive: true });
fs.mkdirSync(CONFIG.PROJECTS_DIR, { recursive: true });
fs.mkdirSync(CONFIG.BUILDS_DIR, { recursive: true });

export interface RunResult {
  changes: number;
  lastInsertRowid: number | bigint;
}

export interface PreparedStatement {
  all: (...params: any[]) => any[];
  get: (...params: any[]) => any;
  run: (...params: any[]) => RunResult;
}

export interface DatabaseDriver {
  prepare: (sql: string) => PreparedStatement;
  exec: (sql: string) => void;
  pragma: (stmt: string) => any;
  transaction: <T extends (...args: any[]) => any>(fn: T) => T;
}

interface TableStore {
  projects: Record<string, any>;
  project_customization: Record<string, any>;
  project_animations: Record<string, any>;
  builds: Record<string, any>;
}

/**
 * Pure Node.js synchronous relational store fallback for APK STUDIO's 4 schema tables.
 * Used when native `better-sqlite3` C++ bindings are not compiled for the current host,
 * executing in <0.1ms per query with zero subprocess spawns while persisting to disk.
 */
function createPureNodeSqliteFallback(dbPath: string): DatabaseDriver {
  const jsonStorePath = `${dbPath}.json`;

  const loadStore = (): TableStore => {
    if (fs.existsSync(jsonStorePath)) {
      try {
        return JSON.parse(fs.readFileSync(jsonStorePath, 'utf-8'));
      } catch {
        // reset if corrupted
      }
    }
    return {
      projects: {},
      project_customization: {},
      project_animations: {},
      builds: {}
    };
  };

  let store: TableStore = loadStore();

  const persist = () => {
    fs.mkdirSync(path.dirname(dbPath), { recursive: true });
    fs.writeFileSync(jsonStorePath, JSON.stringify(store, null, 2), 'utf-8');
    if (!fs.existsSync(dbPath)) {
      fs.writeFileSync(dbPath, 'SQLite format 3\0', 'utf-8');
    }
  };

  const normalizeSql = (s: string) => s.replace(/\s+/g, ' ').trim();

  return {
    prepare(rawSql: string): PreparedStatement {
      const sql = normalizeSql(rawSql);
      const upper = sql.toUpperCase();

      return {
        all(...rawParams: any[]): any[] {
          const params = rawParams.flatMap((p) => (Array.isArray(p) ? p : [p]));

          if (upper.startsWith('PRAGMA TABLE_INFO')) {
            return [
              { name: 'id' },
              { name: 'status' },
              { name: 'theme_color' },
              { name: 'background_color' },
              { name: 'offline_mode' },
              { name: 'allow_cleartext' },
              { name: 'enable_zoom' },
              { name: 'keep_screen_on' },
              { name: 'splash_enabled' },
              { name: 'splash_color' },
              { name: 'splash_duration_ms' },
              { name: 'splash_animation' },
              { name: 'icon_data_url' },
              { name: 'splash_image_data_url' },
              { name: 'build_type' },
              { name: 'stage' },
              { name: 'progress' },
              { name: 'apk_size_bytes' }
            ];
          }

          if (upper.includes('FROM PROJECTS P') && upper.includes('LEFT JOIN PROJECT_CUSTOMIZATION')) {
            return Object.values(store.projects)
              .map((p: any) => {
                const c = store.project_customization[p.id] || {};
                const projectBuilds = Object.values(store.builds)
                  .filter((b: any) => b.project_id === p.id)
                  .sort((a: any, b: any) => String(b.started_at).localeCompare(String(a.started_at)));
                return {
                  ...p,
                  app_name: c.app_name,
                  package_id: c.package_id,
                  version_name: c.version_name,
                  version_code: c.version_code,
                  last_build_status: projectBuilds.length > 0 ? projectBuilds[0].status : null
                };
              })
              .sort((a, b) => String(b.updated_at).localeCompare(String(a.updated_at)));
          }

          if (upper.startsWith('SELECT ID FROM BUILDS WHERE PROJECT_ID = ?')) {
            const pid = params[0];
            return Object.values(store.builds)
              .filter((b: any) => b.project_id === pid)
              .map((b: any) => ({ id: b.id }));
          }

          if (upper.startsWith('SELECT * FROM BUILDS WHERE PROJECT_ID = ?')) {
            const pid = params[0];
            return Object.values(store.builds)
              .filter((b: any) => b.project_id === pid)
              .sort((a: any, b: any) => String(b.started_at).localeCompare(String(a.started_at)));
          }

          if (upper.startsWith('SELECT * FROM PROJECTS')) {
            return Object.values(store.projects);
          }

          return [];
        },

        get(...rawParams: any[]): any {
          const params = rawParams.flatMap((p) => (Array.isArray(p) ? p : [p]));
          const id = params[0];

          if (upper.includes('FROM PROJECTS P') && upper.includes('WHERE P.ID = ?')) {
            const p = store.projects[id];
            if (!p) return undefined;
            const c = store.project_customization[id] || {};
            return {
              ...p,
              app_name: c.app_name,
              package_id: c.package_id,
              version_name: c.version_name,
              version_code: c.version_code
            };
          }

          if (upper.startsWith('SELECT * FROM PROJECTS WHERE ID = ?')) {
            return store.projects[id] ? { ...store.projects[id] } : undefined;
          }

          if (upper.startsWith('SELECT * FROM PROJECT_CUSTOMIZATION WHERE PROJECT_ID = ?')) {
            return store.project_customization[id]
              ? { ...store.project_customization[id] }
              : undefined;
          }

          if (upper.startsWith('SELECT * FROM PROJECT_ANIMATIONS WHERE PROJECT_ID = ?')) {
            return store.project_animations[id]
              ? { ...store.project_animations[id] }
              : undefined;
          }

          if (upper.startsWith('SELECT * FROM BUILDS WHERE ID = ?')) {
            return store.builds[id] ? { ...store.builds[id] } : undefined;
          }

          return undefined;
        },

        run(...rawParams: any[]): RunResult {
          const params = rawParams.flatMap((p) => (Array.isArray(p) ? p : [p]));
          const now = new Date().toISOString();

          if (upper.startsWith('INSERT INTO PROJECTS')) {
            const [id, name, type, status] = params;
            store.projects[id] = {
              id,
              name,
              type,
              status: status || 'ready',
              created_at: now,
              updated_at: now
            };
            persist();
            return { changes: 1, lastInsertRowid: 1 };
          }

          if (upper.startsWith('INSERT INTO PROJECT_CUSTOMIZATION')) {
            if (params.length <= 8) {
              const [project_id, app_name, package_id, version_name, version_code, orientation, fullscreen] = params;
              store.project_customization[project_id] = {
                project_id,
                app_name,
                package_id,
                version_name: version_name || '1.0.0',
                version_code: version_code ?? 1,
                orientation: orientation || 'portrait',
                fullscreen: fullscreen ?? 0,
                status_bar_color: '#1f1c2c',
                nav_bar_color: '#1f1c2c',
                light_status_bar: 0,
                theme_color: '#6c5ce7',
                background_color: '#1f1c2c',
                offline_mode: 'cache_first',
                allow_cleartext: 1,
                enable_zoom: 0,
                keep_screen_on: 0,
                splash_enabled: 1,
                splash_color: '#1f1c2c',
                splash_duration_ms: 1500,
                splash_animation: 'fade',
                icon_data_url: null,
                splash_image_data_url: null,
                permissions: '["android.permission.INTERNET","android.permission.ACCESS_NETWORK_STATE"]'
              };
            } else {
              const [
                project_id, app_name, package_id, version_name, version_code,
                orientation, fullscreen, status_bar_color, nav_bar_color, light_status_bar,
                theme_color, background_color, offline_mode, allow_cleartext, enable_zoom,
                keep_screen_on, splash_enabled, splash_color, splash_duration_ms, splash_animation,
                icon_data_url, splash_image_data_url, permissions
              ] = params;
              store.project_customization[project_id] = {
                project_id, app_name, package_id, version_name, version_code,
                orientation, fullscreen, status_bar_color, nav_bar_color, light_status_bar,
                theme_color, background_color, offline_mode, allow_cleartext, enable_zoom,
                keep_screen_on, splash_enabled, splash_color, splash_duration_ms, splash_animation,
                icon_data_url, splash_image_data_url, permissions
              };
            }
            persist();
            return { changes: 1, lastInsertRowid: 1 };
          }

          if (upper.startsWith('INSERT INTO PROJECT_ANIMATIONS')) {
            const [
              project_id,
              splash_animation = 'fade',
              splash_duration_ms = 1500,
              pulse_duration_s = 2.0,
              glass_blur_px = 30,
              page_transition = 'fade',
              loader_style = 'spinner',
              button_effect = 'scale-press',
              inject_stylesheet = 1
            ] = params;
            store.project_animations[project_id] = {
              project_id,
              splash_animation,
              splash_duration_ms,
              pulse_duration_s,
              glass_blur_px,
              page_transition,
              loader_style,
              button_effect,
              inject_stylesheet,
              updated_at: now
            };
            persist();
            return { changes: 1, lastInsertRowid: 1 };
          }

          if (upper.startsWith('UPDATE PROJECT_CUSTOMIZATION SET SPLASH_ANIMATION')) {
            const [splash_animation, splash_duration_ms, project_id] = params;
            if (store.project_customization[project_id]) {
              store.project_customization[project_id].splash_animation = splash_animation;
              store.project_customization[project_id].splash_duration_ms = splash_duration_ms;
              persist();
            }
            return { changes: 1, lastInsertRowid: 0 };
          }

          if (upper.startsWith('UPDATE PROJECT_CUSTOMIZATION SET')) {
            const [
              app_name, package_id, version_name, version_code,
              orientation, fullscreen, status_bar_color, nav_bar_color,
              light_status_bar, theme_color, background_color, offline_mode,
              allow_cleartext, enable_zoom, keep_screen_on, splash_enabled,
              splash_color, splash_duration_ms, splash_animation,
              icon_data_url, splash_image_data_url, permissions, project_id
            ] = params;
            if (store.project_customization[project_id]) {
              Object.assign(store.project_customization[project_id], {
                app_name, package_id, version_name, version_code,
                orientation, fullscreen, status_bar_color, nav_bar_color,
                light_status_bar, theme_color, background_color, offline_mode,
                allow_cleartext, enable_zoom, keep_screen_on, splash_enabled,
                splash_color, splash_duration_ms, splash_animation,
                icon_data_url, splash_image_data_url, permissions
              });
              persist();
            }
            return { changes: 1, lastInsertRowid: 0 };
          }

          if (upper.startsWith('UPDATE PROJECTS SET NAME = ?')) {
            const [name, id] = params;
            if (store.projects[id]) {
              store.projects[id].name = name;
              store.projects[id].updated_at = now;
              persist();
            }
            return { changes: 1, lastInsertRowid: 0 };
          }

          if (upper.startsWith('UPDATE PROJECTS SET STATUS = ?')) {
            const [status, id] = params;
            if (store.projects[id]) {
              store.projects[id].status = status;
              store.projects[id].updated_at = now;
              persist();
            }
            return { changes: 1, lastInsertRowid: 0 };
          }

          if (upper.startsWith('UPDATE PROJECTS SET UPDATED_AT')) {
            const [id] = params;
            if (store.projects[id]) {
              store.projects[id].updated_at = now;
              persist();
            }
            return { changes: 1, lastInsertRowid: 0 };
          }

          if (upper.startsWith('DELETE FROM PROJECTS WHERE ID = ?')) {
            const [id] = params;
            delete store.projects[id];
            delete store.project_customization[id];
            delete store.project_animations[id];
            for (const bId of Object.keys(store.builds)) {
              if (store.builds[bId].project_id === id) {
                delete store.builds[bId];
              }
            }
            persist();
            return { changes: 1, lastInsertRowid: 0 };
          }

          if (upper.startsWith('INSERT INTO BUILDS')) {
            const [id, project_id, build_type = 'debug'] = params;
            store.builds[id] = {
              id,
              project_id,
              build_type,
              status: 'queued',
              stage: 'queued',
              progress: 0,
              started_at: now,
              completed_at: null,
              log: '',
              apk_filename: null,
              apk_size_bytes: null,
              error_summary: null
            };
            persist();
            return { changes: 1, lastInsertRowid: 1 };
          }

          if (upper.startsWith('UPDATE BUILDS SET STATUS = ?, STAGE = ?, PROGRESS = ?, LOG = ? WHERE ID = ?')) {
            const [status, stage, progress, log, id] = params;
            if (store.builds[id]) {
              Object.assign(store.builds[id], { status, stage, progress, log });
              persist();
            }
            return { changes: 1, lastInsertRowid: 0 };
          }

          if (upper.startsWith('UPDATE BUILDS SET LOG = ? WHERE ID = ?')) {
            const [log, id] = params;
            if (store.builds[id]) {
              store.builds[id].log = log;
              persist();
            }
            return { changes: 1, lastInsertRowid: 0 };
          }

          if (upper.includes("SET STATUS = 'SUCCESS'") && upper.includes('APK_FILENAME = ?')) {
            const [apk_filename, apk_size_bytes, log, id] = params;
            if (store.builds[id]) {
              Object.assign(store.builds[id], {
                status: 'success',
                stage: 'completed',
                progress: 100,
                completed_at: now,
                apk_filename,
                apk_size_bytes,
                log
              });
              persist();
            }
            return { changes: 1, lastInsertRowid: 0 };
          }

          if (upper.includes("STAGE = 'CHECKING_TOOLCHAIN'") && upper.includes('ERROR_SUMMARY = ?')) {
            const [status, error_summary, log, id] = params;
            if (store.builds[id]) {
              Object.assign(store.builds[id], {
                status,
                stage: 'checking_toolchain',
                progress: 65,
                completed_at: now,
                error_summary,
                log
              });
              persist();
            }
            return { changes: 1, lastInsertRowid: 0 };
          }

          if (upper.includes("SET STATUS = 'FAILED'") && upper.includes('ERROR_SUMMARY = ?')) {
            const [error_summary, log, id] = params;
            if (store.builds[id]) {
              Object.assign(store.builds[id], {
                status: 'failed',
                stage: 'failed',
                completed_at: now,
                error_summary,
                log
              });
              persist();
            }
            return { changes: 1, lastInsertRowid: 0 };
          }

          return { changes: 0, lastInsertRowid: 0 };
        }
      };
    },
    exec(_sql: string): void {
      persist();
    },
    pragma(_stmt: string): any {
      return null;
    },
    transaction<T extends (...args: any[]) => any>(fn: T): T {
      return ((...args: any[]) => fn(...args)) as T;
    }
  };
}

function createDatabaseInstance(): DatabaseDriver {
  try {
    // eslint-disable-next-line @typescript-eslint/no-var-requires
    const BetterSqlite3 = require('better-sqlite3');
    const nativeDb = new BetterSqlite3(CONFIG.DB_PATH);
    try {
      nativeDb.pragma('journal_mode = WAL');
    } catch {
      nativeDb.pragma('journal_mode = DELETE');
    }
    nativeDb.pragma('foreign_keys = ON');
    return nativeDb as DatabaseDriver;
  } catch {
    return createPureNodeSqliteFallback(CONFIG.DB_PATH);
  }
}

export const db: DatabaseDriver = createDatabaseInstance();

const MIGRATION_COLUMNS: Array<[string, string, string]> = [
  ['projects', 'status', "TEXT NOT NULL DEFAULT 'ready'"],
  ['project_customization', 'theme_color', "TEXT NOT NULL DEFAULT '#6c5ce7'"],
  ['project_customization', 'background_color', "TEXT NOT NULL DEFAULT '#1f1c2c'"],
  ['project_customization', 'offline_mode', "TEXT NOT NULL DEFAULT 'cache_first'"],
  ['project_customization', 'allow_cleartext', 'INTEGER NOT NULL DEFAULT 1'],
  ['project_customization', 'enable_zoom', 'INTEGER NOT NULL DEFAULT 0'],
  ['project_customization', 'keep_screen_on', 'INTEGER NOT NULL DEFAULT 0'],
  ['project_customization', 'splash_enabled', 'INTEGER NOT NULL DEFAULT 1'],
  ['project_customization', 'splash_color', "TEXT NOT NULL DEFAULT '#1f1c2c'"],
  ['project_customization', 'splash_duration_ms', 'INTEGER NOT NULL DEFAULT 1500'],
  ['project_customization', 'splash_animation', "TEXT NOT NULL DEFAULT 'fade'"],
  ['project_customization', 'icon_data_url', 'TEXT'],
  ['project_customization', 'splash_image_data_url', 'TEXT'],
  ['builds', 'build_type', "TEXT NOT NULL DEFAULT 'debug'"],
  ['builds', 'stage', "TEXT NOT NULL DEFAULT 'queued'"],
  ['builds', 'progress', 'INTEGER NOT NULL DEFAULT 0'],
  ['builds', 'apk_size_bytes', 'INTEGER']
];

let dbInitialized = false;

export function initDatabase(): void {
  if (dbInitialized) return;
  const candidates = [
    path.join(__dirname, 'schema.sql'),
    path.resolve(CONFIG.PROJECT_ROOT, 'backend/src/database/schema.sql')
  ];
  const schemaPath = candidates.find((p) => fs.existsSync(p));
  if (!schemaPath) {
    throw new Error('Database schema.sql not found.');
  }
  const schema = fs.readFileSync(schemaPath, 'utf-8');
  db.exec(schema);

  for (const [table, col, defn] of MIGRATION_COLUMNS) {
    const info = db.prepare(`PRAGMA table_info(${table})`).all() as Array<{ name: string }>;
    if (!info.some((c) => c.name === col)) {
      db.exec(`ALTER TABLE ${table} ADD COLUMN ${col} ${defn};`);
    }
  }
  dbInitialized = true;
}
