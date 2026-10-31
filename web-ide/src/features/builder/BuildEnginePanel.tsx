import React, { useState } from 'react';
import { StudioProject, BuildRecord, BuildStageLog, ProjectSettings } from '../../types';
import {
  validateProjectForAndroid,
  generateCompileReadyAndroidZip,
  generateAndroidManifestXml,
} from '../../services/androidGenerator';
import { triggerBrowserDownload } from '../../services/archive';

interface BuildEnginePanelProps {
  project: StudioProject;
  buildHistory: BuildRecord[];
  onSaveBuildRecord: (record: BuildRecord) => void;
  onUpdateSettings: (partial: Partial<ProjectSettings>) => void;
}

export const BuildEnginePanel: React.FC<BuildEnginePanelProps> = ({
  project,
  buildHistory,
  onSaveBuildRecord,
  onUpdateSettings,
}) => {
  const [isBuilding, setIsBuilding] = useState(false);
  const [activeStages, setActiveStages] = useState<BuildStageLog[]>([]);
  const [showManifestPreview, setShowManifestPreview] = useState(false);
  const [remoteError, setRemoteError] = useState<string | null>(null);

  const validation = validateProjectForAndroid(project);

  const handleGenerateAndroidProjectBundle = async () => {
    setIsBuilding(true);
    setRemoteError(null);
    const now = Date.now();
    const stages: BuildStageLog[] = [
      {
        id: 'st_1',
        stage: 'validate',
        label: 'Validate Android Package, SDK & Entry File',
        status: validation.valid ? 'passed' : 'failed',
        detail: validation.valid
          ? `Verified ${project.settings.packageName} v${project.settings.versionName}`
          : validation.errors.join('; '),
        timestamp: now,
      },
    ];
    setActiveStages([...stages]);

    if (!validation.valid) {
      const failedRecord: BuildRecord = {
        id: `build_${now}`,
        projectId: project.id,
        projectName: project.name,
        packageName: project.settings.packageName,
        versionName: project.settings.versionName,
        versionCode: project.settings.versionCode,
        mode: 'android-project-zip',
        status: 'failed',
        createdAt: now,
        completedAt: Date.now(),
        errorMessage: validation.errors.join(' '),
        stages,
      };
      onSaveBuildRecord(failedRecord);
      setIsBuilding(false);
      return;
    }

    try {
      stages.push({
        id: 'st_2',
        stage: 'manifest',
        label: 'Generate AndroidManifest.xml & WebViewAssetLoader Activity',
        status: 'passed',
        detail: `Configured ${project.settings.permissions.length} permission(s) & HTTPS asset interception`,
        timestamp: Date.now(),
      });
      setActiveStages([...stages]);

      stages.push({
        id: 'st_3',
        stage: 'bundle',
        label: 'Package Web Assets & GitHub Actions Workflow (.github/workflows/build-apk.yml)',
        status: 'running',
        detail: `Bundling ${project.files.length} project file(s) into app/src/main/assets/webapp/`,
        timestamp: Date.now(),
      });
      setActiveStages([...stages]);

      const result = await generateCompileReadyAndroidZip(project);

      stages[stages.length - 1].status = 'passed';
      stages.push({
        id: 'st_4',
        stage: 'verify',
        label: 'Compute SHA-256 Artifact Checksum & Trigger Download',
        status: 'passed',
        detail: `SHA-256: ${result.sha256.slice(0, 24)}... (${(result.size / 1024).toFixed(1)} KB)`,
        timestamp: Date.now(),
      });
      setActiveStages([...stages]);

      triggerBrowserDownload(result.blob, result.filename);

      const record: BuildRecord = {
        id: `build_${now}`,
        projectId: project.id,
        projectName: project.name,
        packageName: project.settings.packageName,
        versionName: project.settings.versionName,
        versionCode: project.settings.versionCode,
        mode: 'android-project-zip',
        status: 'succeeded',
        createdAt: now,
        completedAt: Date.now(),
        artifactName: result.filename,
        artifactSize: result.size,
        sha256: result.sha256,
        stages,
      };
      onSaveBuildRecord(record);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setRemoteError(msg);
    } finally {
      setIsBuilding(false);
    }
  };

  const handleBackendBuildRequest = async () => {
    setIsBuilding(true);
    setRemoteError(null);
    const now = Date.now();
    const backendUrl = project.settings.backendUrl.replace(/\/+$/, '');
    const stages: BuildStageLog[] = [
      {
        id: 'rb_1',
        stage: 'validate',
        label: 'Validate Project Configuration',
        status: validation.valid ? 'passed' : 'failed',
        detail: validation.valid ? 'Configuration valid' : validation.errors.join('; '),
        timestamp: now,
      },
    ];
    setActiveStages([...stages]);

    if (!validation.valid) {
      setIsBuilding(false);
      return;
    }

    try {
      stages.push({
        id: 'rb_2',
        stage: 'gradle',
        label: `Submit Build Job to Backend (${backendUrl}/api/builds)`,
        status: 'running',
        detail: 'Connecting to remote/local Node.js Gradle build service...',
        timestamp: Date.now(),
      });
      setActiveStages([...stages]);

      const response = await fetch(`${backendUrl}/api/builds`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          projectName: project.name,
          packageName: project.settings.packageName,
          versionName: project.settings.versionName,
          versionCode: project.settings.versionCode,
          minSdk: project.settings.minSdk,
          targetSdk: project.settings.targetSdk,
          entryFile: project.settings.entryFile,
          permissions: project.settings.permissions,
          files: project.files,
        }),
      });

      const payload = await response.json();
      if (!response.ok || payload.status === 'failed') {
        throw new Error(payload.error || payload.message || `HTTP ${response.status}`);
      }

      stages[stages.length - 1].status = 'passed';
      stages[stages.length - 1].detail = payload.message || 'APK compiled on backend server.';
      setActiveStages([...stages]);

      const record: BuildRecord = {
        id: payload.buildId || `build_${now}`,
        projectId: project.id,
        projectName: project.name,
        packageName: project.settings.packageName,
        versionName: project.settings.versionName,
        versionCode: project.settings.versionCode,
        mode: 'backend-apk',
        status: 'succeeded',
        createdAt: now,
        completedAt: Date.now(),
        artifactName: payload.artifactName || 'app-debug.apk',
        sha256: payload.sha256,
        downloadUrl: payload.downloadUrl ? `${backendUrl}${payload.downloadUrl}` : undefined,
        stages,
      };
      onSaveBuildRecord(record);
    } catch (err) {
      const msg =
        err instanceof Error
          ? err.message
          : 'Could not reach backend build server.';
      stages[stages.length - 1].status = 'failed';
      stages[stages.length - 1].detail = `Backend unreachable or failed: ${msg}`;
      setActiveStages([...stages]);
      setRemoteError(
        `Backend build server at ${backendUrl} is not reachable (${msg}). Use "Export Compile-Ready Android Project ZIP" to compile via GitHub Actions or Android Studio.`
      );
      onSaveBuildRecord({
        id: `build_${now}`,
        projectId: project.id,
        projectName: project.name,
        packageName: project.settings.packageName,
        versionName: project.settings.versionName,
        versionCode: project.settings.versionCode,
        mode: 'backend-apk',
        status: 'failed',
        createdAt: now,
        completedAt: Date.now(),
        errorMessage: msg,
        stages,
      });
    } finally {
      setIsBuilding(false);
    }
  };

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <div>
          <h1 className="header-title">APK Build Engine & CI/CD Pipeline</h1>
          <p className="header-sub" style={{ marginBottom: 0 }}>
            Real Android project generation, GitHub Actions CI/CD workflow packaging, and remote Gradle build integration.
          </p>
        </div>
        <button
          type="button"
          className="glass-btn"
          onClick={() => setShowManifestPreview((v) => !v)}
        >
          {showManifestPreview ? 'Hide Manifest XML' : '📄 Inspect AndroidManifest.xml'}
        </button>
      </div>

      {showManifestPreview && (
        <pre
          style={{
            padding: '16px',
            borderRadius: '16px',
            background: 'rgba(15, 23, 42, 0.92)',
            color: '#38bdf8',
            fontSize: '0.8rem',
            overflowX: 'auto',
            border: '1px solid rgba(148, 163, 184, 0.3)',
          }}
        >
          {generateAndroidManifestXml(project)}
        </pre>
      )}

      {/* Build Modes Grid */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
          gap: '16px',
        }}
      >
        {/* Mode 1: Standalone Compile-Ready Android Project + GitHub Actions */}
        <div className="metric-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase' }}>
            Recommended on Mobile (Works 100% Offline in Browser)
          </div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>
            Export Compile-Ready Android Project + GitHub Actions
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-sub)', lineHeight: 1.45 }}>
            Generates a complete Android Gradle project containing your web assets, custom <code>AndroidManifest.xml</code>, secure <code>WebViewAssetLoader</code> Java activity, and a ready-to-run <code>.github/workflows/build-apk.yml</code> workflow.
          </p>
          <button
            type="button"
            className="glass-btn glass-btn-primary"
            disabled={isBuilding}
            onClick={handleGenerateAndroidProjectBundle}
            style={{ marginTop: 'auto' }}
          >
            {isBuilding ? '⏳ Generating Package...' : '📦 Generate & Download Android Project (.zip)'}
          </button>
        </div>

        {/* Mode 2: Remote / Local Backend Gradle Build Server */}
        <div className="metric-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <div style={{ fontSize: '0.75rem', fontWeight: 700, color: '#db2777', textTransform: 'uppercase' }}>
            Remote / Local Gradle Build Server
          </div>
          <h3 style={{ fontSize: '1.1rem', fontWeight: 800 }}>
            Compile APK via Backend Service
          </h3>
          <p style={{ fontSize: '0.85rem', color: 'var(--text-sub)', lineHeight: 1.45 }}>
            Submits your project to the APK Studio Node.js backend server. Requires the backend server to be running with Android SDK & Gradle installed.
          </p>
          <input
            type="url"
            className="glass-input"
            value={project.settings.backendUrl}
            onChange={(e) => onUpdateSettings({ backendUrl: e.target.value })}
            placeholder="http://localhost:4000"
          />
          <button
            type="button"
            className="glass-btn"
            disabled={isBuilding}
            onClick={handleBackendBuildRequest}
          >
            🚀 Trigger Backend Gradle Build
          </button>
        </div>
      </div>

      {remoteError && (
        <div
          className="metric-card"
          style={{
            borderColor: 'rgba(239, 68, 68, 0.5)',
            background: 'rgba(239, 68, 68, 0.12)',
            color: '#b91c1c',
            fontSize: '0.86rem',
            fontWeight: 600,
          }}
        >
          ⚠️ {remoteError}
        </div>
      )}

      {/* Active Build Stage Pipeline */}
      {activeStages.length > 0 && (
        <div className="metric-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Build Stage Execution Log</h3>
          {activeStages.map((st) => (
            <div
              key={st.id}
              style={{
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '10px 12px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.3)',
              }}
            >
              <span>
                {st.status === 'passed'
                  ? '✅'
                  : st.status === 'failed'
                  ? '❌'
                  : '⏳'}
              </span>
              <div>
                <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>{st.label}</div>
                <div style={{ fontSize: '0.78rem', color: 'var(--text-sub)', fontFamily: 'monospace' }}>
                  {st.detail}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}

      {/* Build History */}
      <div className="metric-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
        <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>
          Build History ({buildHistory.length})
        </h3>
        {buildHistory.length === 0 ? (
          <div style={{ fontSize: '0.85rem', color: 'var(--text-sub)' }}>
            No builds recorded yet. Generate an Android project bundle or trigger a backend build above.
          </div>
        ) : (
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {buildHistory.slice(0, 10).map((b) => (
              <div
                key={b.id}
                style={{
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 12px',
                  borderRadius: '12px',
                  background: 'rgba(255,255,255,0.28)',
                  border: '1px solid var(--glass-border)',
                }}
              >
                <div>
                  <div style={{ fontWeight: 700, fontSize: '0.88rem' }}>
                    {b.projectName} ({b.packageName} v{b.versionName})
                  </div>
                  <div style={{ fontSize: '0.75rem', color: 'var(--text-sub)', fontFamily: 'monospace' }}>
                    {new Date(b.createdAt).toLocaleString()} • Mode: {b.mode}
                    {b.sha256 ? ` • SHA-256: ${b.sha256.slice(0, 16)}...` : ''}
                  </div>
                </div>
                <span
                  style={{
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: '999px',
                    background:
                      b.status === 'succeeded'
                        ? 'rgba(22, 163, 74, 0.18)'
                        : 'rgba(220, 38, 38, 0.18)',
                    color: b.status === 'succeeded' ? '#15803d' : '#b91c1c',
                  }}
                >
                  {b.status.toUpperCase()}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
