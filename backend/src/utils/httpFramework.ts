import http from 'http';
import fs from 'fs';
import path from 'path';
import url from 'url';
import { CONFIG } from '../config';
import { StorageService } from '../services/storage.service';

const MIME_MAP: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'application/javascript; charset=utf-8',
  '.mjs': 'application/javascript; charset=utf-8',
  '.json': 'application/json; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.png': 'image/png',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.ico': 'image/x-icon',
  '.woff': 'font/woff',
  '.woff2': 'font/woff2',
  '.ttf': 'font/ttf',
  '.txt': 'text/plain; charset=utf-8',
  '.py': 'text/plain; charset=utf-8',
  '.apk': 'application/vnd.android.package-archive',
  '.zip': 'application/zip'
};

export const PREVIEW_CONSOLE_BRIDGE_SCRIPT = `
<script>
(function() {
  function sendToStudio(level, args) {
    try {
      var msg = Array.prototype.slice.call(args).map(function(a) {
        if (a instanceof Error) return a.stack || a.message;
        if (typeof a === 'object') { try { return JSON.stringify(a); } catch(e) { return String(a); } }
        return String(a);
      }).join(' ');
      window.parent.postMessage({
        source: 'apk-studio-preview',
        level: level,
        message: msg,
        timestamp: new Date().toISOString()
      }, '*');
    } catch (e) {}
  }
  var origLog = console.log;
  var origWarn = console.warn;
  var origError = console.error;
  console.log = function() { sendToStudio('info', arguments); origLog.apply(console, arguments); };
  console.warn = function() { sendToStudio('warn', arguments); origWarn.apply(console, arguments); };
  console.error = function() { sendToStudio('error', arguments); origError.apply(console, arguments); };
  window.addEventListener('error', function(ev) {
    sendToStudio('error', [ev.message + (ev.filename ? ' (' + ev.filename + ':' + ev.lineno + ')' : '')]);
  });
  window.addEventListener('unhandledrejection', function(ev) {
    sendToStudio('error', ['Unhandled Promise Rejection: ' + (ev.reason && ev.reason.message ? ev.reason.message : ev.reason)]);
  });
})();
</script>
`;

interface RouteEntry {
  method: string;
  pattern: RegExp;
  keys: string[];
  handlers: Array<(req: any, res: any, next: () => void) => any>;
}

