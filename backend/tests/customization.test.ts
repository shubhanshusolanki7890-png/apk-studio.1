import { validateCustomizationInput, validatePackageId } from '../src/validators/project.validator';
import { initDatabase } from '../src/database/db';
import { ProjectsController } from '../src/controllers/projects.controller';
import { StorageService } from '../src/services/storage.service';

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

describe('Customization & Animation Studio Validation and Persistence', () => {
  let projectId = '';

  beforeAll(() => {
    initDatabase();
    const res = createMockRes();
    ProjectsController.create({ body: { name: 'CustomApp', type: 'html' } }, res);
    projectId = res.body.id;
  });

  afterAll(() => {
    if (projectId) {
      ProjectsController.delete({ params: { id: projectId } }, createMockRes());
    }
  });

  it('rejects invalid Android package IDs and reserved Java keywords', () => {
    expect(validatePackageId('singleword').valid).toBe(false);
    expect(validatePackageId('com.123invalid.app').valid).toBe(false);
    expect(validatePackageId('com.int.app').valid).toBe(false);
    expect(validatePackageId('com.apkstudio.valid_app2').valid).toBe(true);
  });

  it('rejects invalid hex colors and unwhitelisted Android permissions', () => {
    const bad = validateCustomizationInput({
      app_name: 'Valid Name',
      package_id: 'com.apkstudio.valid',
      version_name: '1.0.0',
      version_code: 1,
      orientation: 'portrait',
      status_bar_color: 'not-a-color',
      permissions: ['android.permission.BRICK_DEVICE']
    });
    expect(bad.valid).toBe(false);
    expect(bad.errors.length).toBe(2);
  });

  it('persists customization and Animation Studio stylesheet into project workspace', () => {
    const custRes = createMockRes();
    ProjectsController.updateCustomization(
      {
        params: { id: projectId },
        body: {
          app_name: 'Liquid Weather',
          package_id: 'com.apkstudio.weather',
          version_name: '2.1.0',
          version_code: 5,
          orientation: 'landscape',
          fullscreen: true,
          status_bar_color: '#112233',
          nav_bar_color: '#112233',
          theme_color: '#00ffc8',
          background_color: '#112233',
          splash_color: '#112233',
          offline_mode: 'cache_first',
          permissions: ['android.permission.INTERNET', 'android.permission.VIBRATE']
        }
      },
      custRes
    );
    expect(custRes.statusCode).toBe(200);
    expect(custRes.body.customization.package_id).toBe('com.apkstudio.weather');
    expect(custRes.body.customization.version_code).toBe(5);
    expect(custRes.body.customization.fullscreen).toBe(true);

    const animRes = createMockRes();
    ProjectsController.updateAnimations(
      {
        params: { id: projectId },
        body: {
          splash_animation: 'scale',
          splash_duration_ms: 1800,
          pulse_duration_s: 1.5,
          glass_blur_px: 42,
          page_transition: 'slide-up',
          loader_style: 'pulse-ring',
          button_effect: 'glow-hover',
          inject_stylesheet: true
        }
      },
      animRes
    );
    expect(animRes.statusCode).toBe(200);
    expect(animRes.body.animations.glass_blur_px).toBe(42);

    const cssFile = StorageService.readFile(projectId, 'apk_studio_animations.css');
    expect(cssFile.content).toContain('--apk-studio-glass-blur: 42px');
  });
});
