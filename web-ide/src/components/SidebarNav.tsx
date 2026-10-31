import React from 'react';
import { StudioTab } from '../types';
import { LiquidGlassPanel } from './LiquidGlassPanel';

interface SidebarNavProps {
  activeTab: StudioTab;
  onSelectTab: (tab: StudioTab) => void;
  activeProjectName: string;
  fileCount: number;
  unsavedCount: number;
  darkMode: boolean;
  onToggleDarkMode: () => void;
}

const NAV_ITEMS: Array<{ id: StudioTab; icon: string; label: string; badge?: string }> = [
  { id: 'overview', icon: '⚡', label: 'Overview' },
  { id: 'workspace', icon: '📁', label: 'Project & Files' },
  { id: 'editor', icon: '💻', label: 'Code Editor' },
  { id: 'preview', icon: '📱', label: 'Live Preview' },
  { id: 'customize', icon: '🎨', label: 'App & Icon Studio' },
  { id: 'builder', icon: '🚀', label: 'APK Build Engine' },
];

export const SidebarNav: React.FC<SidebarNavProps> = ({
  activeTab,
  onSelectTab,
  activeProjectName,
  fileCount,
  unsavedCount,
  darkMode,
  onToggleDarkMode,
}) => {
  return (
    <LiquidGlassPanel className="sidebar">
      <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' }}>
        <div>
          <h2 style={{ fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.3px' }}>
            APK Studio
          </h2>
          <div style={{ fontSize: '0.76rem', color: 'var(--text-sub)', fontWeight: 600 }}>
            Liquid Glass Mobile IDE
          </div>
        </div>
        <button
          type="button"
          className="glass-btn"
          onClick={onToggleDarkMode}
          title={darkMode ? 'Switch to Light Glass' : 'Switch to Dark Glass'}
          style={{ padding: '7px 10px', borderRadius: '10px' }}
        >
          {darkMode ? '☀️' : '🌙'}
        </button>
      </div>

      <div
        style={{
          padding: '10px 12px',
          borderRadius: '14px',
          background: 'rgba(255,255,255,0.28)',
          border: '1px solid var(--glass-border)',
          marginBottom: '12px',
        }}
      >
        <div style={{ fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-sub)', fontWeight: 700 }}>
          Active Project
        </div>
        <div style={{ fontSize: '0.92rem', fontWeight: 700, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
          {activeProjectName}
        </div>
        <div style={{ fontSize: '0.76rem', color: 'var(--text-sub)', marginTop: '2px', display: 'flex', justifyContent: 'space-between' }}>
          <span>{fileCount} files</span>
          {unsavedCount > 0 ? (
            <span style={{ color: '#d97706', fontWeight: 700 }}>{unsavedCount} unsaved</span>
          ) : (
            <span style={{ color: '#16a34a', fontWeight: 700 }}>Saved</span>
          )}
        </div>
      </div>

      <nav className="nav-scroll-row" aria-label="Main Studio Navigation">
        {NAV_ITEMS.map((item) => (
          <button
            key={item.id}
            type="button"
            className={`nav-item ${activeTab === item.id ? 'active' : ''}`}
            onClick={() => onSelectTab(item.id)}
          >
            <span aria-hidden="true">{item.icon}</span>
            <span>{item.label}</span>
            {item.id === 'editor' && unsavedCount > 0 && (
              <span
                style={{
                  marginLeft: 'auto',
                  background: '#f59e0b',
                  color: '#fff',
                  fontSize: '0.7rem',
                  padding: '2px 6px',
                  borderRadius: '999px',
                }}
              >
                {unsavedCount}
              </span>
            )}
          </button>
        ))}
      </nav>
    </LiquidGlassPanel>
  );
};
