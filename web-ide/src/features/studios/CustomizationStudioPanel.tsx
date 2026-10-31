import React, { useState } from 'react';
import { StudioProject, ProjectSettings, SplashAnimationType, OrientationOption } from '../../types';

interface CustomizationStudioPanelProps {
  project: StudioProject;
  onUpdateSettings: (partial: Partial<ProjectSettings>) => void;
}

const ANDROID_PERMISSIONS = [
  {
    id: 'android.permission.INTERNET',
    label: 'Internet Access (INTERNET)',
    description: 'Allows the WebView application to load remote APIs, fonts, and network resources.',
  },
  {
    id: 'android.permission.ACCESS_NETWORK_STATE',
    label: 'Network State (ACCESS_NETWORK_STATE)',
    description: 'Allows checking online/offline connectivity status.',
  },
  {
    id: 'android.permission.CAMERA',
    label: 'Camera (CAMERA)',
    description: 'Required if your web app uses navigator.mediaDevices.getUserMedia for video/photo capture.',
  },
  {
    id: 'android.permission.RECORD_AUDIO',
    label: 'Microphone (RECORD_AUDIO)',
    description: 'Required for WebRTC voice or audio recording features.',
  },
  {
    id: 'android.permission.VIBRATE',
    label: 'Vibration (VIBRATE)',
    description: 'Allows haptic feedback and navigator.vibrate calls.',
  },
  {
    id: 'android.permission.ACCESS_FINE_LOCATION',
    label: 'Fine Location (ACCESS_FINE_LOCATION)',
    description: 'Required if your app uses HTML5 Geolocation APIs.',
  },
];

