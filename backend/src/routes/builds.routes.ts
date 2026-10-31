import { BuildsController } from '../controllers/builds.controller';

export function registerBuildRoutes(app: any): void {
  app.post('/api/projects/:projectId/builds', BuildsController.trigger);
  app.get('/api/projects/:projectId/builds', BuildsController.listByProject);
  app.get('/api/builds/:buildId', BuildsController.getStatus);
  app.get('/api/builds/:buildId/download', BuildsController.downloadApk);
  app.get('/api/builds/:buildId/export-project', BuildsController.exportPreparedProject);
}
