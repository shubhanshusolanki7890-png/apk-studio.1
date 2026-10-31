import path from 'path';
import fs from 'fs';

function findProjectRoot(startDir: string): string {
  let curr = path.resolve(startDir);
  for (let i = 0; i < 5; i++) {
    if (
      fs.existsSync(path.join(curr, 'build-engine')) &&
      fs.existsSync(path.join(curr, 'package.json'))
    ) {
      return curr;
    }
    const parent = path.dirname(curr);
    if (parent === curr) break;
    curr = parent;
  }
  return path.resolve(startDir, '../..');
}

const PROJECT_ROOT = findProjectRoot(__dirname);

function loadEnvFile(): void {
  const candidates = [
    path.join(PROJECT_ROOT, '.env'),
    path.resolve(process.cwd(), '.env')
  ];
  for (const envPath of candidates) {
    if (fs.existsSync(envPath)) {
      const content = fs.readFileSync(envPath, 'utf-8');
      for (const line of content.split(/\r?\n/)) {
        const trimmed = line.trim();
        if (!trimmed || trimmed.startsWith('#')) continue;
        const eqIdx = trimmed.indexOf('=');
        if (eqIdx > 0) {
          const key = trimmed.slice(0, eqIdx).trim();
          const val = trimmed.slice(eqIdx + 1).trim().replace(/^['"]|['"]$/g, '');
          if (process.env[key] === undefined) {
            process.env[key] = val;
          }
        }
      }
      break;
    }
  }
}

loadEnvFile();

const ROOT_DATA_DIR = process.env.DATA_DIR
  ? path.resolve(PROJECT_ROOT, process.env.DATA_DIR)
  : path.join(PROJECT_ROOT, 'data');

export const CONFIG = {
  PORT: parseInt(process.env.PORT || '4000', 10),
  NODE_ENV: process.env.NODE_ENV || 'development',
  PROJECT_ROOT,
  DATA_DIR: ROOT_DATA_DIR,
  PROJECTS_DIR: path.join(ROOT_DATA_DIR, 'projects'),
  BUILDS_DIR: path.join(ROOT_DATA_DIR, 'builds'),
  DB_PATH: path.join(ROOT_DATA_DIR, 'apk_studio.sqlite'),
  TEMPLATE_DIR: path.join(PROJECT_ROOT, 'build-engine', 'android-template'),
  STARTER_TEMPLATES_DIR: path.join(PROJECT_ROOT, 'build-engine', 'templates'),
  PYTHON_ANALYZER_SCRIPT: path.join(PROJECT_ROOT, 'python-support', 'project_analyzer.py'),
  PYTHON_BRIDGE_SCRIPT: path.join(PROJECT_ROOT, 'python-support', 'webview_bridge_generator.py'),
  ANDROID_HOME: process.env.ANDROID_HOME || process.env.ANDROID_SDK_ROOT || '/opt/android-sdk',
  JAVA_HOME: process.env.JAVA_HOME || '',
  MAX_UPLOAD_SIZE_BYTES: parseInt(process.env.MAX_UPLOAD_SIZE_BYTES || String(50 * 1024 * 1024), 10)
};
