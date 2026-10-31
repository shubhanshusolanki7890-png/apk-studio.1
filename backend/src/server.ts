import { app } from './app';
import { CONFIG } from './config';
import { initDatabase } from './database/db';

initDatabase();

export const server = app.listen(CONFIG.PORT, () => {
  console.log(`[APK STUDIO] Core engine running on http://localhost:${CONFIG.PORT}`);
});