function compileRoutePattern(routePath: string): { pattern: RegExp; keys: string[] } {
  const keys: string[] = [];
  const regexStr = routePath
    .replace(/\/:([a-zA-Z0-9_]+)/g, (_m, key) => {
      keys.push(key);
      return '/([^/]+)';
    })
    .replace(/\//g, '\\/');
  return {
    pattern: new RegExp(`^${regexStr}\\/?$`),
    keys
  };
}

export function serveProjectPreview(projectId: string, relFilePath: string, res: any): void {
  try {
    const cleanRel = relFilePath.replace(/^[/\\]+/, '') || 'index.html';
    const targetPath = StorageService.resolveSafeProjectFile(projectId, cleanRel);
    if (!fs.existsSync(targetPath) || fs.statSync(targetPath).isDirectory()) {
      const fallbackIndex = path.join(targetPath, 'index.html');
      if (fs.existsSync(fallbackIndex) && !fs.statSync(fallbackIndex).isDirectory()) {
        return serveProjectPreview(projectId, path.posix.join(cleanRel, 'index.html'), res);
      }
      res.status(404).send(`Preview resource not found: ${cleanRel}`);
      return;
    }

    const ext = path.extname(targetPath).toLowerCase();
    const contentType = MIME_MAP[ext] || 'application/octet-stream';
    res.setHeader('Content-Type', contentType);

    if (ext === '.html') {
      let html = fs.readFileSync(targetPath, 'utf-8');
      if (html.includes('<head>')) {
        html = html.replace('<head>', `<head>${PREVIEW_CONSOLE_BRIDGE_SCRIPT}`);
      } else {
        html = `${PREVIEW_CONSOLE_BRIDGE_SCRIPT}${html}`;
      }
      res.status(200).send(html);
      return;
    }

    const data = fs.readFileSync(targetPath);
    res.status(200).end(data);
  } catch (err: any) {
    res.status(400).send(`Preview error: ${err.message}`);
  }
}

export function createHttpApp(): any {
  const routes: RouteEntry[] = [];

  const register = (method: string, routePath: string, ...handlers: any[]) => {
    const { pattern, keys } = compileRoutePattern(routePath);
    routes.push({ method: method.toUpperCase(), pattern, keys, handlers });
  };

  const handler = (req: http.IncomingMessage, res: http.ServerResponse) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, PUT, DELETE, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type, Authorization');

    if (req.method === 'OPTIONS') {
      res.statusCode = 204;
      res.end();
      return;
    }

    const parsedUrl = url.parse(req.url || '/', true);
    const pathname = parsedUrl.pathname || '/';

    const enhancedReq: any = Object.assign(req, {
      query: parsedUrl.query || {},
      params: {},
      body: {},
      path: pathname
    });

    const enhancedRes: any = Object.assign(res, {
      status(code: number) {
        res.statusCode = code;
        return enhancedRes;
      },
      json(payload: any) {
        if (!res.headersSent) {
          res.setHeader('Content-Type', 'application/json; charset=utf-8');
        }
        res.end(JSON.stringify(payload));
        return enhancedRes;
      },
      send(payload: string | Buffer) {
        if (typeof payload === 'object' && !Buffer.isBuffer(payload)) {
          return enhancedRes.json(payload);
        }
        res.end(payload);
        return enhancedRes;
      },
      download(filePath: string, downloadName?: string) {
        const filename = downloadName || path.basename(filePath);
        const ext = path.extname(filename).toLowerCase();
        res.setHeader('Content-Type', MIME_MAP[ext] || 'application/octet-stream');
        res.setHeader('Content-Disposition', `attachment; filename="${filename}"`);
        const stream = fs.createReadStream(filePath);
        stream.pipe(res);
      }
    });

    // Check /preview/:projectId/* static preview route
    const previewMatch = pathname.match(/^\/preview\/([^/]+)(?:\/(.*))?$/);
    if (req.method === 'GET' && previewMatch) {
      const projectId = decodeURIComponent(previewMatch[1]);
      const subPath = decodeURIComponent(previewMatch[2] || 'index.html');
      serveProjectPreview(projectId, subPath, enhancedRes);
      return;
    }

    // Collect request body chunks
    const chunks: Buffer[] = [];
    let totalBytes = 0;
    req.on('data', (chunk: Buffer) => {
      totalBytes += chunk.length;
      if (totalBytes <= CONFIG.MAX_UPLOAD_SIZE_BYTES + 1024 * 1024) {
        chunks.push(chunk);
      }
    });

    req.on('end', () => {
      const rawBuffer = Buffer.concat(chunks);
      enhancedReq.rawBodyBuffer = rawBuffer;
      const contentType = String(req.headers['content-type'] || '');
      if (contentType.includes('application/json') && rawBuffer.length > 0) {
        try {
          enhancedReq.body = JSON.parse(rawBuffer.toString('utf-8'));
        } catch {
          enhancedRes.status(400).json({ error: 'Malformed JSON body.' });
          return;
        }
      }

      for (const route of routes) {
        if (route.method !== (req.method || 'GET').toUpperCase()) continue;
        const match = pathname.match(route.pattern);
        if (match) {
          const params: Record<string, string> = {};
          route.keys.forEach((k, idx) => {
            params[k] = decodeURIComponent(match[idx + 1]);
          });
          enhancedReq.params = params;

          let idx = 0;
          const next = () => {
            const fn = route.handlers[idx++];
            if (!fn) return;
            try {
              const maybePromise = fn(enhancedReq, enhancedRes, next);
              if (maybePromise && typeof maybePromise.catch === 'function') {
                maybePromise.catch((err: any) => {
                  if (!res.headersSent) {
                    enhancedRes.status(500).json({ error: err.message || 'Server error' });
                  }
                });
              }
            } catch (err: any) {
              if (!res.headersSent) {
                enhancedRes.status(500).json({ error: err.message || 'Server error' });
              }
            }
          };
          next();
          return;
        }
      }

      // Serve compiled frontend static assets if built
      const frontendDist = path.join(CONFIG.PROJECT_ROOT, 'frontend', 'dist');
      if (req.method === 'GET' && fs.existsSync(frontendDist)) {
        const assetRel = pathname === '/' ? 'index.html' : pathname.replace(/^\/+/, '');
        const assetPath = path.resolve(frontendDist, assetRel);
        if (assetPath.startsWith(frontendDist) && fs.existsSync(assetPath) && !fs.statSync(assetPath).isDirectory()) {
          const ext = path.extname(assetPath).toLowerCase();
          res.setHeader('Content-Type', MIME_MAP[ext] || 'application/octet-stream');
          res.end(fs.readFileSync(assetPath));
          return;
        }
      }

      enhancedRes.status(404).json({ error: `Route not found: ${req.method} ${pathname}` });
    });
  };

  return {
    get: (p: string, ...h: any[]) => register('GET', p, ...h),
    post: (p: string, ...h: any[]) => register('POST', p, ...h),
    put: (p: string, ...h: any[]) => register('PUT', p, ...h),
    delete: (p: string, ...h: any[]) => register('DELETE', p, ...h),
    listen(port: number, cb?: () => void): http.Server {
      const server = http.createServer(handler);
      return server.listen(port, cb);
    },
    handleRequest: handler
  };
}
