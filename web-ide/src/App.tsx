import React, { useState, useEffect, useRef } from 'react';
import {
  StudioTab,
  StudioProject,
  ProjectFile,
  ProjectSettings,
  BuildRecord,
} from './types';
import { LiquidGlassPanel } from './components/LiquidGlassPanel';
import { SidebarNav } from './components/SidebarNav';
import { ModalDialog, ModalConfig } from './components/ModalDialog';
import { OverviewPanel } from './features/overview/OverviewPanel';
import { WorkspacePanel } from './features/workspace/WorkspacePanel';
import { CodeEditorPanel } from './features/editor/CodeEditorPanel';
import { LivePreviewPanel } from './features/preview/LivePreviewPanel';
import { CustomizationStudioPanel } from './features/studios/CustomizationStudioPanel';
import { BuildEnginePanel } from './features/builder/BuildEnginePanel';
import { createProjectFromTemplate } from './services/templates';
import {
  loadAllProjects,
  saveProject,
  deleteProjectById,
  loadBuildHistory,
  saveBuildRecord,
  getActiveProjectId,
  setActiveProjectId,
  getSavedDarkMode,
  setSavedDarkMode,
} from './services/storage';
import {
  importProjectFromZip,
  exportProjectAsZipBlob,
  triggerBrowserDownload,
} from './services/archive';

