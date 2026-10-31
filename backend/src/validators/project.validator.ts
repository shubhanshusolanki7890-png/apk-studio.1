const JAVA_KEYWORDS = new Set([
  'abstract', 'assert', 'boolean', 'break', 'byte', 'case', 'catch', 'char',
  'class', 'const', 'continue', 'default', 'do', 'double', 'else', 'enum',
  'extends', 'final', 'finally', 'float', 'for', 'goto', 'if', 'implements',
  'import', 'instanceof', 'int', 'interface', 'long', 'native', 'new', 'null',
  'package', 'private', 'protected', 'public', 'return', 'short', 'static',
  'strictfp', 'super', 'switch', 'synchronized', 'this', 'throw', 'throws',
  'transient', 'true', 'false', 'try', 'void', 'volatile', 'while'
]);

export const SUPPORTED_ANDROID_PERMISSIONS = [
  'android.permission.INTERNET',
  'android.permission.ACCESS_NETWORK_STATE',
  'android.permission.ACCESS_WIFI_STATE',
  'android.permission.CAMERA',
  'android.permission.RECORD_AUDIO',
  'android.permission.MODIFY_AUDIO_SETTINGS',
  'android.permission.ACCESS_FINE_LOCATION',
  'android.permission.ACCESS_COARSE_LOCATION',
  'android.permission.VIBRATE',
  'android.permission.WAKE_LOCK',
  'android.permission.POST_NOTIFICATIONS',
  'android.permission.READ_EXTERNAL_STORAGE',
  'android.permission.WRITE_EXTERNAL_STORAGE'
] as const;

export interface ValidationOutcome {
  valid: boolean;
  errors: string[];
}

export function validatePackageId(packageId: string): ValidationOutcome {
  const errors: string[] = [];
  if (!packageId || typeof packageId !== 'string') {
    return { valid: false, errors: ['Package ID is required.'] };
  }
  const trimmed = packageId.trim();
  const segments = trimmed.split('.');
  if (segments.length < 2) {
    errors.push("Package ID must contain at least two dot-separated segments (e.g. 'com.company.app').");
  }
  const segmentRegex = /^[a-zA-Z][a-zA-Z0-9_]*$/;
  for (const seg of segments) {
    if (!segmentRegex.test(seg)) {
      errors.push(`Invalid package segment '${seg}'. Each segment must start with a letter and contain only letters, digits, or underscores.`);
    }
    if (JAVA_KEYWORDS.has(seg.toLowerCase())) {
      errors.push(`Package segment '${seg}' is a reserved Java keyword and cannot be used in an Android package ID.`);
    }
  }
  return { valid: errors.length === 0, errors };
}

export function validateHexColor(color: string, fieldName: string): string | null {
  if (!color || !/^#[0-9A-Fa-f]{6}$/.test(color.trim())) {
    return `${fieldName} must be a valid 6-digit hex color (e.g. #1f1c2c).`;
  }
  return null;
}

export function validateCustomizationInput(body: any): ValidationOutcome {
  const errors: string[] = [];

  if (!body || typeof body !== 'object') {
    return { valid: false, errors: ['Request body must be a JSON object.'] };
  }

  if (!body.app_name || typeof body.app_name !== 'string' || body.app_name.trim().length === 0) {
    errors.push('Application name is required.');
  } else if (body.app_name.trim().length > 64) {
    errors.push('Application name must not exceed 64 characters.');
  }

  const pkgCheck = validatePackageId(body.package_id);
  if (!pkgCheck.valid) {
    errors.push(...pkgCheck.errors);
  }

  if (!body.version_name || typeof body.version_name !== 'string' || !/^[0-9]+(\.[0-9]+){0,3}(-[a-zA-Z0-9._-]+)?$/.test(body.version_name.trim())) {
    errors.push("Version name must follow semantic versioning format (e.g. '1.0.0' or '1.2.0-beta').");
  }

  const vCode = Number(body.version_code);
  if (!Number.isInteger(vCode) || vCode < 1 || vCode > 2100000000) {
    errors.push('Version code must be a positive integer between 1 and 2,100,000,000.');
  }

  if (!['portrait', 'landscape', 'unspecified'].includes(body.orientation)) {
    errors.push("Orientation must be 'portrait', 'landscape', or 'unspecified'.");
  }

  for (const [key, label] of [
    ['status_bar_color', 'Status bar color'],
    ['nav_bar_color', 'Navigation bar color'],
    ['theme_color', 'Theme color'],
    ['background_color', 'Background color'],
    ['splash_color', 'Splash screen color']
  ] as const) {
    if (body[key] !== undefined) {
      const err = validateHexColor(body[key], label);
      if (err) errors.push(err);
    }
  }

  if (body.offline_mode !== undefined && !['cache_first', 'network_first', 'offline_only'].includes(body.offline_mode)) {
    errors.push("Offline mode must be 'cache_first', 'network_first', or 'offline_only'.");
  }

  if (body.splash_duration_ms !== undefined) {
    const dur = Number(body.splash_duration_ms);
    if (!Number.isFinite(dur) || dur < 0 || dur > 15000) {
      errors.push('Splash duration must be between 0 and 15,000 ms.');
    }
  }

  if (body.splash_animation !== undefined && !['fade', 'scale', 'slide', 'pulse', 'none'].includes(body.splash_animation)) {
    errors.push("Splash animation must be 'fade', 'scale', 'slide', 'pulse', or 'none'.");
  }

  if (body.permissions !== undefined) {
    if (!Array.isArray(body.permissions)) {
      errors.push('Permissions must be an array of Android permission strings.');
    } else {
      const allowed = new Set<string>(SUPPORTED_ANDROID_PERMISSIONS);
      for (const perm of body.permissions) {
        if (!allowed.has(perm)) {
          errors.push(`Unsupported or unsafe Android permission: '${perm}'.`);
        }
      }
    }
  }

  return { valid: errors.length === 0, errors };
}
