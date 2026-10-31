import { createHttpApp } from './utils/httpFramework';
import { registerProjectRoutes } from './routes/projects.routes';
import { registerFileRoutes } from './routes/files.routes';
import { registerBuildRoutes } from './routes/builds.routes';
import { registerSystemRoutes } from './routes/system.routes';

export const app = createHttpApp();

registerProjectRoutes(app);
registerFileRoutes(app);
registerBuildRoutes(app);
registerSystemRoutes(app);
