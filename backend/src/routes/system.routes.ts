import { SystemController } from '../controllers/system.controller';

export function registerSystemRoutes(app: any): void {
  app.get('/api/system/diagnostics', SystemController.getDiagnostics);
}
