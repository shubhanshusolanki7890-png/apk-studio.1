import JSZip from 'jszip';
import { ProjectFile, StudioProject } from '../types';
import { createDefaultSettings } from './templates';

const TEXT_EXTENSIONS = new Set([
  'html',
  'htm',
  'css',
  'js',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'jsx',
  'json',
  'md',
  'txt',
  'svg',
  'xml',
  'yml',
  'yaml',
  'py',
  'gradle',
  'properties',
  'java',
  'kt',
]);

function getExtension(filePath: string): string {
  const parts = filePath.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function getMimeType(filePath: string): string {
  const ext = getExtension(filePath);
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    case 'json':
      return 'application/json';
    case 'html':
    case 'htm':
      return 'text/html';
    case 'css':
      return 'text/css';
    case 'js':
      return 'application/javascript';
    default:
      return 'application/octet-stream';
  }
}

export function sanitizeArchivePath(rawPath: string): string | null {
  const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!normalized) return null;
  const segments = normalized.split('/');
  if (segments.some((seg) => seg === '..' || seg === '.')) {
    return null;
  }
  return segments.join('/');
}

export async function computeSha256Hex(bytes: Uint8Array): Promise<string> {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', bytes.buffer as ArrayBuffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}

export async function importProjectFromZip(
  file: File,
  onProgress?: (percent: number, currentFile: string) => void
): Promise<StudioProject> {
  const zip = await JSZip.loadAsync(file);
  const entryNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  if (entryNames.length === 0) {
    throw new Error('The uploaded ZIP archive does not contain any files.');
  }

  // Strip common single top-level folder prefix if all files share one
  const sanitizedEntries = entryNames
    .map((raw) => ({ raw, clean: sanitizeArchivePath(raw) }))
    .filter((item): item is { raw: string; clean: string } => Boolean(item.clean));

  if (sanitizedEntries.length === 0) {
    throw new Error('No safe file paths found inside the archive.');
  }

  const firstSegments = new Set(
    sanitizedEntries.map((e) => e.clean.split('/')[0])
  );
  const hasSharedRoot =
    firstSegments.size === 1 &&
    sanitizedEntries.every((e) => e.clean.includes('/'));

  const projectFiles: ProjectFile[] = [];
  const now = Date.now();

  for (let i = 0; i < sanitizedEntries.length; i++) {
    const { raw, clean } = sanitizedEntries[i];
    const relPath = hasSharedRoot
      ? clean.split('/').slice(1).join('/')
      : clean;

    if (!relPath || relPath.startsWith('.git/') || relPath.includes('node_modules/')) {
      continue;
    }

    onProgress?.(Math.round(((i + 1) / sanitizedEntries.length) * 100), relPath);
    const zipObj = zip.files[raw];
    const ext = getExtension(relPath);

    if (TEXT_EXTENSIONS.has(ext) || ext === '') {
      const content = await zipObj.async('string');
      projectFiles.push({
        path: relPath,
        content,
        isBinary: false,
        mimeType: getMimeType(relPath),
        updatedAt: now,
      });
    } else {
      const base64 = await zipObj.async('base64');
      const mime = getMimeType(relPath);
      projectFiles.push({
        path: relPath,
        content: `data:${mime};base64,${base64}`,
        isBinary: true,
        mimeType: mime,
        updatedAt: now,
      });
    }
  }

  if (projectFiles.length === 0) {
    throw new Error('No editable web files found in the archive.');
  }

  // Check if this is an APK Studio backup containing project.apkstudio.json
  const metaFile = projectFiles.find((f) => f.path === 'project.apkstudio.json');
  if (metaFile && !metaFile.isBinary) {
    try {
      const parsed = JSON.parse(metaFile.content) as StudioProject;
      if (parsed && parsed.name && parsed.settings) {
        return {
          ...parsed,
          id: `proj_${now}_${Math.random().toString(36).slice(2, 7)}`,
          updatedAt: now,
          files: projectFiles.filter((f) => f.path !== 'project.apkstudio.json'),
        };
      }
    } catch {
      // Continue as standard web project import
    }
  }

  const baseName = file.name.replace(/\.zip$/i, '').replace(/[^a-zA-Z0-9_-]/g, ' ').trim() || 'Imported App';
  const slug = baseName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'importedapp';
  const entryCandidate =
    projectFiles.find((f) => f.path === 'index.html')?.path ||
    projectFiles.find((f) => f.path.endsWith('/index.html'))?.path ||
    projectFiles.find((f) => f.path.endsWith('.html'))?.path ||
    projectFiles[0].path;

  const settings = createDefaultSettings(baseName, `com.apkstudio.${slug}`);
  settings.entryFile = entryCandidate;

  return {
    id: `proj_${now}_${Math.random().toString(36).slice(2, 7)}`,
    name: baseName,
    description: `Imported from ${file.name} (${projectFiles.length} files)`,
    templateId: 'imported-zip',
    createdAt: now,
    updatedAt: now,
    files: projectFiles,
    settings,
  };
}

export async function exportProjectAsZipBlob(
  project: StudioProject
): Promise<{ blob: Blob; sha256: string; size: number }> {
  const zip = new JSZip();

  for (const file of project.files) {
    if (file.isBinary && file.content.startsWith('data:')) {
      const commaIdx = file.content.indexOf(',');
      const base64Data = commaIdx >= 0 ? file.content.slice(commaIdx + 1) : '';
      zip.file(file.path, base64Data, { base64: true });
    } else {
      zip.file(file.path, file.content);
    }
  }

  zip.file(
    'project.apkstudio.json',
    JSON.stringify(
      {
        id: project.id,
        name: project.name,
        description: project.description,
        templateId: project.templateId,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        settings: project.settings,
      },
      null,
      2
    )
  );

  const uint8 = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const sha256 = await computeSha256Hex(uint8);
  const blob = new Blob([uint8.buffer as ArrayBuffer], { type: 'application/zip' });
  return { blob, sha256, size: uint8.byteLength };
}

export function triggerBrowserDownload(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