export const App: React.FC = () => {
  const [activeTab, setActiveTab] = useState<StudioTab>('overview');
  const [projects, setProjects] = useState<StudioProject[]>([]);
  const [activeProject, setActiveProject] = useState<StudioProject | null>(null);
  const [openTabs, setOpenTabs] = useState<string[]>(['index.html']);
  const [activeFilePath, setActiveFilePath] = useState<string>('index.html');
  const [unsavedPaths, setUnsavedPaths] = useState<Set<string>>(new Set());
  const [buildHistory, setBuildHistory] = useState<BuildRecord[]>([]);
  const [darkMode, setDarkMode] = useState<boolean>(getSavedDarkMode());
  const [modalConfig, setModalConfig] = useState<ModalConfig | null>(null);
  const [statusBanner, setStatusBanner] = useState<string | null>(null);

  const autosaveTimerRef = useRef<number | null>(null);

  useEffect(() => {
    document.body.classList.toggle('theme-dark', darkMode);
    setSavedDarkMode(darkMode);
  }, [darkMode]);

  useEffect(() => {
    (async () => {
      const loadedProjects = await loadAllProjects();
      const savedActiveId = getActiveProjectId();
      const chosen =
        loadedProjects.find((p) => p.id === savedActiveId) || loadedProjects[0];
      setProjects(loadedProjects);
      setActiveProject(chosen);
      const entry = chosen.settings.entryFile || chosen.files[0]?.path || 'index.html';
      setOpenTabs([entry]);
      setActiveFilePath(entry);

      const history = await loadBuildHistory();
      setBuildHistory(history);
    })();
  }, []);

  const showToastBanner = (msg: string) => {
    setStatusBanner(msg);
    window.setTimeout(() => {
      setStatusBanner((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const persistProjectUpdate = (updated: StudioProject, immediate = false) => {
    setActiveProject(updated);
    setProjects((prev) => {
      const idx = prev.findIndex((p) => p.id === updated.id);
      if (idx >= 0) {
        const copy = [...prev];
        copy[idx] = updated;
        return copy;
      }
      return [updated, ...prev];
    });

    if (autosaveTimerRef.current) {
      window.clearTimeout(autosaveTimerRef.current);
    }

    if (immediate) {
      saveProject(updated).then(() => {
        setUnsavedPaths(new Set());
      });
    } else {
      autosaveTimerRef.current = window.setTimeout(() => {
        saveProject(updated).then(() => {
          setUnsavedPaths(new Set());
        });
      }, 500);
    }
  };

  if (!activeProject) {
    return (
      <div className="liquid-wrapper">
        <LiquidGlassPanel className="main-view">
          <h1 className="header-title">Loading APK Studio Workspace...</h1>
        </LiquidGlassPanel>
      </div>
    );
  }

  const handleSelectProject = (projectId: string) => {
    const found = projects.find((p) => p.id === projectId);
    if (!found) return;
    setActiveProject(found);
    setActiveProjectId(found.id);
    const firstFile = found.settings.entryFile || found.files[0]?.path || 'index.html';
    setOpenTabs([firstFile]);
    setActiveFilePath(firstFile);
    setUnsavedPaths(new Set());
    showToastBanner(`Switched to "${found.name}"`);
  };

  const handleCreateProject = (templateId: string, name: string, packageName: string) => {
    const created = createProjectFromTemplate(templateId, name, packageName);
    setActiveProjectId(created.id);
    persistProjectUpdate(created, true);
    const entry = created.settings.entryFile || 'index.html';
    setOpenTabs([entry]);
    setActiveFilePath(entry);
    showToastBanner(`Created project "${created.name}"`);
  };

  const handleDeleteProject = async (projectId: string) => {
    await deleteProjectById(projectId);
    const remaining = projects.filter((p) => p.id !== projectId);
    if (remaining.length === 0) {
      const fallback = createProjectFromTemplate('liquid-glass-starter');
      await saveProject(fallback);
      setProjects([fallback]);
      setActiveProject(fallback);
      setActiveProjectId(fallback.id);
    } else {
      setProjects(remaining);
      if (activeProject.id === projectId) {
        setActiveProject(remaining[0]);
        setActiveProjectId(remaining[0].id);
      }
    }
    showToastBanner('Deleted project');
  };

  const handleImportZip = async (file: File) => {
    try {
      const imported = await importProjectFromZip(file);
      setActiveProjectId(imported.id);
      persistProjectUpdate(imported, true);
      const entry = imported.settings.entryFile || imported.files[0]?.path || 'index.html';
      setOpenTabs([entry]);
      setActiveFilePath(entry);
      showToastBanner(`Imported "${imported.name}" (${imported.files.length} files)`);
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      setModalConfig({
        isOpen: true,
        title: 'ZIP Import Failed',
        message: msg,
        mode: 'alert',
        confirmLabel: 'OK',
        onConfirm: () => setModalConfig(null),
        onCancel: () => setModalConfig(null),
      });
    }
  };

  const handleExportZip = async () => {
    const { blob } = await exportProjectAsZipBlob(activeProject);
    const safeName = activeProject.name.toLowerCase().replace(/[^a-z0-9_-]/g, '-') || 'project';
    triggerBrowserDownload(blob, `${safeName}-backup.zip`);
    showToastBanner(`Exported "${safeName}-backup.zip"`);
  };

  const handleOpenFileInEditor = (filePath: string) => {
    if (!openTabs.includes(filePath)) {
      setOpenTabs((prev) => [...prev, filePath]);
    }
    setActiveFilePath(filePath);
    setActiveTab('editor');
  };

  const handleUpdateFileContent = (filePath: string, newContent: string) => {
    setUnsavedPaths((prev) => new Set(prev).add(filePath));
    const nextFiles = activeProject.files.map((f) =>
      f.path === filePath ? { ...f, content: newContent, updatedAt: Date.now() } : f
    );
    persistProjectUpdate({ ...activeProject, files: nextFiles }, false);
  };

  const handleAddFile = (newFile: ProjectFile) => {
    const exists = activeProject.files.some((f) => f.path === newFile.path);
    const nextFiles = exists
      ? activeProject.files.map((f) => (f.path === newFile.path ? newFile : f))
      : [...activeProject.files, newFile];
    persistProjectUpdate({ ...activeProject, files: nextFiles }, true);
    if (!newFile.isBinary) {
      handleOpenFileInEditor(newFile.path);
    }
    showToastBanner(`Added ${newFile.path}`);
  };

  const handleRenameFile = (oldPath: string, newPath: string) => {
    const nextFiles = activeProject.files.map((f) =>
      f.path === oldPath ? { ...f, path: newPath, updatedAt: Date.now() } : f
    );
    const nextSettings =
      activeProject.settings.entryFile === oldPath
        ? { ...activeProject.settings, entryFile: newPath }
        : activeProject.settings;
    persistProjectUpdate(
      { ...activeProject, files: nextFiles, settings: nextSettings },
      true
    );
    setOpenTabs((prev) => prev.map((t) => (t === oldPath ? newPath : t)));
    if (activeFilePath === oldPath) {
      setActiveFilePath(newPath);
    }
    showToastBanner(`Renamed to ${newPath}`);
  };

  const handleDeleteFile = (filePath: string) => {
    const nextFiles = activeProject.files.filter((f) => f.path !== filePath);
    persistProjectUpdate({ ...activeProject, files: nextFiles }, true);
    const nextTabs = openTabs.filter((t) => t !== filePath);
    const fallbackTab = nextTabs[0] || nextFiles[0]?.path || 'index.html';
    setOpenTabs(nextTabs.length > 0 ? nextTabs : [fallbackTab]);
    if (activeFilePath === filePath) {
      setActiveFilePath(fallbackTab);
    }
    showToastBanner(`Deleted ${filePath}`);
  };

  const handleUpdateSettings = (partial: Partial<ProjectSettings>) => {
    const nextSettings = { ...activeProject.settings, ...partial };
    const nextName = partial.appName ? partial.appName : activeProject.name;
    persistProjectUpdate(
      { ...activeProject, name: nextName, settings: nextSettings },
      false
    );
  };

  const handleSaveBuildRecord = async (record: BuildRecord) => {
    await saveBuildRecord(record);
    const updated = await loadBuildHistory();
    setBuildHistory(updated);
  };

  return (
    <div className="liquid-wrapper">
      <SidebarNav
        activeTab={activeTab}
        onSelectTab={setActiveTab}
        activeProjectName={activeProject.name}
        fileCount={activeProject.files.length}
        unsavedCount={unsavedPaths.size}
        darkMode={darkMode}
        onToggleDarkMode={() => setDarkMode((d) => !d)}
      />

      <LiquidGlassPanel className="main-view">
        {statusBanner && (
          <div
            style={{
              marginBottom: '12px',
              padding: '8px 14px',
              borderRadius: '10px',
              background: 'rgba(79, 70, 229, 0.9)',
              color: '#ffffff',
              fontSize: '0.84rem',
              fontWeight: 600,
              alignSelf: 'flex-start',
            }}
          >
            ✨ {statusBanner}
          </div>
        )}

        {activeTab === 'overview' && (
          <OverviewPanel
            project={activeProject}
            allProjects={projects}
            buildHistory={buildHistory}
            onNavigate={setActiveTab}
            onQuickImportZip={handleImportZip}
            onQuickExportZip={handleExportZip}
          />
        )}

        {activeTab === 'workspace' && (
          <WorkspacePanel
            project={activeProject}
            allProjects={projects}
            onSelectProject={handleSelectProject}
            onCreateProject={handleCreateProject}
            onDeleteProject={handleDeleteProject}
            onImportZip={handleImportZip}
            onExportZip={handleExportZip}
            onOpenFileInEditor={handleOpenFileInEditor}
            onAddFile={handleAddFile}
            onRenameFile={handleRenameFile}
            onDeleteFile={handleDeleteFile}
            onRequestPrompt={(opts) =>
              setModalConfig({
                isOpen: true,
                title: opts.title,
                message: opts.message,
                mode: 'prompt',
                defaultValue: opts.defaultValue,
                placeholder: opts.placeholder,
                onConfirm: (val) => {
                  setModalConfig(null);
                  if (val) opts.onConfirm(val);
                },
                onCancel: () => setModalConfig(null),
              })
            }
            onRequestConfirm={(opts) =>
              setModalConfig({
                isOpen: true,
                title: opts.title,
                message: opts.message,
                mode: 'confirm',
                danger: opts.danger,
                confirmLabel: 'Confirm',
                onConfirm: () => {
                  setModalConfig(null);
                  opts.onConfirm();
                },
                onCancel: () => setModalConfig(null),
              })
            }
          />
        )}

        {activeTab === 'editor' && (
          <CodeEditorPanel
            project={activeProject}
            openTabs={openTabs}
            activeFilePath={activeFilePath}
            onSelectFile={setActiveFilePath}
            onCloseTab={(tabPath) => {
              const next = openTabs.filter((t) => t !== tabPath);
              setOpenTabs(next);
              if (activeFilePath === tabPath && next.length > 0) {
                setActiveFilePath(next[next.length - 1]);
              }
            }}
            onUpdateFileContent={handleUpdateFileContent}
            onSaveNow={() => {
              persistProjectUpdate(activeProject, true);
              showToastBanner('All changes saved to IndexedDB');
            }}
            onPreviewNow={() => setActiveTab('preview')}
          />
        )}

        {activeTab === 'preview' && <LivePreviewPanel project={activeProject} />}

        {activeTab === 'customize' && (
          <CustomizationStudioPanel
            project={activeProject}
            onUpdateSettings={handleUpdateSettings}
          />
        )}

        {activeTab === 'builder' && (
          <BuildEnginePanel
            project={activeProject}
            buildHistory={buildHistory}
            onSaveBuildRecord={handleSaveBuildRecord}
            onUpdateSettings={handleUpdateSettings}
          />
        )}
      </LiquidGlassPanel>

      <ModalDialog config={modalConfig} />
    </div>
  );
};
