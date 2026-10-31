import React, { useState, useEffect, useMemo } from 'react';
import { StudioProject, ConsoleLogEntry } from '../../types';

interface LivePreviewPanelProps {
  project: StudioProject;
}

type ViewportPreset = 'mobile' | 'tablet' | 'full';

function buildSandboxedPreviewHtml(project: StudioProject): string {
  const entry =
    project.files.find((f) => f.path === project.settings.entryFile) ||
    project.files.find((f) => f.path.endsWith('.html')) ||
    project.files[0];

  if (!entry) {
    return '<!DOCTYPE html><html><body><p>No HTML entry file found.</p></body></html>';
  }

  let html = entry.content;

  // Inline project CSS files referenced via <link rel="stylesheet" href="...">
  project.files
    .filter((f) => f.path.endsWith('.css'))
    .forEach((cssFile) => {
      const escaped = cssFile.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const linkRegex = new RegExp(
        `<link[^>]+href=["'](?:\\./)?${escaped}["'][^>]*>`,
        'gi'
      );
      if (linkRegex.test(html)) {
        html = html.replace(linkRegex, `<style>\n${cssFile.content}\n</style>`);
      } else {
        html = html.replace('</head>', `<style>\n${cssFile.content}\n</style>\n</head>`);
      }
    });

  // Inline project JS files referenced via <script src="..."></script>
  project.files
    .filter((f) => f.path.endsWith('.js'))
    .forEach((jsFile) => {
      const escaped = jsFile.path.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
      const scriptRegex = new RegExp(
        `<script[^>]+src=["'](?:\\./)?${escaped}["'][^>]*>\\s*<\\/script>`,
        'gi'
      );
      if (scriptRegex.test(html)) {
        html = html.replace(scriptRegex, `<script>\n${jsFile.content}\n</script>`);
      } else {
        html = html.replace('</body>', `<script>\n${jsFile.content}\n</script>\n</body>`);
      }
    });

  // Inject console & runtime error bridge for virtual Developer Console
  const consoleBridge = `<script>
(function() {
  function send(level, args) {
    try {
      var msg = Array.prototype.slice.call(args).map(function(a) {
        return typeof a === 'object' ? JSON.stringify(a) : String(a);
      }).join(' ');
      parent.postMessage({ source: 'apk-studio-preview', level: level, message: msg }, '*');
    } catch (e) {}
  }
  var origLog = console.log;
  var origInfo = console.info;
  var origWarn = console.warn;
  var origError = console.error;
  console.log = function() { send('log', arguments); origLog.apply(console, arguments); };
  console.info = function() { send('info', arguments); origInfo.apply(console, arguments); };
  console.warn = function() { send('warn', arguments); origWarn.apply(console, arguments); };
  console.error = function() { send('error', arguments); origError.apply(console, arguments); };
  window.addEventListener('error', function(ev) {
    send('error', [ev.message + ' (' + (ev.filename || 'inline') + ':' + ev.lineno + ')']);
  });
})();
</script>`;

  if (html.includes('<head>')) {
    html = html.replace('<head>', `<head>\n${consoleBridge}`);
  } else {
    html = consoleBridge + html;
  }

  return html;
}