export const CustomizationStudioPanel: React.FC<CustomizationStudioPanelProps> = ({
  project,
  onUpdateSettings,
}) => {
  const { settings } = project;
  const [iconInfo, setIconInfo] = useState<string>('Square PNG/JPG/WebP recommended (512×512px)');

  const handleIconUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    if (!/^image\/(png|jpeg|webp|svg\+xml)$/i.test(file.type)) {
      setIconInfo('⚠️ Unsupported format. Please upload PNG, JPEG, WebP, or SVG.');
      return;
    }
    const reader = new FileReader();
    reader.onload = () => {
      const dataUrl = typeof reader.result === 'string' ? reader.result : null;
      if (!dataUrl) return;
      const img = new Image();
      img.onload = () => {
        setIconInfo(`✓ Loaded ${img.width}×${img.height}px (${Math.round(file.size / 1024)} KB)`);
        onUpdateSettings({ iconDataUrl: dataUrl });
      };
      img.src = dataUrl;
    };
    reader.readAsDataURL(file);
    e.target.value = '';
  };

  const togglePermission = (permId: string) => {
    const exists = settings.permissions.includes(permId);
    const next = exists
      ? settings.permissions.filter((p) => p !== permId)
      : [...settings.permissions, permId];
    onUpdateSettings({ permissions: next });
  };

  const htmlFiles = project.files.filter((f) => f.path.endsWith('.html'));

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div>
        <h1 className="header-title">App, Icon, Splash & Permission Studio</h1>
        <p className="header-sub" style={{ marginBottom: 0 }}>
          Configure Android manifest identity, SDK levels, launcher icons, splash animations, and permissions.
        </p>
      </div>

      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '16px',
        }}
      >
        {/* App Identity & SDK Configuration */}
        <div className="metric-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>1. Android App Identity & SDK</h3>

          <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
            Application Name
            <input
              type="text"
              className="glass-input"
              value={settings.appName}
              onChange={(e) => onUpdateSettings({ appName: e.target.value })}
              style={{ marginTop: '4px' }}
            />
          </label>

          <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
            Package Identifier (Application ID)
            <input
              type="text"
              className="glass-input"
              value={settings.packageName}
              onChange={(e) => onUpdateSettings({ packageName: e.target.value.trim() })}
              placeholder="com.company.appname"
              style={{ marginTop: '4px', fontFamily: 'monospace' }}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
              Version Name
              <input
                type="text"
                className="glass-input"
                value={settings.versionName}
                onChange={(e) => onUpdateSettings({ versionName: e.target.value })}
                style={{ marginTop: '4px' }}
              />
            </label>
            <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
              Version Code
              <input
                type="number"
                min={1}
                className="glass-input"
                value={settings.versionCode}
                onChange={(e) =>
                  onUpdateSettings({ versionCode: Math.max(1, parseInt(e.target.value || '1', 10)) })
                }
                style={{ marginTop: '4px' }}
              />
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
              Min SDK
              <select
                className="glass-select"
                value={settings.minSdk}
                onChange={(e) => onUpdateSettings({ minSdk: Number(e.target.value) })}
                style={{ marginTop: '4px' }}
              >
                <option value={24}>API 24 (Android 7.0)</option>
                <option value={26}>API 26 (Android 8.0)</option>
                <option value={28}>API 28 (Android 9.0)</option>
                <option value={29}>API 29 (Android 10)</option>
              </select>
            </label>
            <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
              Target SDK
              <select
                className="glass-select"
                value={settings.targetSdk}
                onChange={(e) => onUpdateSettings({ targetSdk: Number(e.target.value) })}
                style={{ marginTop: '4px' }}
              >
                <option value={33}>API 33 (Android 13)</option>
                <option value={34}>API 34 (Android 14)</option>
                <option value={35}>API 35 (Android 15)</option>
              </select>
            </label>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
              Orientation
              <select
                className="glass-select"
                value={settings.orientation}
                onChange={(e) =>
                  onUpdateSettings({ orientation: e.target.value as OrientationOption })
                }
                style={{ marginTop: '4px' }}
              >
                <option value="portrait">Portrait</option>
                <option value="landscape">Landscape</option>
                <option value="sensor">Auto Rotate (Sensor)</option>
              </select>
            </label>

            <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
              Entry HTML File
              <select
                className="glass-select"
                value={settings.entryFile}
                onChange={(e) => onUpdateSettings({ entryFile: e.target.value })}
                style={{ marginTop: '4px' }}
              >
                {htmlFiles.map((f) => (
                  <option key={f.path} value={f.path}>
                    {f.path}
                  </option>
                ))}
              </select>
            </label>
          </div>
        </div>

        {/* Icon Studio & System Bars */}
        <div className="metric-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>2. Launcher Icon & System Bars</h3>

          <div style={{ display: 'flex', alignItems: 'center', gap: '16px' }}>
            {settings.iconDataUrl ? (
              <img
                src={settings.iconDataUrl}
                alt="Launcher Preview"
                style={{
                  width: '72px',
                  height: '72px',
                  borderRadius: '18px',
                  objectFit: 'cover',
                  border: '2px solid var(--glass-border)',
                }}
              />
            ) : (
              <div
                style={{
                  width: '72px',
                  height: '72px',
                  borderRadius: '18px',
                  background: 'linear-gradient(135deg, #4f46e5, #ec4899)',
                  color: '#fff',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '1.6rem',
                  fontWeight: 800,
                }}
              >
                {settings.appName.slice(0, 2).toUpperCase()}
              </div>
            )}

            <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
              <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
                <label className="glass-btn" style={{ cursor: 'pointer' }}>
                  <span>🖼️ Upload Icon</span>
                  <input
                    type="file"
                    accept="image/png,image/jpeg,image/webp,image/svg+xml"
                    onChange={handleIconUpload}
                    style={{ display: 'none' }}
                  />
                </label>
                {settings.iconDataUrl && (
                  <button
                    type="button"
                    className="glass-btn glass-btn-danger"
                    onClick={() => onUpdateSettings({ iconDataUrl: null })}
                  >
                    Reset
                  </button>
                )}
              </div>
              <span style={{ fontSize: '0.76rem', color: 'var(--text-sub)' }}>{iconInfo}</span>
            </div>
          </div>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
              Status Bar Color
              <input
                type="color"
                className="glass-input"
                value={settings.statusBarColor}
                onChange={(e) => onUpdateSettings({ statusBarColor: e.target.value })}
                style={{ marginTop: '4px', height: '42px', padding: '4px' }}
              />
            </label>
            <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
              Navigation Bar Color
              <input
                type="color"
                className="glass-input"
                value={settings.navigationBarColor}
                onChange={(e) => onUpdateSettings({ navigationBarColor: e.target.value })}
                style={{ marginTop: '4px', height: '42px', padding: '4px' }}
              />
            </label>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' }}>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.fullscreen}
                onChange={(e) => onUpdateSettings({ fullscreen: e.target.checked })}
              />
              <span>Immersive Fullscreen Mode (Hide Android Status Bar)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.enableJavaScript}
                onChange={(e) => onUpdateSettings({ enableJavaScript: e.target.checked })}
              />
              <span>Enable WebView JavaScript Execution</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.enableDomStorage}
                onChange={(e) => onUpdateSettings({ enableDomStorage: e.target.checked })}
              />
              <span>Enable DOM Storage (localStorage & IndexedDB)</span>
            </label>
            <label style={{ display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' }}>
              <input
                type="checkbox"
                checked={settings.enableZoom}
                onChange={(e) => onUpdateSettings({ enableZoom: e.target.checked })}
              />
              <span>Allow Pinch-to-Zoom Gesture</span>
            </label>
          </div>
        </div>

        {/* Splash & Animation Studio */}
        <div className="metric-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>3. Splash Screen & Animation Studio</h3>

          <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
            Splash Headline
            <input
              type="text"
              className="glass-input"
              value={settings.splashTitle}
              onChange={(e) => onUpdateSettings({ splashTitle: e.target.value })}
              style={{ marginTop: '4px' }}
            />
          </label>

          <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
            Splash Tagline
            <input
              type="text"
              className="glass-input"
              value={settings.splashTagline}
              onChange={(e) => onUpdateSettings({ splashTagline: e.target.value })}
              style={{ marginTop: '4px' }}
            />
          </label>

          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' }}>
            <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
              Splash Animation Preset
              <select
                className="glass-select"
                value={settings.splashAnimation}
                onChange={(e) =>
                  onUpdateSettings({ splashAnimation: e.target.value as SplashAnimationType })
                }
                style={{ marginTop: '4px' }}
              >
                <option value="liquid-pulse">Liquid Glass Pulse</option>
                <option value="fade">Smooth Crossfade</option>
                <option value="scale-up">Zoom Scale-Up</option>
                <option value="slide-up">Vertical Slide-Up</option>
              </select>
            </label>

            <label style={{ fontSize: '0.82rem', fontWeight: 600 }}>
              Duration ({settings.splashDurationMs} ms)
              <input
                type="range"
                min={400}
                max={3000}
                step={200}
                value={settings.splashDurationMs}
                onChange={(e) => onUpdateSettings({ splashDurationMs: Number(e.target.value) })}
                style={{ width: '100%', marginTop: '12px' }}
              />
            </label>
          </div>

          {/* Live Mini Splash Preview */}
          <div
            style={{
              marginTop: '6px',
              borderRadius: '16px',
              padding: '18px',
              background: settings.splashColor || '#4f46e5',
              color: '#ffffff',
              textAlign: 'center',
              boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.2)',
            }}
          >
            <div style={{ fontWeight: 800, fontSize: '1.05rem' }}>{settings.splashTitle}</div>
            <div style={{ fontSize: '0.78rem', opacity: 0.85, marginTop: '2px' }}>
              {settings.splashTagline} • {settings.splashAnimation} ({settings.splashDurationMs}ms)
            </div>
          </div>
        </div>

        {/* Android Permissions Studio */}
        <div className="metric-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
            4. Android Manifest Permissions ({settings.permissions.length} enabled)
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {ANDROID_PERMISSIONS.map((perm) => {
              const checked = settings.permissions.includes(perm.id);
              return (
                <label
                  key={perm.id}
                  style={{
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '10px',
                    borderRadius: '12px',
                    background: checked ? 'rgba(79, 70, 229, 0.14)' : 'rgba(255,255,255,0.25)',
                    border: '1px solid var(--glass-border)',
                    cursor: 'pointer',
                  }}
                >
                  <input
                    type="checkbox"
                    checked={checked}
                    onChange={() => togglePermission(perm.id)}
                    style={{ marginTop: '3px' }}
                  />
                  <div>
                    <div style={{ fontSize: '0.85rem', fontWeight: 700 }}>{perm.label}</div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-sub)', lineHeight: 1.35 }}>
                      {perm.description}
                    </div>
                  </div>
                </label>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
};
