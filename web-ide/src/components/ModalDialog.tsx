import React, { useState, useEffect } from 'react';

export interface ModalConfig {
  isOpen: boolean;
  title: string;
  message?: string;
  mode: 'prompt' | 'confirm' | 'alert';
  defaultValue?: string;
  placeholder?: string;
  confirmLabel?: string;
  danger?: boolean;
  onConfirm: (value?: string) => void;
  onCancel: () => void;
}

export const ModalDialog: React.FC<{ config: ModalConfig | null }> = ({ config }) => {
  const [inputValue, setInputValue] = useState(config?.defaultValue || '');

  useEffect(() => {
    if (config?.isOpen) {
      setInputValue(config.defaultValue || '');
    }
  }, [config]);

  if (!config || !config.isOpen) return null;

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    config.onConfirm(config.mode === 'prompt' ? inputValue.trim() : undefined);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      style={{
        position: 'fixed',
        inset: 0,
        zIndex: 999,
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      }}
    >
      <form
        onSubmit={handleSubmit}
        className="liquid-glass-panel"
        style={{ width: '100%', maxWidth: '420px', borderRadius: '22px' }}
      >
        <div className="glass-backdrop" />
        <div className="panel-content" style={{ padding: '22px' }}>
          <h3 style={{ fontSize: '1.15rem', fontWeight: 700, marginBottom: '8px' }}>
            {config.title}
          </h3>
          {config.message && (
            <p style={{ fontSize: '0.9rem', color: 'var(--text-sub)', marginBottom: '14px', lineHeight: 1.45 }}>
              {config.message}
            </p>
          )}
          {config.mode === 'prompt' && (
            <input
              type="text"
              className="glass-input"
              value={inputValue}
              onChange={(e) => setInputValue(e.target.value)}
              placeholder={config.placeholder || ''}
              autoFocus
              style={{ marginBottom: '16px' }}
            />
          )}
          <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '10px' }}>
            {config.mode !== 'alert' && (
              <button type="button" className="glass-btn" onClick={config.onCancel}>
                Cancel
              </button>
            )}
            <button
              type="submit"
              className={`glass-btn ${config.danger ? 'glass-btn-danger' : 'glass-btn-primary'}`}
            >
              {config.confirmLabel || 'Confirm'}
            </button>
          </div>
        </div>
      </form>
    </div>
  );
};
