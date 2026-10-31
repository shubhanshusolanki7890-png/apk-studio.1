import React from 'react';
import { StudioProject, BuildRecord, StudioTab } from '../../types';
import { validateProjectForAndroid } from '../../services/androidGenerator';

interface OverviewPanelProps {
  project: StudioProject;
  allProjects: StudioProject[];
  buildHistory: BuildRecord[];
  onNavigate: (tab: StudioTab) => void;
  onQuickImportZip: (file: File) => void;
  onQuickExportZip: () => void;
}

export const OverviewPanel: React.FC<OverviewPanelProps> = ({
  project,
  allProjects,
  buildHistory,
  onNavigate,
  onQuickImportZip,
  onQuickExportZip,
}) => {
  const validation = validateProjectForAndroid(project);
  const totalBytes = project.files.reduce((acc, f) => acc + f.content.length, 0);
  const totalKb = (totalBytes / 1024).toFixed(1);
  const latestBuild = buildHistory[0];

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (file) {
      onQuickImportZip(file);
      e.target.value = '';
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' }}>
        <div>
          <h1 className="header-title">System Diagnostics</h1>
          <p className="header-sub" style={{ marginBottom: 0 }}>
            Real-time optical refraction, workspace telemetry, and Android APK readiness.
          </p>
        </div>

        <div style={{ display: 'flex', flexWrap: 'wrap', gap: '8px' }}>
          <label className="glass-btn" style={{ cursor: 'pointer' }}>
            <span>📦 Import ZIP</span>
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={handleFileChange}
              style={{ display: 'none' }}
            />
          </label>
          <button type="button" className="glass-btn" onClick={onQuickExportZip}>
            💾 Backup Project
          </button>
          <button
            type="button"
            className="glass-btn glass-btn-primary"
            onClick={() => onNavigate('builder')}
          >
            🚀 Build APK
          </button>
        </div>
      </div>

      {/* Active Project Banner */}
      <div
        className="metric-card"
        style={{
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '14px' }}>
          {project.settings.iconDataUrl ? (
            <img
              src={project.settings.iconDataUrl}
              alt="App Icon"
              style={{ width: '56px', height: '56px', borderRadius: '14px', objectFit: 'cover', border: '1px solid var(--glass-border)' }}
            />
          ) : (
            <div
              style={{
                width: '56px',
                height: '56px',
                borderRadius: '14px',
                background: 'linear-gradient(135deg, #4f46e5, #ec4899)',
                color: '#fff',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'center',
                fontSize: '1.4rem',
                fontWeight: 800,
              }}
            >
              {project.settings.appName.slice(0, 2).toUpperCase()}
            </div>
          )}
          <div>
            <div style={{ display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' }}>
              <h2 style={{ fontSize: '1.25rem', fontWeight: 800 }}>{project.settings.appName}</h2>
              <span
                style={{
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: validation.valid ? 'rgba(22, 163, 74, 0.18)' : 'rgba(220, 38, 38, 0.18)',
                  color: validation.valid ? '#15803d' : '#b91c1c',
                  fontWeight: 700,
                }}
              >
                {validation.valid ? 'Manifest Ready' : `${validation.errors.length} Issues`}
              </span>
            </div>
            <div style={{ fontSize: '0.85rem', color: 'var(--text-sub)', fontFamily: 'monospace', marginTop: '2px' }}>
              {project.settings.packageName} • v{project.settings.versionName} (code {project.settings.versionCode})
            </div>
            <div style={{ fontSize: '0.82rem', color: 'var(--text-sub)', marginTop: '4px' }}>
              Entry: <strong>{project.settings.entryFile}</strong> • Target SDK {project.settings.targetSdk} (Min SDK {project.settings.minSdk})
            </div>
          </div>
        </div>

        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button type="button" className="glass-btn" onClick={() => onNavigate('editor')}>
            💻 Edit Code
          </button>
          <button type="button" className="glass-btn" onClick={() => onNavigate('preview')}>
            📱 Live Preview
          </button>
          <button type="button" className="glass-btn" onClick={() => onNavigate('customize')}>
            🎨 Customize
          </button>
        </div>
      </div>

      {/* Supplied Liquid Glass UI Diagnostic Metric Cards */}
      <div className="card-grid" style={{ marginTop: '4px' }}>
        <div className="metric-card" onClick={() => onNavigate('workspace')} style={{ cursor: 'pointer' }}>
          <div style={{ color: 'var(--text-sub)', fontSize: '0.88rem', fontWeight: 600 }}>
            Workspace Bundle
          </div>
          <div className="metric-val">{project.files.length} Files</div>
          <div style={{ color: '#28a745', fontSize: '0.8rem', fontWeight: 700 }}>
            ● {totalKb} KB across {allProjects.length} saved project{allProjects.length === 1 ? '' : 's'}
          </div>
        </div>

        <div className="metric-card" onClick={() => onNavigate('customize')} style={{ cursor: 'pointer' }}>
          <div style={{ color: 'var(--text-sub)', fontSize: '0.88rem', fontWeight: 600 }}>
            Target Android SDK
          </div>
          <div className="metric-val">API {project.settings.targetSdk}</div>
          <div style={{ color: 'var(--text-sub)', fontSize: '0.8rem', fontWeight: 600 }}>
            Min SDK {project.settings.minSdk} • {project.settings.permissions.length} permission{project.settings.permissions.length === 1 ? '' : 's'}
          </div>
        </div>

        <div className="metric-card" onClick={() => onNavigate('preview')} style={{ cursor: 'pointer' }}>
          <div style={{ color: 'var(--text-sub)', fontSize: '0.88rem', fontWeight: 600 }}>
            Refraction Index
          </div>
          <div className="metric-val">1.48 η</div>
          <div style={{ color: 'var(--text-sub)', fontSize: '0.8rem', fontWeight: 600 }}>
            WebViewAssetLoader HTTPS Isolation
          </div>
        </div>

        <div className="metric-card" onClick={() => onNavigate('builder')} style={{ cursor: 'pointer' }}>
          <div style={{ color: 'var(--text-sub)', fontSize: '0.88rem', fontWeight: 600 }}>
            Build Pipeline Status
          </div>
          <div className="metric-val">
            {latestBuild ? (latestBuild.status === 'succeeded' ? 'Ready' : latestBuild.status) : 'Standby'}
          </div>
          <div style={{ color: validation.valid ? '#28a745' : '#d97706', fontSize: '0.8rem', fontWeight: 700 }}>
            {latestBuild
              ? `Last: ${latestBuild.artifactName || latestBuild.mode}`
              : 'Gradle 8.5 + AGP 8.2.2 configured'}
          </div>
        </div>
      </div>

      {/* Validation & Quick Architecture Summary */}
      <div
        className="metric-card"
        style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}
      >
        <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>
          Android Pre-Flight Checklist
        </div>
        {validation.errors.length === 0 ? (
          <div style={{ fontSize: '0.86rem', color: '#15803d', fontWeight: 600 }}>
            ✓ Package identifier, version numbers, SDK levels, and HTML entry point are verified for Android compilation.
          </div>
        ) : (
          <ul style={{ paddingLeft: '18px', color: '#dc2626', fontSize: '0.86rem' }}>
            {validation.errors.map((err, i) => (
              <li key={i}>{err}</li>
            ))}
          </ul>
        )}
        {validation.warnings.map((w, i) => (
          <div key={i} style={{ fontSize: '0.82rem', color: 'var(--text-sub)' }}>
            ℹ️ {w}
          </div>
        ))}
      </div>
    </div>
  );
};
