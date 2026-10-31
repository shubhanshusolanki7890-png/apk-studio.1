import React, { useState } from 'react';
import { StudioProject, ProjectFile } from '../../types';
import { STARTER_TEMPLATES } from '../../services/templates';
import { sanitizeArchivePath } from '../../services/archive';

interface WorkspacePanelProps {
  project: StudioProject;
  allProjects: StudioProject[];
  onSelectProject: (projectId: string) => void;
  onCreateProject: (templateId: string, name: string, packageName: string) => void;
  onDeleteProject: (projectId: string) => void;
  onImportZip: (file: File) => void;
  onExportZip: () => void;
  onOpenFileInEditor: (filePath: string) => void;
  onAddFile: (file: ProjectFile) => void;
  onRenameFile: (oldPath: string, newPath: string) => void;
  onDeleteFile: (filePath: string) => void;
  onRequestPrompt: (opts: {
    title: string;
    message?: string;
    defaultValue?: string;
    placeholder?: string;
    onConfirm: (val: string) => void;
  }) => void;
  onRequestConfirm: (opts: {
    title: string;
    message: string;
    danger?: boolean;
    onConfirm: () => void;
  }) => void;
}

export const WorkspacePanel: React.FC<WorkspacePanelProps> = ({
  project,
  allProjects,
  onSelectProject,
  onCreateProject,
  onDeleteProject,
  onImportZip,
  onExportZip,
  onOpenFileInEditor,
  onAddFile,
  onRenameFile,
  onDeleteFile,
  onRequestPrompt,
  onRequestConfirm,
}) => {
  const [selectedTemplate, setSelectedTemplate] = useState(STARTER_TEMPLATES[0].id);
  const [newProjName, setNewProjName] = useState('');
  const [newProjPkg, setNewProjPkg] = useState('');
  const [fileFilter, setFileFilter] = useState('');

  const handleCreateProject = (e: React.FormEvent) => {
    e.preventDefault();
    const tpl = STARTER_TEMPLATES.find((t) => t.id === selectedTemplate) || STARTER_TEMPLATES[0];
    const finalName = newProjName.trim() || tpl.name;
    const slug = finalName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'app';
    const finalPkg = newProjPkg.trim() || `com.apkstudio.${slug}`;
    onCreateProject(tpl.id, finalName, finalPkg);
    setNewProjName('');
    setNewProjPkg('');
  };

  const handleCreateNewFile = () => {
    onRequestPrompt({
      title: 'Create New File',
      message: 'Enter a relative file path (for example: pages/about.html, scripts/utils.js, or styles/theme.css):',
      placeholder: 'components/widget.js',
      onConfirm: (rawPath) => {
        const clean = sanitizeArchivePath(rawPath);
        if (!clean) return;
        onAddFile({
          path: clean,
          content: clean.endsWith('.html')
            ? '<!DOCTYPE html>\n<html>\n<head>\n  <meta charset="UTF-8" />\n  <title>New Page</title>\n</head>\n<body>\n  <h1>New Page</h1>\n</body>\n</html>\n'
            : clean.endsWith('.css')
            ? '/* Stylesheet */\nbody {\n  margin: 0;\n}\n'
            : '// JavaScript module\nconsole.log("Loaded ' + clean + '");\n',
          isBinary: false,
          updatedAt: Date.now(),
        });
      },
    });
  };

  const handleAssetUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    const isText = /\.(html?|css|js|mjs|cjs|ts|tsx|jsx|json|md|txt|svg|xml|py)$/i.test(file.name);
    const reader = new FileReader();
    reader.onload = () => {
      const result = typeof reader.result === 'string' ? reader.result : '';
      const targetPath = sanitizeArchivePath(file.name) || file.name;
      onAddFile({
        path: targetPath,
        content: result,
        isBinary: !isText,
        mimeType: file.type || 'application/octet-stream',
        updatedAt: Date.now(),
      });
    };
    if (isText) {
      reader.readAsText(file);
    } else {
      reader.readAsDataURL(file);
    }
    e.target.value = '';
  };

  const filteredFiles = project.files.filter((f) =>
    f.path.toLowerCase().includes(fileFilter.toLowerCase())
  );

  return (
    <div style={{ display: 'flex', flexDirection: 'column', gap: '20px' }}>
      <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' }}>
        <div>
          <h1 className="header-title">Project & File Explorer</h1>
          <p className="header-sub" style={{ marginBottom: 0 }}>
            Create projects from starter templates, import/export ZIP archives, and manage files.
          </p>
        </div>
        <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
          <label className="glass-btn" style={{ cursor: 'pointer' }}>
            <span>📥 Import ZIP Project</span>
            <input
              type="file"
              accept=".zip,application/zip"
              onChange={(e) => {
                const f = e.target.files?.[0];
                if (f) onImportZip(f);
                e.target.value = '';
              }}
              style={{ display: 'none' }}
            />
          </label>
          <button type="button" className="glass-btn" onClick={onExportZip}>
            📤 Export Project ZIP
          </button>
        </div>
      </div>

      {/* Saved Projects Switcher & Template Creator */}
      <div
        style={{
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
        }}
      >
        <div className="metric-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>
            Saved Workspace Projects ({allProjects.length})
          </h3>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' }}>
            {allProjects.map((p) => {
              const isCurrent = p.id === project.id;
              return (
                <div
                  key={p.id}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: '12px',
                    background: isCurrent ? 'rgba(79, 70, 229, 0.16)' : 'rgba(255,255,255,0.28)',
                    border: isCurrent ? '1px solid #4f46e5' : '1px solid var(--glass-border)',
                  }}
                >
                  <div
                    onClick={() => onSelectProject(p.id)}
                    style={{ cursor: 'pointer', flex: 1, minWidth: 0 }}
                  >
                    <div style={{ fontWeight: 700, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {p.name}
                    </div>
                    <div style={{ fontSize: '0.75rem', color: 'var(--text-sub)', fontFamily: 'monospace' }}>
                      {p.settings.packageName} • {p.files.length} files
                    </div>
                  </div>
                  {allProjects.length > 1 && (
                    <button
                      type="button"
                      className="glass-btn glass-btn-danger"
                      style={{ padding: '5px 9px', fontSize: '0.75rem' }}
                      onClick={() =>
                        onRequestConfirm({
                          title: 'Delete Project',
                          message: `Delete "${p.name}" from local storage? This cannot be undone.`,
                          danger: true,
                          onConfirm: () => onDeleteProject(p.id),
                        })
                      }
                    >
                      Delete
                    </button>
                  )}
                </div>
              );
            })}
          </div>
        </div>

        <form onSubmit={handleCreateProject} className="metric-card" style={{ display: 'flex', flexDirection: 'column', gap: '10px' }}>
          <h3 style={{ fontSize: '1rem', fontWeight: 700 }}>Create New Project from Template</h3>
          <select
            className="glass-select"
            value={selectedTemplate}
            onChange={(e) => setSelectedTemplate(e.target.value)}
          >
            {STARTER_TEMPLATES.map((tpl) => (
              <option key={tpl.id} value={tpl.id}>
                {tpl.name} ({tpl.category})
              </option>
            ))}
          </select>
          <input
            type="text"
            className="glass-input"
            placeholder="Project Name (e.g. My Weather App)"
            value={newProjName}
            onChange={(e) => setNewProjName(e.target.value)}
          />
          <input
            type="text"
            className="glass-input"
            placeholder="Package ID (e.g. com.mycompany.weather)"
            value={newProjPkg}
            onChange={(e) => setNewProjPkg(e.target.value)}
          />
          <button type="submit" className="glass-btn glass-btn-primary" style={{ marginTop: 'auto' }}>
            ✨ Create & Switch Project
          </button>
        </form>
      </div>

      {/* File Tree Explorer */}
      <div className="metric-card" style={{ display: 'flex', flexDirection: 'column', gap: '12px' }}>
        <div style={{ display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '10px' }}>
          <h3 style={{ fontSize: '1.05rem', fontWeight: 700 }}>
            Files in "{project.name}" ({project.files.length})
          </h3>
          <div style={{ display: 'flex', gap: '8px', flexWrap: 'wrap' }}>
            <input
              type="text"
              className="glass-input"
              placeholder="Filter files..."
              value={fileFilter}
              onChange={(e) => setFileFilter(e.target.value)}
              style={{ width: '180px', padding: '7px 12px' }}
            />
            <button type="button" className="glass-btn" onClick={handleCreateNewFile}>
              + New File
            </button>
            <label className="glass-btn" style={{ cursor: 'pointer' }}>
              <span>+ Upload File/Asset</span>
              <input type="file" onChange={handleAssetUpload} style={{ display: 'none' }} />
            </label>
          </div>
        </div>

        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {filteredFiles.map((file) => {
            const isEntry = file.path === project.settings.entryFile;
            return (
              <div
                key={file.path}
                style={{
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  background: 'rgba(255,255,255,0.32)',
                  border: '1px solid var(--glass-border)',
                }}
              >
                <div
                  onClick={() => !file.isBinary && onOpenFileInEditor(file.path)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: file.isBinary ? 'default' : 'pointer',
                    flex: 1,
                    minWidth: 0,
                  }}
                >
                  <span>{file.isBinary ? '🖼️' : file.path.endsWith('.html') ? '🌐' : file.path.endsWith('.css') ? '🎨' : '📄'}</span>
                  <div style={{ minWidth: 0 }}>
                    <div style={{ fontWeight: 600, fontSize: '0.9rem', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                      {file.path}
                      {isEntry && (
                        <span
                          style={{
                            marginLeft: '8px',
                            fontSize: '0.7rem',
                            padding: '2px 6px',
                            borderRadius: '999px',
                            background: '#4f46e5',
                            color: '#fff',
                          }}
                        >
                          Entry
                        </span>
                      )}
                    </div>
                    <div style={{ fontSize: '0.74rem', color: 'var(--text-sub)' }}>
                      {(file.content.length / 1024).toFixed(2)} KB • {file.isBinary ? 'Binary Asset' : 'Source Text'}
                    </div>
                  </div>
                </div>

                <div style={{ display: 'flex', gap: '6px' }}>
                  {!file.isBinary && (
                    <button
                      type="button"
                      className="glass-btn"
                      style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                      onClick={() => onOpenFileInEditor(file.path)}
                    >
                      Edit
                    </button>
                  )}
                  <button
                    type="button"
                    className="glass-btn"
                    style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                    onClick={() =>
                      onRequestPrompt({
                        title: 'Rename / Move File',
                        defaultValue: file.path,
                        onConfirm: (nextPath) => {
                          const clean = sanitizeArchivePath(nextPath);
                          if (clean && clean !== file.path) {
                            onRenameFile(file.path, clean);
                          }
                        },
                      })
                    }
                  >
                    Rename
                  </button>
                  {project.files.length > 1 && (
                    <button
                      type="button"
                      className="glass-btn glass-btn-danger"
                      style={{ padding: '6px 10px', fontSize: '0.78rem' }}
                      onClick={() =>
                        onRequestConfirm({
                          title: 'Delete File',
                          message: `Remove "${file.path}" from "${project.name}"?`,
                          danger: true,
                          onConfirm: () => onDeleteFile(file.path),
                        })
                      }
                    >
                      ✕
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
};
