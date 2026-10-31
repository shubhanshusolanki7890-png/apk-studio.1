import fs from 'fs';
import path from 'path';
import { db } from '../database/db';
import { StorageService } from '../services/storage.service';
import { ArchiveService } from '../services/archive.service';
import { PythonService } from '../services/python.service';

export class FilesController {
  public static getTree(req: any, res: any): void {
    try {
      const { projectId } = req.params;
      const dir = StorageService.getProjectPath(projectId);
      const tree = StorageService.getFileTree(dir);
      res.json(tree);
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static getContent(req: any, res: any): void {
    const { projectId } = req.params;
    const filePath = req.query.path as string;
    if (!filePath) {
      res.status(400).json({ error: "Query param 'path' required" });
      return;
    }
    try {
      const { content, isBinary } = StorageService.readFile(projectId, filePath);
      res.json({ content, isBinary, path: filePath });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static saveContent(req: any, res: any): void {
    const { projectId } = req.params;
    const { path: filePath, content } = req.body || {};
    if (!filePath || content === undefined) {
      res.status(400).json({ error: "Parameters 'path' and 'content' required" });
      return;
    }
    try {
      StorageService.writeFile(projectId, filePath, String(content));
      db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(projectId);
      res.json({ success: true, path: filePath });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  public static deleteFile(req: any, res: any): void {
    const { projectId } = req.params;
    const filePath = (req.query.path || req.body?.path) as string;
    if (!filePath) {
      res.status(400).json({ error: "Parameter 'path' required" });
      return;
    }
    try {
      StorageService.deleteFile(projectId, filePath);
      db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(projectId);
      res.json({ success: true });
    } catch (err: any) {
      res.status(400).json({ error: err.message });
    }
  }

  /**
   * Imports an individual HTML, CSS, JS, Python, or asset file into the project.
   */
  public static importSingleFile(req: any, res: any): void {
    const { projectId } = req.params;
    try {
      if (req.file) {
        const targetRel = req.body?.targetPath || req.file.originalname || 'index.html';
        if (StorageService.isUnsupportedExtension(targetRel)) {
          if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
          res.status(400).json({ error: `Unsupported file type: ${path.extname(targetRel)}` });
          return;
        }
        const buf = fs.readFileSync(req.file.path);
        StorageService.writeFile(projectId, targetRel, buf);
        if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
        db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(projectId);
        res.json({ success: true, importedFile: targetRel, size: buf.length });
        return;
      }

      const { filename, content, setAsIndex } = req.body || {};
      if (!filename || content === undefined) {
        res.status(400).json({ error: 'Provide either a multipart file or JSON { filename, content }.' });
        return;
      }
      const targetName = setAsIndex ? 'index.html' : String(filename).replace(/^[/\\]+/, '');
      StorageService.writeFile(projectId, targetName, String(content));
      db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(projectId);
      res.json({ success: true, importedFile: targetName });
    } catch (err: any) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(400).json({ error: err.message });
    }
  }

  public static async uploadZip(req: any, res: any): Promise<void> {
    const { projectId } = req.params;
    if (!req.file) {
      res.status(400).json({ error: 'Missing ZIP archive file.' });
      return;
    }
    const destDir = StorageService.getProjectPath(projectId);
    try {
      const result = await ArchiveService.safeExtractDetailed(req.file.path, destDir);
      if (fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      db.prepare('UPDATE projects SET updated_at = CURRENT_TIMESTAMP WHERE id = ?').run(projectId);
      const hasIndexHtml = fs.existsSync(path.join(destDir, 'index.html'));
      res.json({
        success: true,
        filesExtracted: result.extractedFiles,
        skippedUnsupportedFiles: result.skippedUnsupportedFiles,
        flattenedRoot: result.flattenedRoot,
        hasIndexHtml,
        warnings: hasIndexHtml
          ? []
          : ["Uploaded archive does not contain an 'index.html' file at the root level."]
      });
    } catch (err: any) {
      if (req.file && fs.existsSync(req.file.path)) fs.unlinkSync(req.file.path);
      res.status(400).json({ error: `Extraction error: ${err.message}` });
    }
  }

  public static async inspectPython(req: any, res: any): Promise<void> {
    const { projectId } = req.params;
    const dir = StorageService.getProjectPath(projectId);
    const inspection = await PythonService.inspectProject(dir);
    res.json(inspection);
  }

  public static async generatePythonBridge(req: any, res: any): Promise<void> {
    const { projectId } = req.params;
    try {
      const project = db.prepare('SELECT * FROM projects WHERE id = ?').get(projectId) as any;
      if (!project) {
        res.status(404).json({ error: 'Project not found' });
        return;
      }
      const dir = StorageService.getProjectPath(projectId);
      const inspection = await PythonService.inspectProject(dir);
      const entrypoint = req.body?.entrypoint || inspection.entrypoint || 'main.py';
      await PythonService.generateWebViewBridge(dir, project.name, entrypoint);
      const updatedInspection = await PythonService.inspectProject(dir);
      res.json({
        success: true,
        generatedFile: 'index.html',
        inspection: updatedInspection
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  }
}
