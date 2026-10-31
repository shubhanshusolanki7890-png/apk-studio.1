import fs from 'fs';
import path from 'path';
import { spawnSync } from 'child_process';
import { CONFIG } from '../config';

export interface ArchiveExtractionResult {
  extractedFiles: string[];
  skippedUnsupportedFiles: string[];
  flattenedRoot: boolean;
}

const PYTHON_ZIP_EXTRACTOR = `
import sys, os, json, zipfile, shutil

payload = json.loads(sys.stdin.read())
zip_path = payload["zipPath"]
dest_dir = os.path.abspath(payload["destDir"])
max_bytes = payload.get("maxBytes", 100 * 1024 * 1024)

unsupported_exts = {".exe", ".dll", ".msi", ".bat", ".cmd", ".com", ".scr", ".vbs", ".dmg", ".pkg"}

if not os.path.exists(zip_path):
    print(json.dumps({"ok": False, "error": f"Archive file does not exist: {zip_path}"}))
    sys.exit(0)

try:
    with zipfile.ZipFile(zip_path, "r") as zf:
        infos = zf.infolist()
        total_size = 0
        valid_entries = []
        skipped = []

        for info in infos:
            raw_name = info.filename.replace("\\\\", "/")
            if raw_name.startswith("__MACOSX/") or raw_name.endswith(".DS_Store"):
                continue

            # Detect path traversal (Zip-Slip)
            norm_rel = os.path.normpath(raw_name)
            if norm_rel.startswith("..") or norm_rel.startswith("/") or ":" in norm_rel:
                print(json.dumps({"ok": False, "error": f"Malicious zip entry path detected: {raw_name}"}))
                sys.exit(0)

            target_check = os.path.abspath(os.path.join(dest_dir, norm_rel))
            if target_check != dest_dir and not target_check.startswith(dest_dir + os.sep):
                print(json.dumps({"ok": False, "error": f"Malicious zip entry path detected: {raw_name}"}))
                sys.exit(0)

            # Check symlink unix mode (0o120000)
            if (info.external_attr >> 16) & 0o170000 == 0o120000:
                print(json.dumps({"ok": False, "error": f"Unsafe symbolic link entry in archive: {raw_name}"}))
                sys.exit(0)

            if info.is_dir() or raw_name.endswith("/"):
                continue

            ext = os.path.splitext(raw_name)[1].lower()
            if ext in unsupported_exts:
                skipped.append(raw_name)
                continue

            total_size += info.file_size
            if total_size > max_bytes:
                print(json.dumps({"ok": False, "error": "Archive exceeds maximum allowed uncompressed size."}))
                sys.exit(0)

            valid_entries.append((info, raw_name))

        # Check if all files share a single top-level directory (and index.html is not already at root)
        top_Has_Index = any(name.lower() == "index.html" for _, name in valid_entries)
        first_segments = set(name.split("/")[0] for _, name in valid_entries if "/" in name)
        has_root_files = any("/" not in name for _, name in valid_entries)
        flatten_prefix = ""
        flattened = False

        if not top_Has_Index and not has_root_files and len(first_segments) == 1:
            single_root = list(first_segments)[0]
            flatten_prefix = single_root + "/"
            flattened = True

        extracted = []
        for info, raw_name in valid_entries:
            rel_path = raw_name[len(flatten_prefix):] if flattened and raw_name.startswith(flatten_prefix) else raw_name
            if not rel_path:
                continue
            final_dest = os.path.abspath(os.path.join(dest_dir, rel_path))
            if not final_dest.startswith(dest_dir + os.sep):
                print(json.dumps({"ok": False, "error": f"Malicious zip entry path detected: {raw_name}"}))
                sys.exit(0)

            os.makedirs(os.path.dirname(final_dest), exist_ok=True)
            with zf.open(info, "r") as src, open(final_dest, "wb") as dst:
                shutil.copyfileobj(src, dst)
            extracted.append(rel_path)

        print(json.dumps({
            "ok": True,
            "extractedFiles": extracted,
            "skippedUnsupportedFiles": skipped,
            "flattenedRoot": flattened
        }))
except zipfile.BadZipFile:
    print(json.dumps({"ok": False, "error": "Corrupted or invalid ZIP archive."}))
except Exception as e:
    print(json.dumps({"ok": False, "error": str(e)}))
`;

export class ArchiveService {
  /**
   * Safely extracts a ZIP archive to destDir while preventing Zip-Slip path traversal,
   * rejecting symlinks and oversized archives, filtering unsupported desktop executables,
   * and normalizing single-root wrapper directories.
   */
  public static async safeExtract(zipFilePath: string, destDir: string): Promise<string[]> {
    const detailed = await this.safeExtractDetailed(zipFilePath, destDir);
    return detailed.extractedFiles;
  }

  public static async safeExtractDetailed(zipFilePath: string, destDir: string): Promise<ArchiveExtractionResult> {
    if (!zipFilePath || !fs.existsSync(zipFilePath)) {
      throw new Error(`Archive file not found: ${zipFilePath}`);
    }
    fs.mkdirSync(destDir, { recursive: true });

    const proc = spawnSync('python3', ['-c', PYTHON_ZIP_EXTRACTOR], {
      input: JSON.stringify({
        zipPath: path.resolve(zipFilePath),
        destDir: path.resolve(destDir),
        maxBytes: CONFIG.MAX_UPLOAD_SIZE_BYTES * 2
      }),
      encoding: 'utf-8'
    });

    if (proc.error) {
      throw proc.error;
    }

    const stdout = (proc.stdout || '').trim();
    if (!stdout) {
      throw new Error(proc.stderr || 'Failed to extract ZIP archive');
    }

    const parsed = JSON.parse(stdout);
    if (!parsed.ok) {
      throw new Error(parsed.error || 'Archive extraction failed');
    }

    return {
      extractedFiles: parsed.extractedFiles || [],
      skippedUnsupportedFiles: parsed.skippedUnsupportedFiles || [],
      flattenedRoot: Boolean(parsed.flattenedRoot)
    };
  }
}
