import { PythonService } from '../src/services/python.service';
import fs from 'fs';
import { removeDirSync } from '../src/utils/fsUtils';
import path from 'path';

describe('PythonService Project Analyzer & Bridge Generator', () => {
  const testPyDir = path.join(__dirname, 'py_test_project');

  beforeAll(() => {
    fs.mkdirSync(testPyDir, { recursive: true });
  });

  afterAll(() => {
    removeDirSync(testPyDir);
  });

  it('rejects unsupported desktop GUI library imports like tkinter as unsupported', async () => {
    fs.writeFileSync(path.join(testPyDir, 'main.py'), 'import tkinter\nroot = tkinter.Tk()');
    const result = await PythonService.inspectProject(testPyDir);
    expect(result.supported).toBe(false);
    expect(result.classification).toBe('unsupported');
    expect(result.unsupported_modules.length).toBeGreaterThan(0);
  });

  it('classifies clean script missing index.html bridge as requires_modification', async () => {
    const indexHtml = path.join(testPyDir, 'index.html');
    if (fs.existsSync(indexHtml)) fs.unlinkSync(indexHtml);
    fs.writeFileSync(path.join(testPyDir, 'main.py'), 'import json\nimport math\nprint(math.pi)');
    const result = await PythonService.inspectProject(testPyDir);
    expect(result.supported).toBe(true);
    expect(result.classification).toBe('requires_modification');
    expect(result.entrypoint).toBe('main.py');
    expect(result.has_html_bridge).toBe(false);
  });

  it('generates an HTML WebView bridge and upgrades classification to supported', async () => {
    await PythonService.generateWebViewBridge(testPyDir, 'CalcApp', 'main.py');
    expect(fs.existsSync(path.join(testPyDir, 'index.html'))).toBe(true);

    const result = await PythonService.inspectProject(testPyDir);
    expect(result.supported).toBe(true);
    expect(result.classification).toBe('supported');
    expect(result.has_html_bridge).toBe(true);
  });
});
