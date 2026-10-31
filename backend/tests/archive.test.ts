import { ArchiveService } from '../src/services/archive.service';
import fs from 'fs';
import { removeDirSync } from '../src/utils/fsUtils';
import path from 'path';
import { spawnSync } from 'child_process';

describe('ArchiveService (ZIP Extraction & Security)', () => {
  const tmpDir = path.join(__dirname, 'tmp_archive_test');

  beforeAll(() => {
    fs.mkdirSync(tmpDir, { recursive: true });
  });

  afterAll(() => {
    removeDirSync(tmpDir);
  });

  it('safely rejects corrupted or non-existent zip archives', async () => {
    await expect(ArchiveService.safeExtract('invalid_path.zip', tmpDir))
      .rejects.toThrow();
  });

  it('blocks malicious Zip-Slip path traversal entries (../outside.txt)', async () => {
    const maliciousZip = path.join(tmpDir, 'malicious.zip');
    const pyCreateMalicious = `
import zipfile, sys
with zipfile.ZipFile(sys.argv[1], 'w') as zf:
    zf.writestr('../escaped.txt', 'pwned')
`;
    spawnSync('python3', ['-c', pyCreateMalicious, maliciousZip]);

    const extractDest = path.join(tmpDir, 'extract_malicious');
    await expect(ArchiveService.safeExtract(maliciousZip, extractDest))
      .rejects.toThrow('Malicious zip entry path detected');
  });

  it('flattens single-root wrapper folders and preserves nested assets while skipping .exe files', async () => {
    const validZip = path.join(tmpDir, 'website.zip');
    const pyCreateValid = `
import zipfile, sys
with zipfile.ZipFile(sys.argv[1], 'w') as zf:
    zf.writestr('my-site-folder/index.html', '<h1>Hello</h1>')
    zf.writestr('my-site-folder/css/style.css', 'body { color: #fff; }')
    zf.writestr('my-site-folder/malware.exe', 'MZ...')
`;
    spawnSync('python3', ['-c', pyCreateValid, validZip]);

    const extractDest = path.join(tmpDir, 'extract_valid');
    const res = await ArchiveService.safeExtractDetailed(validZip, extractDest);

    expect(res.flattenedRoot).toBe(true);
    expect(res.extractedFiles).toContain('index.html');
    expect(res.extractedFiles).toContain('css/style.css');
    expect(res.skippedUnsupportedFiles.length).toBe(1);
    expect(fs.existsSync(path.join(extractDest, 'index.html'))).toBe(true);
    expect(fs.existsSync(path.join(extractDest, 'css/style.css'))).toBe(true);
  });
});
