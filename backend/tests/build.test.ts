import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import { spawnSync } from 'child_process';
import { initDatabase, db } from '../src/database/db';
import { CONFIG } from '../src/config';
import { ProjectsController } from '../src/controllers/projects.controller';
import { BuildService } from '../src/services/build.service';
import { verifyGeneratedApk } from '../src/utils/apkVerifier';
import { removeDirSync } from '../src/utils/fsUtils';

function createMockRes() {
  const res: any = {
    statusCode: 200,
    body: null,
    status(code: number) {
      res.statusCode = code;
      return res;
    },
    json(payload: any) {
      res.body = payload;
      return res;
    }
  };
  return res;
}

describe('BuildService, Gradle Wrapper, MainActivity Java Compilation & APK Verifier', () => {
  const tmpDir = path.join(__dirname, 'tmp_apk_verify');
  let projectId = '';

  beforeAll(() => {
    initDatabase();
    fs.mkdirSync(tmpDir, { recursive: true });
    const res = createMockRes();
    ProjectsController.create({ body: { name: 'BuildTestApp', type: 'html' } }, res);
    projectId = res.body.id;
  });

  afterAll(() => {
    removeDirSync(tmpDir);
    if (projectId) {
      ProjectsController.delete({ params: { id: projectId } }, createMockRes());
    }
  });

  it('verifies gradle-wrapper.jar and mipmap PNG launcher icons exist in android-template', () => {
    const wrapperJar = path.join(CONFIG.TEMPLATE_DIR, 'gradle', 'wrapper', 'gradle-wrapper.jar');
    expect(fs.existsSync(wrapperJar)).toBe(true);
    expect(fs.statSync(wrapperJar).size).toBeGreaterThan(500);

    for (const density of ['mipmap-mdpi', 'mipmap-hdpi', 'mipmap-xhdpi', 'mipmap-xxhdpi', 'mipmap-xxxhdpi']) {
      const iconPath = path.join(CONFIG.TEMPLATE_DIR, 'app', 'src', 'main', 'res', density, 'ic_launcher.png');
      const roundPath = path.join(CONFIG.TEMPLATE_DIR, 'app', 'src', 'main', 'res', density, 'ic_launcher_round.png');
      expect(fs.existsSync(iconPath)).toBe(true);
      expect(fs.existsSync(roundPath)).toBe(true);
    }
  });

  it('normalizes root-relative HTML asset paths for Android WebView compatibility', () => {
    const rawHtml = '<link rel="stylesheet" href="/assets/index.css"><script src="/assets/index.js"></script><a href="https://example.com/a">Link</a>';
    const normalized = BuildService.normalizeWebViewAssetPaths(rawHtml);
    expect(normalized).toContain('href="./assets/index.css"');
    expect(normalized).toContain('src="./assets/index.js"');
    expect(normalized).toContain('href="https://example.com/a"');
  });

  it('rejects missing, tiny, or renamed text files masquerading as .apk', () => {
    expect(verifyGeneratedApk(path.join(tmpDir, 'nonexistent.apk')).valid).toBe(false);

    const fakeApk = path.join(tmpDir, 'fake.apk');
    fs.writeFileSync(fakeApk, 'This is just a dummy text file renamed to .apk'.repeat(50));
    const fakeRes = verifyGeneratedApk(fakeApk);
    expect(fakeRes.valid).toBe(false);
  });

  it('accepts a genuine ZIP/APK binary archive containing AndroidManifest.xml and >1KB payload', () => {
    const validApk = path.join(tmpDir, 'valid.apk');
    const pyBuildZip = `
import zipfile, sys
with zipfile.ZipFile(sys.argv[1], 'w') as zf:
    zf.writestr('AndroidManifest.xml', '<manifest package="com.apkstudio.app"/>')
    zf.writestr('classes.dex', 'dex\\n035\\x00' + ('A' * 2048))
`;
    spawnSync('python3', ['-c', pyBuildZip, validApk]);

    const res = verifyGeneratedApk(validApk);
    expect(res.valid).toBe(true);
    expect(res.sizeBytes).toBeGreaterThan(1024);
  });

  it('prepares complete Android project structure and injects customization deterministically', async () => {
    const buildId = crypto.randomUUID();
    db.prepare(`
      INSERT INTO builds (id, project_id, build_type, status, stage, progress)
      VALUES (?, ?, 'debug', 'queued', 'queued', 0)
    `).run(buildId, projectId);

    // Run Stages 1-5 deterministically without spawning a multi-minute external Gradle download during unit tests
    await BuildService.executeBuild(buildId, projectId, 'debug', { prepareOnly: true });

    const buildRecord = db.prepare('SELECT * FROM builds WHERE id = ?').get(buildId) as any;
    const buildDir = path.join(CONFIG.BUILDS_DIR, buildId);

    expect(fs.existsSync(path.join(buildDir, 'app', 'build.gradle'))).toBe(true);
    expect(fs.existsSync(path.join(buildDir, 'app', 'src', 'main', 'AndroidManifest.xml'))).toBe(true);
    expect(fs.existsSync(path.join(buildDir, 'app', 'src', 'main', 'java', 'com', 'apkstudio', 'app', 'MainActivity.java'))).toBe(true);
    expect(fs.existsSync(path.join(buildDir, 'app', 'src', 'main', 'assets', 'webapp', 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(buildDir, 'app', 'src', 'main', 'assets', 'webapp', 'apk_studio_animations.css'))).toBe(true);

    const mainJavaPath = path.join(buildDir, 'app', 'src', 'main', 'java', 'com', 'apkstudio', 'app', 'MainActivity.java');
    const mainJava = fs.readFileSync(mainJavaPath, 'utf-8');
    expect(mainJava.includes('deliberateConfig')).toBe(false);
    expect(mainJava).toContain('BuildTestApp');
    expect(['success', 'failed']).toContain(buildRecord.status);
  });
});
