import fs from 'fs';

export interface ApkVerificationResult {
  valid: boolean;
  sizeBytes: number;
  reason?: string;
}

/**
 * Verifies that a generated APK file exists on disk, has a plausible non-zero size,
 * begins with the standard ZIP/APK magic header (PK\x03\x04), and contains AndroidManifest.xml.
 */
export function verifyGeneratedApk(apkPath: string): ApkVerificationResult {
  if (!fs.existsSync(apkPath)) {
    return {
      valid: false,
      sizeBytes: 0,
      reason: `APK file does not exist at path: ${apkPath}`
    };
  }

  const stats = fs.statSync(apkPath);
  if (!stats.isFile() || stats.size < 1024) {
    return {
      valid: false,
      sizeBytes: stats.size,
      reason: `APK file size (${stats.size} bytes) is implausibly small or empty.`
    };
  }

  const fd = fs.openSync(apkPath, 'r');
  try {
    const header = Buffer.alloc(4);
    fs.readSync(fd, header, 0, 4, 0);
    if (header[0] !== 0x50 || header[1] !== 0x4b || header[2] !== 0x03 || header[3] !== 0x04) {
      return {
        valid: false,
        sizeBytes: stats.size,
        reason: 'Artifact does not have a valid ZIP/APK binary header (PK\\x03\\x04).'
      };
    }

    const fullBuffer = fs.readFileSync(apkPath);
    if (!fullBuffer.includes(Buffer.from('AndroidManifest.xml'))) {
      return {
        valid: false,
        sizeBytes: stats.size,
        reason: 'Archive does not contain a packaged AndroidManifest.xml entry.'
      };
    }

    return {
      valid: true,
      sizeBytes: stats.size
    };
  } finally {
    fs.closeSync(fd);
  }
}
