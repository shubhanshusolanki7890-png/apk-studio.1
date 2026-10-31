import { ProjectsController } from '../controllers/projects.controller';

export function registerProjectRoutes(app: any): void {
  app.get('/api/projects', ProjectsController.list);
  app.post('/api/projects', ProjectsController.create);
  app.get('/api/projects/:id', ProjectsController.get);
  app.put('/api/projects/:id', ProjectsController.rename);
  app.post('/api/projects/:id/duplicate', ProjectsController.duplicate);
  app.put('/api/projects/:id/customization', ProjectsController.updateCustomization);
  app.put('/api/projects/:id/animations', ProjectsController.updateAnimations);
  app.delete('/api/projects/:id', ProjectsController.delete);
}
