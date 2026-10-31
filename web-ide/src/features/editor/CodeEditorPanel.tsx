import React, { useState, useRef, useEffect } from 'react';
import { StudioProject } from '../../types';

interface CodeEditorPanelProps {
  project: StudioProject;
  openTabs: string[];
  activeFilePath: string;
  onSelectFile: (path: string) => void;
  onCloseTab: (path: string) => void;
  onUpdateFileContent: (path: string, newContent: string) => void;
  onSaveNow: () => void;
  onPreviewNow: () => void;
}

const MOBILE_SYMBOLS = ['Tab', '{', '}', '(', ')', '[', ']', '<', '>', '/', '=', '"', "'", ';', ':', '$', '!'];

export const CodeEditorPanel: React.FC<CodeEditorPanelProps> = ({
  project,
  openTabs,
  activeFilePath,
  onSelectFile,
  onCloseTab,
  onUpdateFileContent,
  onSaveNow,
  onPreviewNow,
}) => {
  const activeFile =
    project.files.find((f) => f.path === activeFilePath) ||
    project.files.find((f) => !f.isBinary) ||
    project.files[0];

  const [showFindBar, setShowFindBar] = useState(false);
  const [findQuery, setFindQuery] = useState('');
  const [replaceQuery, setReplaceQuery] = useState('');
  const [wordWrap, setWordWrap] = useState(true);
  const [cursorInfo, setCursorInfo] = useState({ line: 1, col: 1 });
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  const content = activeFile?.content || '';
  const lineCount = Math.max(1, content.split('\n').length);

  useEffect(() => {
    setCursorInfo({ line: 1, col: 1 });
  }, [activeFile?.path]);

  const updateCursorMetrics = () => {
    const el = textareaRef.current;
    if (!el) return;
    const pos = el.selectionStart || 0;
    const upToCursor = el.value.slice(0, pos);
    const lines = upToCursor.split('\n');
    setCursorInfo({
      line: lines.length,
      col: lines[lines.length - 1].length + 1,
    });
  };

  const insertSymbolAtCursor = (sym: string) => {
    const el = textareaRef.current;
    if (!el || !activeFile) return;
    const start = el.selectionStart;
    const end = el.selectionEnd;
    const insertText = sym === 'Tab' ? '  ' : sym;
    const nextVal = content.slice(0, start) + insertText + content.slice(end);
    onUpdateFileContent(activeFile.path, nextVal);
    requestAnimationFrame(() => {
      el.focus();
      el.selectionStart = el.selectionEnd = start + insertText.length;
      updateCursorMetrics();
    });
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Tab') {
      e.preventDefault();
      insertSymbolAtCursor('Tab');
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 's') {
      e.preventDefault();
      onSaveNow();
    } else if ((e.metaKey || e.ctrlKey) && e.key.toLowerCase() === 'f') {
      e.preventDefault();
      setShowFindBar((prev) => !prev);
    }
  };

  const handleReplaceAll = () => {
    if (!findQuery || !activeFile) return;
    const next = content.split(findQuery).join(replaceQuery);
    onUpdateFileContent(activeFile.path, next);
  };

  const matchCount =
    findQuery && content
      ? content.split(findQuery).length - 1
      : 0;

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '12px', height: '100%', minHeight: '540px' }}>
      {/* Editor Header */}
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
        <div>
          <h1 className="header-title" style={{ fontSize: '1.45rem', marginBottom: '2px' }}>
            Mobile Code Editor
          </h1>
          <div style={{ fontSize: '0.82rem', color: 'var(--text-sub)' }}>
            Editing <strong>{activeFile?.path}</strong> • Line {cursorInfo.line}, Col {cursorInfo.col}
          </div>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <button
            type="button"
            className="glass-btn"
            onClick={() => setShowFindBar((v) => !v)}
          >
            🔍 Find & Replace
          </button>
          <button
            type="button"
            className="glass-btn"
            onClick={() => setWordWrap((w) => !w)}
          >
            {wordWrap ? '↩️ Wrap: On' : '➡️ Wrap: Off'}
          </button>
          <button type="button" className="glass-btn" onClick={onSaveNow}>
            💾 Save
          </button>
          <button type="button" className="glass-btn glass-btn-primary" onClick={onPreviewNow}>
            ▶️ Run Preview
          </button>
        </div>
      </div>

      {/* Multi-Tab Bar */}
      <div
        style={{
          display: 'flex',
          gap: '6px',
          overflowX: 'auto',
          paddingBottom: '4px',
        }}
      >
        {openTabs.map((tabPath) => {
          const isCurrent = tabPath === activeFile?.path;
          return (
            <div
              key={tabPath}
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '8px',
                padding: '7px 12px',
                borderRadius: '10px',
                background: isCurrent ? 'rgba(79, 70, 229, 0.9)' : 'var(--glass-bg-strong)',
                color: isCurrent ? '#ffffff' : 'var(--text-main)',
                fontSize: '0.82rem',
                fontWeight: 600,
                cursor: 'pointer',
                whiteSpace: 'nowrap',
                border: '1px solid var(--glass-border)',
              }}
              onClick={() => onSelectFile(tabPath)}
            >
              <span>{tabPath}</span>
              {openTabs.length > 1 && (
                <span
                  onClick={(e) => {
                    e.stopPropagation();
                    onCloseTab(tabPath);
                  }}
                  style={{ opacity: 0.8, fontWeight: 800, padding: '0 2px' }}
                >
                  ×
                </span>
              )}
            </div>
          );
        })}
      </div>

      {/* Find & Replace Drawer */}
      {showFindBar && (
        <div
          className="metric-card"
          style={{
            padding: '12px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            alignItems: 'center',
          }}
        >
          <input
            type="text"
            className="glass-input"
            placeholder="Find in file..."
            value={findQuery}
            onChange={(e) => setFindQuery(e.target.value)}
            style={{ width: '180px', padding: '7px 10px' }}
          />
          <input
            type="text"
            className="glass-input"
            placeholder="Replace with..."
            value={replaceQuery}
            onChange={(e) => setReplaceQuery(e.target.value)}
            style={{ width: '180px', padding: '7px 10px' }}
          />
          <button type="button" className="glass-btn" onClick={handleReplaceAll}>
            Replace All ({matchCount})
          </button>
        </div>
      )}

      {/* Editor Surface with Mobile Coding Symbol Bar & Line Numbers */}
      <div
        style={{
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '18px',
          overflow: 'hidden',
          border: '1px solid rgba(148, 163, 184, 0.3)',
          background: 'var(--surface-code)',
          minHeight: '380px',
        }}
      >
        {/* Mobile Coding Quick-Symbol Bar */}
        <div className="symbol-bar" aria-label="Mobile Coding Symbol Bar">
          {MOBILE_SYMBOLS.map((sym) => (
            <button
              key={sym}
              type="button"
              className="symbol-key"
              onClick={() => insertSymbolAtCursor(sym)}
            >
              {sym}
            </button>
          ))}
        </div>

        {/* Code Area */}
        <div style={{ display: 'flex', flex: 1, position: 'relative', overflow: 'hidden' }}>
          {/* Line Gutter */}
          <div
            aria-hidden="true"
            style={{
              padding: '14px 10px',
              background: 'rgba(15, 23, 42, 0.96)',
              color: '#64748b',
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
              fontSize: '0.84rem',
              lineHeight: '1.55',
              textAlign: 'right',
              userSelect: 'none',
              borderRight: '1px solid rgba(148, 163, 184, 0.16)',
              minWidth: '46px',
            }}
          >
            {Array.from({ length: lineCount }).map((_, idx) => (
              <div key={idx}>{idx + 1}</div>
            ))}
          </div>

          <textarea
            ref={textareaRef}
            value={content}
            onChange={(e) => activeFile && onUpdateFileContent(activeFile.path, e.target.value)}
            onKeyDown={handleKeyDown}
            onClick={updateCursorMetrics}
            onKeyUp={updateCursorMetrics}
            spellCheck={false}
            autoCapitalize="off"
            autoComplete="off"
            autoCorrect="off"
            style={{
              flex: 1,
              width: '100%',
              padding: '14px',
              background: 'transparent',
              color: 'var(--surface-code-text)',
              border: 'none',
              outline: 'none',
              resize: 'none',
              fontFamily: '"JetBrains Mono", "Fira Code", monospace',
              fontSize: '0.86rem',
              lineHeight: '1.55',
              whiteSpace: wordWrap ? 'pre-wrap' : 'pre',
              overflowWrap: wordWrap ? 'break-word' : 'normal',
            }}
          />
        </div>
      </div>
    </div>
  );
};
