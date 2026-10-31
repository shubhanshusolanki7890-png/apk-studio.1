import { FilesController } from '../controllers/files.controller';
import { uploadLimits } from '../middleware/uploadLimits';

export function registerFileRoutes(app: any): void {
  app.get('/api/projects/:projectId/files', FilesController.getTree);
  app.get('/api/projects/:projectId/file', FilesController.getContent);
  app.post('/api/projects/:projectId/file', FilesController.saveContent);
  app.delete('/api/projects/:projectId/file', FilesController.deleteFile);
  app.post(
    '/api/projects/:projectId/import-file',
    uploadLimits.single('file'),
    FilesController.importSingleFile
  );
  app.post(
    '/api/projects/:projectId/upload-zip',
    uploadLimits.single('zipfile'),
    FilesController.uploadZip
  );
  app.get('/api/projects/:projectId/python-inspect', FilesController.inspectPython);
  app.post('/api/projects/:projectId/python-bridge', FilesController.generatePythonBridge);
}
