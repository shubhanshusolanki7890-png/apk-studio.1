import fs from 'fs';
import path from 'path';

/**
 * Recursively copies a file or directory using `fs.statSync` so that FUSE/virtual
 * filesystems (where `dirent.isDirectory()` returns DT_UNKNOWN) are handled accurately.
 */
export function copyDirSync(src: string, dest: string): void {
  if (!fs.existsSync(src)) return;
  const stats = fs.statSync(src);
  if (stats.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    const entries = fs.readdirSync(src);
    for (const entry of entries) {
      copyDirSync(path.join(src, entry), path.join(dest, entry));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

/**
 * Recursively deletes a file or directory using `fs.statSync` so that nested
 * directories on FUSE/virtual mounts are removed cleanly without ENOTEMPTY errors.
 */
export function removeDirSync(target: string): void {
  if (!fs.existsSync(target)) return;
  const stats = fs.statSync(target);
  if (stats.isDirectory()) {
    const entries = fs.readdirSync(target);
    for (const entry of entries) {
      removeDirSync(path.join(target, entry));
    }
    fs.rmdirSync(target);
  } else {
    fs.unlinkSync(target);
  }
}
