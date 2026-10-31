import fs from 'fs';
import path from 'path';
import { CONFIG } from '../config';
import { copyDirSync, removeDirSync } from '../utils/fsUtils';

export interface FileTreeNode {
  name: string;
  path: string;
  isDirectory: boolean;
  size?: number;
  isBinary?: boolean;
  children?: FileTreeNode[];
}

const BINARY_EXTENSIONS = new Set([
  '.png', '.jpg', '.jpeg', '.gif', '.webp', '.ico', '.bmp',
  '.woff', '.woff2', '.ttf', '.otf', '.eot',
  '.mp3', '.wav', '.ogg', '.mp4', '.webm',
  '.pdf', '.zip', '.gz', '.tar', '.wasm', '.pyc', '.so', '.jar', '.apk'
]);

const UNSUPPORTED_WEB_EXTENSIONS = new Set([
  '.exe', '.dll', '.msi', '.bat', '.cmd', '.com', '.scr', '.vbs', '.dmg', '.pkg'
]);

export class StorageService {
  public static validateProjectId(projectId: string): void {
    if (!projectId || !/^[a-zA-Z0-9_-]+$/.test(projectId)) {
      throw new Error('Invalid project identifier.');
    }
  }

  public static getProjectPath(projectId: string): string {
    this.validateProjectId(projectId);
    const p = path.join(CONFIG.PROJECTS_DIR, projectId);
    if (!fs.existsSync(p)) {
      fs.mkdirSync(p, { recursive: true });
    }
    return p;
  }

  public static resolveSafeProjectFile(projectId: string, relativeFilePath: string): string {
    if (!relativeFilePath || typeof relativeFilePath !== 'string') {
      throw new Error('File path is required.');
    }
    if (relativeFilePath.includes('\0')) {
      throw new Error('Access denied: Null byte in path.');
    }
    const base = path.resolve(this.getProjectPath(projectId));
    const cleanedRel = relativeFilePath.replace(/^[/\\]+/, '');
    const target = path.resolve(base, cleanedRel);

    if (target !== base && !target.startsWith(base + path.sep)) {
      throw new Error('Access denied: Path traversal detected.');
    }
    return target;
  }

  public static isBinaryFile(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return BINARY_EXTENSIONS.has(ext);
  }

  public static isUnsupportedExtension(filePath: string): boolean {
    const ext = path.extname(filePath).toLowerCase();
    return UNSUPPORTED_WEB_EXTENSIONS.has(ext);
  }

  public static getFileTree(dir: string, relativeRoot = ''): FileTreeNode[] {
    if (!fs.existsSync(dir)) return [];
    const result: FileTreeNode[] = [];
    const names = fs.readdirSync(dir).filter((n) => !n.startsWith('.'));

    const withStats = names.map((name) => {
      const fullPath = path.join(dir, name);
      const stats = fs.statSync(fullPath);
      return { name, fullPath, isDir: stats.isDirectory(), size: stats.size };
    });

    withStats.sort((a, b) => {
      if (a.isDir && !b.isDir) return -1;
      if (!a.isDir && b.isDir) return 1;
      return a.name.localeCompare(b.name);
    });

    for (const item of withStats) {
      const relPath = path.posix.join(relativeRoot, item.name);
      if (item.isDir) {
        result.push({
          name: item.name,
          path: relPath,
          isDirectory: true,
          children: this.getFileTree(item.fullPath, relPath)
        });
      } else {
        result.push({
          name: item.name,
          path: relPath,
          isDirectory: false,
          size: item.size,
          isBinary: this.isBinaryFile(item.name)
        });
      }
    }
    return result;
  }

  public static readFile(projectId: string, relativeFilePath: string): { content: string; isBinary: boolean } {
    const target = this.resolveSafeProjectFile(projectId, relativeFilePath);
    if (!fs.existsSync(target) || fs.statSync(target).isDirectory()) {
      throw new Error(`File not found: ${relativeFilePath}`);
    }
    if (this.isBinaryFile(target)) {
      const buf = fs.readFileSync(target);
      return {
        content: `/* Binary asset (${path.basename(target)}, ${buf.length} bytes) */`,
        isBinary: true
      };
    }
    return {
      content: fs.readFileSync(target, 'utf-8'),
      isBinary: false
    };
  }

  public static writeFile(projectId: string, relativeFilePath: string, content: string | Buffer): void {
    if (this.isUnsupportedExtension(relativeFilePath)) {
      throw new Error(`Unsupported executable file type: ${path.extname(relativeFilePath)}`);
    }
    const target = this.resolveSafeProjectFile(projectId, relativeFilePath);
    const base = path.resolve(this.getProjectPath(projectId));
    if (target === base) {
      throw new Error('Cannot overwrite root project directory.');
    }
    fs.mkdirSync(path.dirname(target), { recursive: true });
    if (Buffer.isBuffer(content)) {
      fs.writeFileSync(target, content);
    } else {
      fs.writeFileSync(target, content, 'utf-8');
    }
  }

  public static deleteFile(projectId: string, relativeFilePath: string): void {
    const target = this.resolveSafeProjectFile(projectId, relativeFilePath);
    const base = path.resolve(this.getProjectPath(projectId));
    if (target === base) {
      throw new Error('Cannot delete root project directory.');
    }
    if (!fs.existsSync(target)) {
      throw new Error(`File or folder not found: ${relativeFilePath}`);
    }
    removeDirSync(target);
  }

  public static copyProjectFiles(sourceProjectId: string, targetProjectId: string): void {
    const src = this.getProjectPath(sourceProjectId);
    const dest = this.getProjectPath(targetProjectId);
    copyDirSync(src, dest);
  }

  public static deleteProjectDirectory(projectId: string): void {
    this.validateProjectId(projectId);
    const p = path.join(CONFIG.PROJECTS_DIR, projectId);
    if (fs.existsSync(p)) {
      removeDirSync(p);
    }
  }
}