export const LivePreviewPanel: React.FC<LivePreviewPanelProps> = ({ project }) => {
  const [viewport, setViewport] = useState<ViewportPreset>('mobile');
  const [landscape, setLandscape] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [logs, setLogs] = useState<ConsoleLogEntry[]>([]);

  useEffect(() => {
    const handler = (event: MessageEvent) => {
      if (event.data && event.data.source === 'apk-studio-preview') {
        setLogs((prev) => [
          ...prev.slice(-99),
          {
            id: `${Date.now()}_${Math.random()}`,
            level: event.data.level || 'log',
            message: String(event.data.message || ''),
            timestamp: Date.now(),
          },
        ]);
      }
    };
    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, []);

  const srcDoc = useMemo(
    () => buildSandboxedPreviewHtml(project),
    [project, refreshKey]
  );

  const frameDimensions = useMemo(() => {
    if (viewport === 'full') {
      return { width: '100%', height: '460px' };
    }
    if (viewport === 'tablet') {
      return landscape
        ? { width: '720px', height: '460px' }
        : { width: '540px', height: '620px' };
    }
    return landscape
      ? { width: '640px', height: '360px' }
      : { width: '360px', height: '620px' };
  }, [viewport, landscape]);

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
        <div>
          <h1 className="header-title" style={{ fontSize: '1.45rem', marginBottom: '2px' }}>
            Sandboxed Live Preview
          </h1>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-sub)' }}>
            Entry: <strong>{project.settings.entryFile}</strong> • Isolated iframe execution with live console capture
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className={`glass-btn ${viewport === 'mobile' ? 'glass-btn-primary' : ''}`}
            onClick={() => setViewport('mobile')}
          >
            📱 Phone
          </button>
          <button
            type="button"
            className={`glass-btn ${viewport === 'tablet' ? 'glass-btn-primary' : ''}`}
            onClick={() => setViewport('tablet')}
          >
            📟 Tablet
          </button>
          <button
            type="button"
            className={`glass-btn ${viewport === 'full' ? 'glass-btn-primary' : ''}`}
            onClick={() => setViewport('full')}
          >
            🖥️ Full Width
          </button>
          {viewport !== 'full' && (
            <button
              type="button"
              className="glass-btn"
              onClick={() => setLandscape((l) => !l)}
            >
              🔄 {landscape ? 'Landscape' : 'Portrait'}
            </button>
          )}
          <button
            type="button"
            className="glass-btn"
            onClick={() => {
              setLogs([]);
              setRefreshKey((k) => k + 1);
            }}
          >
            ↻ Reload
          </button>
        </div>
      </div>

      {/* Preview Stage */}
      <div
        style={{
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '16px',
          borderRadius: '20px',
          background: 'rgba(15, 23, 42, 0.22)',
          border: '1px solid var(--glass-border)',
          overflowX: 'auto',
        }}
      >
        <div
          style={{
            width: frameDimensions.width,
            maxWidth: '100%',
            height: frameDimensions.height,
            borderRadius: viewport === 'full' ? '12px' : '28px',
            border: viewport === 'full' ? '1px solid #334155' : '8px solid #1e293b',
            overflow: 'hidden',
            background: '#ffffff',
            boxShadow: '0 20px 45px rgba(0, 0, 0, 0.25)',
            display: 'flex',
            flexDirection: 'column',
          }}
        >
          {/* Simulated Android Status Bar */}
          <div
            style={{
              height: '24px',
              background: project.settings.statusBarColor || '#4f46e5',
              color: '#ffffff',
              fontSize: '0.7rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 12px',
            }}
          >
            <span>9:41</span>
            <span>{project.settings.appName}</span>
            <span>5G 100%</span>
          </div>
          <iframe
            key={refreshKey}
            title="Sandboxed App Preview"
            sandbox="allow-scripts"
            srcDoc={srcDoc}
            style={{ width: '100%', flex: 1, border: 'none', background: '#fff' }}
          />
        </div>
      </div>

      {/* Virtual Developer Console */}
      <div
        style={{
          borderRadius: '16px',
          background: 'rgba(15, 23, 42, 0.92)',
          color: '#f8fafc',
          padding: '14px',
          border: '1px solid rgba(148, 163, 184, 0.25)',
        }}
      >
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' }}>
          <span style={{ fontSize: '0.82rem', fontWeight: 700, color: '#94a3b8' }}>
            VIRTUAL DEVELOPER CONSOLE ({logs.length})
          </span>
          <button
            type="button"
            onClick={() => setLogs([])}
            style={{
              background: 'transparent',
              border: '1px solid #475569',
              color: '#cbd5e1',
              borderRadius: '6px',
              padding: '2px 8px',
              fontSize: '0.75rem',
              cursor: 'pointer',
            }}
          >
            Clear
          </button>
        </div>
        <div
          style={{
            maxHeight: '140px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          }}
        >
          {logs.length === 0 ? (
            <div style={{ color: '#64748b' }}>
              Console ready. Logs and runtime errors from your previewed app appear here.
            </div>
          ) : (
            logs.map((entry) => (
              <div
                key={entry.id}
                style={{
                  color:
                    entry.level === 'error'
                      ? '#f87171'
                      : entry.level === 'warn'
                      ? '#fbbf24'
                      : '#38bdf8',
                }}
              >
                [{entry.level.toUpperCase()}] {entry.message}
              </div>
            ))
          )}
        </div>
      </div>
    </div>
  );
};
