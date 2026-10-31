(function() {
  "use strict";
  const modules = {};
  const cache = {};

  function createReactRuntime() {
    let hookIndex = 0;
    let rootContainer = null;
    let rootElement = null;
    let renderScheduled = false;

    const componentState = new Map();
    const componentRefs = new Map();
    const componentEffects = new Map();
    let currentPath = "root";

    function scheduleRender() {
      if (renderScheduled) return;
      renderScheduled = true;
      Promise.resolve().then(() => {
        renderScheduled = false;
        if (rootContainer && rootElement) {
          renderApp();
        }
      });
    }

    const React = {
      StrictMode: function StrictMode(props) { return props.children; },
      Fragment: function Fragment(props) { return props.children; },
      createElement: function(type, props, ...children) {
        const flatChildren = [];
        function flatten(arr) {
          for (const item of arr) {
            if (Array.isArray(item)) flatten(item);
            else if (item !== null && item !== undefined && item !== false && item !== true) {
              flatChildren.push(item);
            }
          }
        }
        flatten(children);
        return {
          type,
          props: Object.assign({}, props, {
            children: flatChildren.length === 1 ? flatChildren[0] : flatChildren.length === 0 ? undefined : flatChildren
          })
        };
      },
      useState: function(initialValue) {
        const key = currentPath + "#" + (hookIndex++);
        if (!componentState.has(key)) {
          componentState.set(key, typeof initialValue === "function" ? initialValue() : initialValue);
        }
        const setState = (updater) => {
          const prev = componentState.get(key);
          const next = typeof updater === "function" ? updater(prev) : updater;
          if (next !== prev) {
            componentState.set(key, next);
            scheduleRender();
          }
        };
        return [componentState.get(key), setState];
      },
      useRef: function(initialValue) {
        const key = currentPath + "#ref_" + (hookIndex++);
        if (!componentRefs.has(key)) {
          componentRefs.set(key, { current: initialValue });
        }
        return componentRefs.get(key);
      },
      useMemo: function(factory) {
        return factory();
      },
      useEffect: function(effect, deps) {
        const key = currentPath + "#eff_" + (hookIndex++);
        const prevDeps = componentEffects.get(key);
        const changed = !prevDeps || !deps || deps.length !== prevDeps.length || deps.some((d, i) => d !== prevDeps[i]);
        if (changed) {
          componentEffects.set(key, deps);
          setTimeout(() => {
            try { effect(); } catch (e) { console.error(e); }
          }, 0);
        }
      }
    };
    React.default = React;

    function createDomNode(vnode, pathKey) {
      if (vnode === null || vnode === undefined || typeof vnode === "boolean") {
        return document.createTextNode("");
      }
      if (typeof vnode === "string" || typeof vnode === "number") {
        return document.createTextNode(String(vnode));
      }
      if (Array.isArray(vnode)) {
        const frag = document.createDocumentFragment();
        vnode.forEach((child, idx) => frag.appendChild(createDomNode(child, pathKey + "." + idx)));
        return frag;
      }
      if (typeof vnode.type === "function") {
        const prevPath = currentPath;
        const prevHook = hookIndex;
        currentPath = pathKey + "/" + (vnode.type.name || "fn");
        hookIndex = 0;
        const rendered = vnode.type(vnode.props || {});
        currentPath = prevPath;
        hookIndex = prevHook;
        return createDomNode(rendered, pathKey + "_c");
      }

      const tag = String(vnode.type || "div");
      const el = document.createElement(tag);
      const props = vnode.props || {};

      for (const [k, v] of Object.entries(props)) {
        if (k === "children" || k === "key" || v === undefined || v === null) continue;
        if (k === "ref" && typeof v === "object") {
          v.current = el;
        } else if (k === "className") {
          el.className = String(v);
        } else if (k === "style" && typeof v === "object") {
          Object.assign(el.style, v);
        } else if (k.startsWith("on") && typeof v === "function") {
          const eventName = k.slice(2).toLowerCase();
          el.addEventListener(eventName === "change" && (tag === "input" || tag === "textarea") ? "input" : eventName, v);
        } else if (k === "checked" || k === "disabled" || k === "value" || k === "readOnly") {
          el[k] = v;
        } else if (typeof v === "boolean") {
          if (v) el.setAttribute(k, "");
        } else {
          el.setAttribute(k, String(v));
        }
      }

      const children = props.children;
      if (children !== undefined && children !== null) {
        if (Array.isArray(children)) {
          children.forEach((c, idx) => el.appendChild(createDomNode(c, pathKey + "." + idx)));
        } else {
          el.appendChild(createDomNode(children, pathKey + ".0"));
        }
      }
      return el;
    }

    function renderApp() {
      if (!rootContainer || !rootElement) return;
      const dom = createDomNode(rootElement, "app");
      rootContainer.innerHTML = "";
      rootContainer.appendChild(dom);
    }

    const ReactDOM = {
      createRoot: function(container) {
        rootContainer = container;
        return {
          render: function(element) {
            rootElement = element;
            renderApp();
          }
        };
      }
    };
    ReactDOM.default = ReactDOM;

    return { React, ReactDOM };
  }

  class JSZipShim {
    constructor() {
      this.files = {};
    }
    file(name, content, options) {
      if (arguments.length === 1) return this.files[name];
      this.files[name] = {
        name,
        dir: false,
        _content: content,
        _options: options || {},
        async: async function(type) {
          if (type === "string") return String(this._content || "");
          if (type === "base64") return String(this._content || "");
          return new TextEncoder().encode(String(this._content || ""));
        }
      };
      return this;
    }
    static async loadAsync(blobOrBytes) {
      const zip = new JSZipShim();
      let bytes;
      if (blobOrBytes instanceof Uint8Array) {
        bytes = blobOrBytes;
      } else if (blobOrBytes && typeof blobOrBytes.arrayBuffer === "function") {
        bytes = new Uint8Array(await blobOrBytes.arrayBuffer());
      } else if (typeof Buffer !== "undefined" && Buffer.isBuffer(blobOrBytes)) {
        bytes = new Uint8Array(blobOrBytes);
      } else {
        bytes = new Uint8Array(0);
      }
      let offset = 0;
      const decoder = new TextDecoder("utf-8", { fatal: false });
      while (offset + 30 <= bytes.length) {
        if (bytes[offset] !== 0x50 || bytes[offset + 1] !== 0x4b || bytes[offset + 2] !== 0x03 || bytes[offset + 3] !== 0x04) {
          break;
        }
        const compression = bytes[offset + 8] | (bytes[offset + 9] << 8);
        const compSize = (bytes[offset + 18] | (bytes[offset + 19] << 8) | (bytes[offset + 20] << 16) | (bytes[offset + 21] << 24)) >>> 0;
        const nameLen = bytes[offset + 26] | (bytes[offset + 27] << 8);
        const extraLen = bytes[offset + 28] | (bytes[offset + 29] << 8);
        const nameBytes = bytes.slice(offset + 30, offset + 30 + nameLen);
        const fileName = decoder.decode(nameBytes);
        const dataStart = offset + 30 + nameLen + extraLen;
        const dataBytes = bytes.slice(dataStart, dataStart + compSize);
        if (!fileName.endsWith("/")) {
          let textContent = "";
          if (compression === 0) {
            textContent = decoder.decode(dataBytes);
          } else if (typeof DecompressionStream !== "undefined") {
            try {
              const ds = new DecompressionStream("deflate-raw");
              const writer = ds.writable.getWriter();
              writer.write(dataBytes);
              writer.close();
              const outBuf = await new Response(ds.readable).arrayBuffer();
              textContent = decoder.decode(new Uint8Array(outBuf));
            } catch {
              textContent = decoder.decode(dataBytes);
            }
          }
          zip.file(fileName, textContent);
        }
        offset = dataStart + compSize;
      }
      return zip;
    }
    async generateAsync() {
      const encoder = new TextEncoder();
      const entries = Object.values(this.files);
      const localParts = [];
      const centralParts = [];
      let offset = 0;

      const CRC_TABLE = new Uint32Array(256);
      for (let n = 0; n < 256; n++) {
        let c = n;
        for (let k = 0; k < 8; k++) c = c & 1 ? 0xedb88320 ^ (c >>> 1) : c >>> 1;
        CRC_TABLE[n] = c >>> 0;
      }
      function crc32(buf) {
        let c = -1;
        for (let i = 0; i < buf.length; i++) {
          c = (c >>> 8) ^ CRC_TABLE[(c ^ buf[i]) & 0xff];
        }
        return (c ^ -1) >>> 0;
      }

      for (const entry of entries) {
        const nameBytes = encoder.encode(entry.name);
        let dataBytes;
        if (entry._options && entry._options.base64 && typeof atob === "function") {
          const binStr = atob(String(entry._content || ""));
          dataBytes = new Uint8Array(binStr.length);
          for (let i = 0; i < binStr.length; i++) dataBytes[i] = binStr.charCodeAt(i);
        } else {
          dataBytes = encoder.encode(String(entry._content || ""));
        }
        const crc = crc32(dataBytes);
        const localHeader = new Uint8Array(30 + nameBytes.length);
        const lv = new DataView(localHeader.buffer);
        lv.setUint32(0, 0x04034b50, true);
        lv.setUint16(4, 20, true);
        lv.setUint16(8, 0, true);
        lv.setUint32(14, crc, true);
        lv.setUint32(18, dataBytes.length, true);
        lv.setUint32(22, dataBytes.length, true);
        lv.setUint16(26, nameBytes.length, true);
        localHeader.set(nameBytes, 30);

        const centralHeader = new Uint8Array(46 + nameBytes.length);
        const cv = new DataView(centralHeader.buffer);
        cv.setUint32(0, 0x02014b50, true);
        cv.setUint16(4, 20, true);
        cv.setUint16(6, 20, true);
        cv.setUint32(16, crc, true);
        cv.setUint32(20, dataBytes.length, true);
        cv.setUint32(24, dataBytes.length, true);
        cv.setUint16(28, nameBytes.length, true);
        cv.setUint32(42, offset, true);
        centralHeader.set(nameBytes, 46);

        localParts.push(localHeader, dataBytes);
        centralParts.push(centralHeader);
        offset += localHeader.length + dataBytes.length;
      }

      const centralSize = centralParts.reduce((s, p) => s + p.length, 0);
      const eocd = new Uint8Array(22);
      const ev = new DataView(eocd.buffer);
      ev.setUint32(0, 0x06054b50, true);
      ev.setUint16(8, entries.length, true);
      ev.setUint16(10, entries.length, true);
      ev.setUint32(12, centralSize, true);
      ev.setUint32(16, offset, true);

      const totalLen = offset + centralSize + 22;
      const out = new Uint8Array(totalLen);
      let pos = 0;
      for (const p of localParts) { out.set(p, pos); pos += p.length; }
      for (const p of centralParts) { out.set(p, pos); pos += p.length; }
      out.set(eocd, pos);
      return out;
    }
  }
  JSZipShim.default = JSZipShim;

  const runtime = createReactRuntime();
  modules["react"] = function(module) { module.exports = runtime.React; };
  modules["react-dom/client"] = function(module) { module.exports = runtime.ReactDOM; };
  modules["jszip"] = function(module) { module.exports = JSZipShim; };

  function resolveModulePath(fromModule, request) {
    if (!request.startsWith(".")) {
      if (request.endsWith(".css")) return "__css_noop__";
      return request;
    }
    if (request.endsWith(".css")) return "__css_noop__";
    const fromParts = fromModule.split("/").filter(function(s) { return s && s !== "."; }).slice(0, -1);
    const reqParts = request.split("/");
    const combined = [...fromParts];
    for (const seg of reqParts) {
      if (seg === "." || seg === "") continue;
      if (seg === "..") combined.pop();
      else combined.push(seg);
    }
    const candidate = "./" + combined.filter(Boolean).join("/");
    if (modules[candidate]) return candidate;
    if (modules[candidate + "/index"]) return candidate + "/index";
    return candidate;
  }

  modules["__css_noop__"] = function() {};

  function requireModule(id, fromId) {
    const resolved = fromId ? resolveModulePath(fromId, id) : id;
    if (cache[resolved]) return cache[resolved].exports;
    const factory = modules[resolved];
    if (!factory) {
      throw new Error("Module not found: " + resolved + " (requested from " + fromId + ")");
    }
    const mod = { exports: {} };
    cache[resolved] = mod;
    factory(mod, mod.exports, (req) => requireModule(req, resolved));
    return mod.exports;
  }

  modules["./App"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const React = (() => { const _m = require("react"); return _m && _m.__esModule && _m.default !== undefined ? _m.default : _m; })(); const { useState, useEffect, useRef } = require("react");
const { StudioTab, StudioProject, ProjectFile, ProjectSettings, BuildRecord } = require("./types");
const { LiquidGlassPanel } = require("./components/LiquidGlassPanel");
const { SidebarNav } = require("./components/SidebarNav");
const { ModalDialog, ModalConfig } = require("./components/ModalDialog");
const { OverviewPanel } = require("./features/overview/OverviewPanel");
const { WorkspacePanel } = require("./features/workspace/WorkspacePanel");
const { CodeEditorPanel } = require("./features/editor/CodeEditorPanel");
const { LivePreviewPanel } = require("./features/preview/LivePreviewPanel");
const { CustomizationStudioPanel } = require("./features/studios/CustomizationStudioPanel");
const { BuildEnginePanel } = require("./features/builder/BuildEnginePanel");
const { createProjectFromTemplate } = require("./services/templates");
const { loadAllProjects, saveProject, deleteProjectById, loadBuildHistory, saveBuildRecord, getActiveProjectId, setActiveProjectId, getSavedDarkMode, setSavedDarkMode } = require("./services/storage");
const { importProjectFromZip, exportProjectAsZipBlob, triggerBrowserDownload } = require("./services/archive");

const App = () => {
  const [activeTab, setActiveTab] = useState('overview');
  const [projects, setProjects] = useState([]);
  const [activeProject, setActiveProject] = useState(null);
  const [openTabs, setOpenTabs] = useState(['index.html']);
  const [activeFilePath, setActiveFilePath] = useState('index.html');
  const [unsavedPaths, setUnsavedPaths] = useState(new Set());
  const [buildHistory, setBuildHistory] = useState([]);
  const [darkMode, setDarkMode] = useState(getSavedDarkMode());
  const [modalConfig, setModalConfig] = useState(null);
  const [statusBanner, setStatusBanner] = useState(null);

  const autosaveTimerRef = useRef(null);

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

  const showToastBanner = (msg) => {
    setStatusBanner(msg);
    window.setTimeout(() => {
      setStatusBanner((prev) => (prev === msg ? null : prev));
    }, 3500);
  };

  const persistProjectUpdate = (updated, immediate = false) => {
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
      React.createElement("div", { "className": "liquid-wrapper" }, React.createElement(LiquidGlassPanel, { "className": "main-view" }, React.createElement("h1", { "className": "header-title" }, "Loading APK Studio Workspace...")))
    );
  }

  const handleSelectProject = (projectId) => {
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

  const handleCreateProject = (templateId, name, packageName) => {
    const created = createProjectFromTemplate(templateId, name, packageName);
    setActiveProjectId(created.id);
    persistProjectUpdate(created, true);
    const entry = created.settings.entryFile || 'index.html';
    setOpenTabs([entry]);
    setActiveFilePath(entry);
    showToastBanner(`Created project "${created.name}"`);
  };

  const handleDeleteProject = async (projectId) => {
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

  const handleImportZip = async (file) => {
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

  const handleOpenFileInEditor = (filePath) => {
    if (!openTabs.includes(filePath)) {
      setOpenTabs((prev) => [...prev, filePath]);
    }
    setActiveFilePath(filePath);
    setActiveTab('editor');
  };

  const handleUpdateFileContent = (filePath, newContent) => {
    setUnsavedPaths((prev) => new Set(prev).add(filePath));
    const nextFiles = activeProject.files.map((f) =>
      f.path === filePath ? { ...f, content: newContent, updatedAt: Date.now() } : f
    );
    persistProjectUpdate({ ...activeProject, files: nextFiles }, false);
  };

  const handleAddFile = (newFile) => {
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

  const handleRenameFile = (oldPath, newPath) => {
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

  const handleDeleteFile = (filePath) => {
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

  const handleUpdateSettings = (partial) => {
    const nextSettings = { ...activeProject.settings, ...partial };
    const nextName = partial.appName ? partial.appName : activeProject.name;
    persistProjectUpdate(
      { ...activeProject, name: nextName, settings: nextSettings },
      false
    );
  };

  const handleSaveBuildRecord = async (record) => {
    await saveBuildRecord(record);
    const updated = await loadBuildHistory();
    setBuildHistory(updated);
  };

  return (
    React.createElement("div", { "className": "liquid-wrapper" }, React.createElement(SidebarNav, { "activeTab": activeTab, "onSelectTab": setActiveTab, "activeProjectName": activeProject.name, "fileCount": activeProject.files.length, "unsavedCount": unsavedPaths.size, "darkMode": darkMode, "onToggleDarkMode": () => setDarkMode((d) => !d) }), React.createElement(LiquidGlassPanel, { "className": "main-view" }, statusBanner && (
          React.createElement("div", { "style": {
              marginBottom: '12px',
              padding: '8px 14px',
              borderRadius: '10px',
              background: 'rgba(79, 70, 229, 0.9)',
              color: '#ffffff',
              fontSize: '0.84rem',
              fontWeight: 600,
              alignSelf: 'flex-start',
            } }, "✨ ", statusBanner)
        ), activeTab === 'overview' && (
          React.createElement(OverviewPanel, { "project": activeProject, "allProjects": projects, "buildHistory": buildHistory, "onNavigate": setActiveTab, "onQuickImportZip": handleImportZip, "onQuickExportZip": handleExportZip })
        ), activeTab === 'workspace' && (
          React.createElement(WorkspacePanel, { "project": activeProject, "allProjects": projects, "onSelectProject": handleSelectProject, "onCreateProject": handleCreateProject, "onDeleteProject": handleDeleteProject, "onImportZip": handleImportZip, "onExportZip": handleExportZip, "onOpenFileInEditor": handleOpenFileInEditor, "onAddFile": handleAddFile, "onRenameFile": handleRenameFile, "onDeleteFile": handleDeleteFile, "onRequestPrompt": (opts) =>
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
              }), "onRequestConfirm": (opts) =>
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
              }) })
        ), activeTab === 'editor' && (
          React.createElement(CodeEditorPanel, { "project": activeProject, "openTabs": openTabs, "activeFilePath": activeFilePath, "onSelectFile": setActiveFilePath, "onCloseTab": (tabPath) => {
              const next = openTabs.filter((t) => t !== tabPath);
              setOpenTabs(next);
              if (activeFilePath === tabPath && next.length > 0) {
                setActiveFilePath(next[next.length - 1]);
              }
            }, "onUpdateFileContent": handleUpdateFileContent, "onSaveNow": () => {
              persistProjectUpdate(activeProject, true);
              showToastBanner('All changes saved to IndexedDB');
            }, "onPreviewNow": () => setActiveTab('preview') })
        ), activeTab === 'preview' && React.createElement(LivePreviewPanel, { "project": activeProject }), activeTab === 'customize' && (
          React.createElement(CustomizationStudioPanel, { "project": activeProject, "onUpdateSettings": handleUpdateSettings })
        ), activeTab === 'builder' && (
          React.createElement(BuildEnginePanel, { "project": activeProject, "buildHistory": buildHistory, "onSaveBuildRecord": handleSaveBuildRecord, "onUpdateSettings": handleUpdateSettings })
        )), React.createElement(ModalDialog, { "config": modalConfig }))
  );
};
exports.App = App;


  };

  modules["./components/LiquidGlassPanel"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const React = (() => { const _m = require("react"); return _m && _m.__esModule && _m.default !== undefined ? _m.default : _m; })();



const LiquidGlassPanel = ({
  children,
  className = '',
  contentClassName = '',
  style,
}) => {
  return (
    React.createElement("div", { "className": `liquid-glass-panel ${className}`.trim(), "style": style }, React.createElement("div", { "className": "glass-backdrop", "aria-hidden": "true" }), React.createElement("div", { "className": `panel-content ${contentClassName}`.trim() }, children))
  );
};
exports.LiquidGlassPanel = LiquidGlassPanel;


  };

  modules["./components/ModalDialog"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const React = (() => { const _m = require("react"); return _m && _m.__esModule && _m.default !== undefined ? _m.default : _m; })(); const { useState, useEffect } = require("react");



const ModalDialog = ({ config }) => {
  const [inputValue, setInputValue] = useState(config?.defaultValue || '');

  useEffect(() => {
    if (config?.isOpen) {
      setInputValue(config.defaultValue || '');
    }
  }, [config]);

  if (!config || !config.isOpen) return null;

  const handleSubmit = (e) => {
    e.preventDefault();
    config.onConfirm(config.mode === 'prompt' ? inputValue.trim() : undefined);
  };

  return (
    React.createElement("div", { "role": "dialog", "aria-modal": "true", "style": {
        position: 'fixed',
        inset: 0,
        zIndex: 999,
        background: 'rgba(15, 23, 42, 0.55)',
        backdropFilter: 'blur(8px)',
        display: 'flex',
        alignItems: 'center',
        justifyContent: 'center',
        padding: '16px',
      } }, React.createElement("form", { "onSubmit": handleSubmit, "className": "liquid-glass-panel", "style": { width: '100%', maxWidth: '420px', borderRadius: '22px' } }, React.createElement("div", { "className": "glass-backdrop" }), React.createElement("div", { "className": "panel-content", "style": { padding: '22px' } }, React.createElement("h3", { "style": { fontSize: '1.15rem', fontWeight: 700, marginBottom: '8px' } }, config.title), config.message && (
            React.createElement("p", { "style": { fontSize: '0.9rem', color: 'var(--text-sub)', marginBottom: '14px', lineHeight: 1.45 } }, config.message)
          ), config.mode === 'prompt' && (
            React.createElement("input", { "type": "text", "className": "glass-input", "value": inputValue, "onChange": (e) => setInputValue(e.target.value), "placeholder": config.placeholder || '', "autoFocus": true, "style": { marginBottom: '16px' } })
          ), React.createElement("div", { "style": { display: 'flex', justifyContent: 'flex-end', gap: '10px' } }, config.mode !== 'alert' && (
              React.createElement("button", { "type": "button", "className": "glass-btn", "onClick": config.onCancel }, "Cancel")
            ), React.createElement("button", { "type": "submit", "className": `glass-btn ${config.danger ? 'glass-btn-danger' : 'glass-btn-primary'}` }, config.confirmLabel || 'Confirm')))))
  );
};
exports.ModalDialog = ModalDialog;


  };

  modules["./components/SidebarNav"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const React = (() => { const _m = require("react"); return _m && _m.__esModule && _m.default !== undefined ? _m.default : _m; })();
const { StudioTab } = require("../types");
const { LiquidGlassPanel } = require("./LiquidGlassPanel");



const NAV_ITEMS = [
  { id: 'overview', icon: '⚡', label: 'Overview' },
  { id: 'workspace', icon: '📁', label: 'Project & Files' },
  { id: 'editor', icon: '💻', label: 'Code Editor' },
  { id: 'preview', icon: '📱', label: 'Live Preview' },
  { id: 'customize', icon: '🎨', label: 'App & Icon Studio' },
  { id: 'builder', icon: '🚀', label: 'APK Build Engine' },
];

const SidebarNav = ({
  activeTab,
  onSelectTab,
  activeProjectName,
  fileCount,
  unsavedCount,
  darkMode,
  onToggleDarkMode,
}) => {
  return (
    React.createElement(LiquidGlassPanel, { "className": "sidebar" }, React.createElement("div", { "style": { display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: '12px' } }, React.createElement("div", null, React.createElement("h2", { "style": { fontSize: '1.15rem', fontWeight: 800, letterSpacing: '-0.3px' } }, "APK Studio"), React.createElement("div", { "style": { fontSize: '0.76rem', color: 'var(--text-sub)', fontWeight: 600 } }, "Liquid Glass Mobile IDE")), React.createElement("button", { "type": "button", "className": "glass-btn", "onClick": onToggleDarkMode, "title": darkMode ? 'Switch to Light Glass' : 'Switch to Dark Glass', "style": { padding: '7px 10px', borderRadius: '10px' } }, darkMode ? '☀️' : '🌙')), React.createElement("div", { "style": {
          padding: '10px 12px',
          borderRadius: '14px',
          background: 'rgba(255,255,255,0.28)',
          border: '1px solid var(--glass-border)',
          marginBottom: '12px',
        } }, React.createElement("div", { "style": { fontSize: '0.72rem', textTransform: 'uppercase', letterSpacing: '0.5px', color: 'var(--text-sub)', fontWeight: 700 } }, "Active Project"), React.createElement("div", { "style": { fontSize: '0.92rem', fontWeight: 700, marginTop: '2px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, activeProjectName), React.createElement("div", { "style": { fontSize: '0.76rem', color: 'var(--text-sub)', marginTop: '2px', display: 'flex', justifyContent: 'space-between' } }, React.createElement("span", null, fileCount, " files"), unsavedCount > 0 ? (
            React.createElement("span", { "style": { color: '#d97706', fontWeight: 700 } }, unsavedCount, " unsaved")
          ) : (
            React.createElement("span", { "style": { color: '#16a34a', fontWeight: 700 } }, "Saved")
          ))), React.createElement("nav", { "className": "nav-scroll-row", "aria-label": "Main Studio Navigation" }, NAV_ITEMS.map((item) => (
          React.createElement("button", { "key": item.id, "type": "button", "className": `nav-item ${activeTab === item.id ? 'active' : ''}`, "onClick": () => onSelectTab(item.id) }, React.createElement("span", { "aria-hidden": "true" }, item.icon), React.createElement("span", null, item.label), item.id === 'editor' && unsavedCount > 0 && (
              React.createElement("span", { "style": {
                  marginLeft: 'auto',
                  background: '#f59e0b',
                  color: '#fff',
                  fontSize: '0.7rem',
                  padding: '2px 6px',
                  borderRadius: '999px',
                } }, unsavedCount)
            ))
        ))))
  );
};
exports.SidebarNav = SidebarNav;


  };

  modules["./features/builder/BuildEnginePanel"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const React = (() => { const _m = require("react"); return _m && _m.__esModule && _m.default !== undefined ? _m.default : _m; })(); const { useState } = require("react");
const { StudioProject, BuildRecord, BuildStageLog, ProjectSettings } = require("../../types");
const { validateProjectForAndroid, generateCompileReadyAndroidZip, generateAndroidManifestXml } = require("../../services/androidGenerator");
const { triggerBrowserDownload } = require("../../services/archive");



const BuildEnginePanel = ({
  project,
  buildHistory,
  onSaveBuildRecord,
  onUpdateSettings,
}) => {
  const [isBuilding, setIsBuilding] = useState(false);
  const [activeStages, setActiveStages] = useState([]);
  const [showManifestPreview, setShowManifestPreview] = useState(false);
  const [remoteError, setRemoteError] = useState(null);

  const validation = validateProjectForAndroid(project);

  const handleGenerateAndroidProjectBundle = async () => {
    setIsBuilding(true);
    setRemoteError(null);
    const now = Date.now();
    const stages = [
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
      const failedRecord = {
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

      const record = {
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
    const stages = [
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

      const record = {
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
    React.createElement("div", { "style": { display: 'flex', flexDirection: 'column', gap: '20px' } }, React.createElement("div", { "style": { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' } }, React.createElement("div", null, React.createElement("h1", { "className": "header-title" }, "APK Build Engine & CI/CD Pipeline"), React.createElement("p", { "className": "header-sub", "style": { marginBottom: 0 } }, "Real Android project generation, GitHub Actions CI/CD workflow packaging, and remote Gradle build integration.")), React.createElement("button", { "type": "button", "className": "glass-btn", "onClick": () => setShowManifestPreview((v) => !v) }, showManifestPreview ? 'Hide Manifest XML' : '📄 Inspect AndroidManifest.xml')), showManifestPreview && (
        React.createElement("pre", { "style": {
            padding: '16px',
            borderRadius: '16px',
            background: 'rgba(15, 23, 42, 0.92)',
            color: '#38bdf8',
            fontSize: '0.8rem',
            overflowX: 'auto',
            border: '1px solid rgba(148, 163, 184, 0.3)',
          } }, generateAndroidManifestXml(project))
      ), React.createElement("div", { "style": {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(290px, 1fr))',
          gap: '16px',
        } }, React.createElement("div", { "className": "metric-card", "style": { display: 'flex', flexDirection: 'column', gap: '12px' } }, React.createElement("div", { "style": { fontSize: '0.75rem', fontWeight: 700, color: '#4f46e5', textTransform: 'uppercase' } }, "Recommended on Mobile (Works 100% Offline in Browser)"), React.createElement("h3", { "style": { fontSize: '1.1rem', fontWeight: 800 } }, "Export Compile-Ready Android Project + GitHub Actions"), React.createElement("p", { "style": { fontSize: '0.85rem', color: 'var(--text-sub)', lineHeight: 1.45 } }, "Generates a complete Android Gradle project containing your web assets, custom ", React.createElement("code", null, "AndroidManifest.xml"), ", secure ", React.createElement("code", null, "WebViewAssetLoader"), " Java activity, and a ready-to-run ", React.createElement("code", null, ".github/workflows/build-apk.yml"), " workflow."), React.createElement("button", { "type": "button", "className": "glass-btn glass-btn-primary", "disabled": isBuilding, "onClick": handleGenerateAndroidProjectBundle, "style": { marginTop: 'auto' } }, isBuilding ? '⏳ Generating Package...' : '📦 Generate & Download Android Project (.zip)')), React.createElement("div", { "className": "metric-card", "style": { display: 'flex', flexDirection: 'column', gap: '12px' } }, React.createElement("div", { "style": { fontSize: '0.75rem', fontWeight: 700, color: '#db2777', textTransform: 'uppercase' } }, "Remote / Local Gradle Build Server"), React.createElement("h3", { "style": { fontSize: '1.1rem', fontWeight: 800 } }, "Compile APK via Backend Service"), React.createElement("p", { "style": { fontSize: '0.85rem', color: 'var(--text-sub)', lineHeight: 1.45 } }, "Submits your project to the APK Studio Node.js backend server. Requires the backend server to be running with Android SDK & Gradle installed."), React.createElement("input", { "type": "url", "className": "glass-input", "value": project.settings.backendUrl, "onChange": (e) => onUpdateSettings({ backendUrl: e.target.value }), "placeholder": "http://localhost:4000" }), React.createElement("button", { "type": "button", "className": "glass-btn", "disabled": isBuilding, "onClick": handleBackendBuildRequest }, "🚀 Trigger Backend Gradle Build"))), remoteError && (
        React.createElement("div", { "className": "metric-card", "style": {
            borderColor: 'rgba(239, 68, 68, 0.5)',
            background: 'rgba(239, 68, 68, 0.12)',
            color: '#b91c1c',
            fontSize: '0.86rem',
            fontWeight: 600,
          } }, "⚠️ ", remoteError)
      ), activeStages.length > 0 && (
        React.createElement("div", { "className": "metric-card", "style": { display: 'flex', flexDirection: 'column', gap: '10px' } }, React.createElement("h3", { "style": { fontSize: '1rem', fontWeight: 700 } }, "Build Stage Execution Log"), activeStages.map((st) => (
            React.createElement("div", { "key": st.id, "style": {
                display: 'flex',
                alignItems: 'flex-start',
                gap: '10px',
                padding: '10px 12px',
                borderRadius: '10px',
                background: 'rgba(255,255,255,0.3)',
              } }, React.createElement("span", null, st.status === 'passed'
                  ? '✅'
                  : st.status === 'failed'
                  ? '❌'
                  : '⏳'), React.createElement("div", null, React.createElement("div", { "style": { fontWeight: 700, fontSize: '0.88rem' } }, st.label), React.createElement("div", { "style": { fontSize: '0.78rem', color: 'var(--text-sub)', fontFamily: 'monospace' } }, st.detail)))
          )))
      ), React.createElement("div", { "className": "metric-card", "style": { display: 'flex', flexDirection: 'column', gap: '10px' } }, React.createElement("h3", { "style": { fontSize: '1rem', fontWeight: 700 } }, "Build History (", buildHistory.length, ")"), buildHistory.length === 0 ? (
          React.createElement("div", { "style": { fontSize: '0.85rem', color: 'var(--text-sub)' } }, "No builds recorded yet. Generate an Android project bundle or trigger a backend build above.")
        ) : (
          React.createElement("div", { "style": { display: 'flex', flexDirection: 'column', gap: '8px' } }, buildHistory.slice(0, 10).map((b) => (
              React.createElement("div", { "key": b.id, "style": {
                  display: 'flex',
                  flexWrap: 'wrap',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  gap: '8px',
                  padding: '10px 12px',
                  borderRadius: '12px',
                  background: 'rgba(255,255,255,0.28)',
                  border: '1px solid var(--glass-border)',
                } }, React.createElement("div", null, React.createElement("div", { "style": { fontWeight: 700, fontSize: '0.88rem' } }, b.projectName, " (", b.packageName, " v", b.versionName, ")"), React.createElement("div", { "style": { fontSize: '0.75rem', color: 'var(--text-sub)', fontFamily: 'monospace' } }, new Date(b.createdAt).toLocaleString(), " • Mode: ", b.mode, b.sha256 ? ` • SHA-256: ${b.sha256.slice(0, 16)}...` : '')), React.createElement("span", { "style": {
                    fontSize: '0.76rem',
                    fontWeight: 700,
                    padding: '4px 10px',
                    borderRadius: '999px',
                    background:
                      b.status === 'succeeded'
                        ? 'rgba(22, 163, 74, 0.18)'
                        : 'rgba(220, 38, 38, 0.18)',
                    color: b.status === 'succeeded' ? '#15803d' : '#b91c1c',
                  } }, b.status.toUpperCase()))
            )))
        )))
  );
};
exports.BuildEnginePanel = BuildEnginePanel;


  };

  modules["./features/editor/CodeEditorPanel"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const React = (() => { const _m = require("react"); return _m && _m.__esModule && _m.default !== undefined ? _m.default : _m; })(); const { useState, useRef, useEffect } = require("react");
const { StudioProject } = require("../../types");



const MOBILE_SYMBOLS = ['Tab', '{', '}', '(', ')', '[', ']', '<', '>', '/', '=', '"', "'", ';', ':', '$', '!'];

const CodeEditorPanel = ({
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
  const textareaRef = useRef(null);

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

  const insertSymbolAtCursor = (sym) => {
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

  const handleKeyDown = (e) => {
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
    React.createElement("div", { "style": { display: 'flex', flexDirection: 'column', gap: '12px', height: '100%', minHeight: '540px' } }, React.createElement("div", { "style": { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '10px' } }, React.createElement("div", null, React.createElement("h1", { "className": "header-title", "style": { fontSize: '1.45rem', marginBottom: '2px' } }, "Mobile Code Editor"), React.createElement("div", { "style": { fontSize: '0.82rem', color: 'var(--text-sub)' } }, "Editing ", React.createElement("strong", null, activeFile?.path), " • Line ", cursorInfo.line, ", Col ", cursorInfo.col)), React.createElement("div", { "style": { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, React.createElement("button", { "type": "button", "className": "glass-btn", "onClick": () => setShowFindBar((v) => !v) }, "🔍 Find & Replace"), React.createElement("button", { "type": "button", "className": "glass-btn", "onClick": () => setWordWrap((w) => !w) }, wordWrap ? '↩️ Wrap: On' : '➡️ Wrap: Off'), React.createElement("button", { "type": "button", "className": "glass-btn", "onClick": onSaveNow }, "💾 Save"), React.createElement("button", { "type": "button", "className": "glass-btn glass-btn-primary", "onClick": onPreviewNow }, "▶️ Run Preview"))), React.createElement("div", { "style": {
          display: 'flex',
          gap: '6px',
          overflowX: 'auto',
          paddingBottom: '4px',
        } }, openTabs.map((tabPath) => {
          const isCurrent = tabPath === activeFile?.path;
          return (
            React.createElement("div", { "key": tabPath, "style": {
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
              }, "onClick": () => onSelectFile(tabPath) }, React.createElement("span", null, tabPath), openTabs.length > 1 && (
                React.createElement("span", { "onClick": (e) => {
                    e.stopPropagation();
                    onCloseTab(tabPath);
                  }, "style": { opacity: 0.8, fontWeight: 800, padding: '0 2px' } }, "×")
              ))
          );
        })), showFindBar && (
        React.createElement("div", { "className": "metric-card", "style": {
            padding: '12px',
            display: 'flex',
            flexWrap: 'wrap',
            gap: '8px',
            alignItems: 'center',
          } }, React.createElement("input", { "type": "text", "className": "glass-input", "placeholder": "Find in file...", "value": findQuery, "onChange": (e) => setFindQuery(e.target.value), "style": { width: '180px', padding: '7px 10px' } }), React.createElement("input", { "type": "text", "className": "glass-input", "placeholder": "Replace with...", "value": replaceQuery, "onChange": (e) => setReplaceQuery(e.target.value), "style": { width: '180px', padding: '7px 10px' } }), React.createElement("button", { "type": "button", "className": "glass-btn", "onClick": handleReplaceAll }, "Replace All (", matchCount, ")"))
      ), React.createElement("div", { "style": {
          flex: 1,
          display: 'flex',
          flexDirection: 'column',
          borderRadius: '18px',
          overflow: 'hidden',
          border: '1px solid rgba(148, 163, 184, 0.3)',
          background: 'var(--surface-code)',
          minHeight: '380px',
        } }, React.createElement("div", { "className": "symbol-bar", "aria-label": "Mobile Coding Symbol Bar" }, MOBILE_SYMBOLS.map((sym) => (
            React.createElement("button", { "key": sym, "type": "button", "className": "symbol-key", "onClick": () => insertSymbolAtCursor(sym) }, sym)
          ))), React.createElement("div", { "style": { display: 'flex', flex: 1, position: 'relative', overflow: 'hidden' } }, React.createElement("div", { "aria-hidden": "true", "style": {
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
            } }, Array.from({ length: lineCount }).map((_, idx) => (
              React.createElement("div", { "key": idx }, idx + 1)
            ))), React.createElement("textarea", { "ref": textareaRef, "value": content, "onChange": (e) => activeFile && onUpdateFileContent(activeFile.path, e.target.value), "onKeyDown": handleKeyDown, "onClick": updateCursorMetrics, "onKeyUp": updateCursorMetrics, "spellCheck": false, "autoCapitalize": "off", "autoComplete": "off", "autoCorrect": "off", "style": {
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
            } }))))
  );
};
exports.CodeEditorPanel = CodeEditorPanel;


  };

  modules["./features/overview/OverviewPanel"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const React = (() => { const _m = require("react"); return _m && _m.__esModule && _m.default !== undefined ? _m.default : _m; })();
const { StudioProject, BuildRecord, StudioTab } = require("../../types");
const { validateProjectForAndroid } = require("../../services/androidGenerator");



const OverviewPanel = ({
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

  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      onQuickImportZip(file);
      e.target.value = '';
    }
  };

  return (
    React.createElement("div", { "style": { display: 'flex', flexDirection: 'column', gap: '20px', height: '100%' } }, React.createElement("div", { "style": { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'flex-start', gap: '12px' } }, React.createElement("div", null, React.createElement("h1", { "className": "header-title" }, "System Diagnostics"), React.createElement("p", { "className": "header-sub", "style": { marginBottom: 0 } }, "Real-time optical refraction, workspace telemetry, and Android APK readiness.")), React.createElement("div", { "style": { display: 'flex', flexWrap: 'wrap', gap: '8px' } }, React.createElement("label", { "className": "glass-btn", "style": { cursor: 'pointer' } }, React.createElement("span", null, "📦 Import ZIP"), React.createElement("input", { "type": "file", "accept": ".zip,application/zip", "onChange": handleFileChange, "style": { display: 'none' } })), React.createElement("button", { "type": "button", "className": "glass-btn", "onClick": onQuickExportZip }, "💾 Backup Project"), React.createElement("button", { "type": "button", "className": "glass-btn glass-btn-primary", "onClick": () => onNavigate('builder') }, "🚀 Build APK"))), React.createElement("div", { "className": "metric-card", "style": {
          display: 'flex',
          flexWrap: 'wrap',
          justifyContent: 'space-between',
          alignItems: 'center',
          gap: '16px',
        } }, React.createElement("div", { "style": { display: 'flex', alignItems: 'center', gap: '14px' } }, project.settings.iconDataUrl ? (
            React.createElement("img", { "src": project.settings.iconDataUrl, "alt": "App Icon", "style": { width: '56px', height: '56px', borderRadius: '14px', objectFit: 'cover', border: '1px solid var(--glass-border)' } })
          ) : (
            React.createElement("div", { "style": {
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
              } }, project.settings.appName.slice(0, 2).toUpperCase())
          ), React.createElement("div", null, React.createElement("div", { "style": { display: 'flex', alignItems: 'center', gap: '8px', flexWrap: 'wrap' } }, React.createElement("h2", { "style": { fontSize: '1.25rem', fontWeight: 800 } }, project.settings.appName), React.createElement("span", { "style": {
                  fontSize: '0.75rem',
                  padding: '2px 8px',
                  borderRadius: '999px',
                  background: validation.valid ? 'rgba(22, 163, 74, 0.18)' : 'rgba(220, 38, 38, 0.18)',
                  color: validation.valid ? '#15803d' : '#b91c1c',
                  fontWeight: 700,
                } }, validation.valid ? 'Manifest Ready' : `${validation.errors.length} Issues`)), React.createElement("div", { "style": { fontSize: '0.85rem', color: 'var(--text-sub)', fontFamily: 'monospace', marginTop: '2px' } }, project.settings.packageName, " • v", project.settings.versionName, " (code ", project.settings.versionCode, ")"), React.createElement("div", { "style": { fontSize: '0.82rem', color: 'var(--text-sub)', marginTop: '4px' } }, "Entry: ", React.createElement("strong", null, project.settings.entryFile), " • Target SDK ", project.settings.targetSdk, " (Min SDK ", project.settings.minSdk, ")"))), React.createElement("div", { "style": { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, React.createElement("button", { "type": "button", "className": "glass-btn", "onClick": () => onNavigate('editor') }, "💻 Edit Code"), React.createElement("button", { "type": "button", "className": "glass-btn", "onClick": () => onNavigate('preview') }, "📱 Live Preview"), React.createElement("button", { "type": "button", "className": "glass-btn", "onClick": () => onNavigate('customize') }, "🎨 Customize"))), React.createElement("div", { "className": "card-grid", "style": { marginTop: '4px' } }, React.createElement("div", { "className": "metric-card", "onClick": () => onNavigate('workspace'), "style": { cursor: 'pointer' } }, React.createElement("div", { "style": { color: 'var(--text-sub)', fontSize: '0.88rem', fontWeight: 600 } }, "Workspace Bundle"), React.createElement("div", { "className": "metric-val" }, project.files.length, " Files"), React.createElement("div", { "style": { color: '#28a745', fontSize: '0.8rem', fontWeight: 700 } }, "● ", totalKb, " KB across ", allProjects.length, " saved project", allProjects.length === 1 ? '' : 's')), React.createElement("div", { "className": "metric-card", "onClick": () => onNavigate('customize'), "style": { cursor: 'pointer' } }, React.createElement("div", { "style": { color: 'var(--text-sub)', fontSize: '0.88rem', fontWeight: 600 } }, "Target Android SDK"), React.createElement("div", { "className": "metric-val" }, "API ", project.settings.targetSdk), React.createElement("div", { "style": { color: 'var(--text-sub)', fontSize: '0.8rem', fontWeight: 600 } }, "Min SDK ", project.settings.minSdk, " • ", project.settings.permissions.length, " permission", project.settings.permissions.length === 1 ? '' : 's')), React.createElement("div", { "className": "metric-card", "onClick": () => onNavigate('preview'), "style": { cursor: 'pointer' } }, React.createElement("div", { "style": { color: 'var(--text-sub)', fontSize: '0.88rem', fontWeight: 600 } }, "Refraction Index"), React.createElement("div", { "className": "metric-val" }, "1.48 η"), React.createElement("div", { "style": { color: 'var(--text-sub)', fontSize: '0.8rem', fontWeight: 600 } }, "WebViewAssetLoader HTTPS Isolation")), React.createElement("div", { "className": "metric-card", "onClick": () => onNavigate('builder'), "style": { cursor: 'pointer' } }, React.createElement("div", { "style": { color: 'var(--text-sub)', fontSize: '0.88rem', fontWeight: 600 } }, "Build Pipeline Status"), React.createElement("div", { "className": "metric-val" }, latestBuild ? (latestBuild.status === 'succeeded' ? 'Ready' : latestBuild.status) : 'Standby'), React.createElement("div", { "style": { color: validation.valid ? '#28a745' : '#d97706', fontSize: '0.8rem', fontWeight: 700 } }, latestBuild
              ? `Last: ${latestBuild.artifactName || latestBuild.mode}`
              : 'Gradle 8.5 + AGP 8.2.2 configured'))), React.createElement("div", { "className": "metric-card", "style": { display: 'flex', flexDirection: 'column', gap: '8px' } }, React.createElement("div", { "style": { fontWeight: 700, fontSize: '0.95rem' } }, "Android Pre-Flight Checklist"), validation.errors.length === 0 ? (
          React.createElement("div", { "style": { fontSize: '0.86rem', color: '#15803d', fontWeight: 600 } }, "✓ Package identifier, version numbers, SDK levels, and HTML entry point are verified for Android compilation.")
        ) : (
          React.createElement("ul", { "style": { paddingLeft: '18px', color: '#dc2626', fontSize: '0.86rem' } }, validation.errors.map((err, i) => (
              React.createElement("li", { "key": i }, err)
            )))
        ), validation.warnings.map((w, i) => (
          React.createElement("div", { "key": i, "style": { fontSize: '0.82rem', color: 'var(--text-sub)' } }, "ℹ️ ", w)
        ))))
  );
};
exports.OverviewPanel = OverviewPanel;


  };

  modules["./features/preview/LivePreviewPanel"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const React = (() => { const _m = require("react"); return _m && _m.__esModule && _m.default !== undefined ? _m.default : _m; })(); const { useState, useEffect, useMemo } = require("react");
const { StudioProject, ConsoleLogEntry } = require("../../types");





function buildSandboxedPreviewHtml(project) {
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

const LivePreviewPanel = ({ project }) => {
  const [viewport, setViewport] = useState('mobile');
  const [landscape, setLandscape] = useState(false);
  const [refreshKey, setRefreshKey] = useState(0);
  const [logs, setLogs] = useState([]);

  useEffect(() => {
    const handler = (event) => {
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
    React.createElement("div", { "style": { display: 'flex', flexDirection: 'column', gap: '16px', height: '100%' } }, React.createElement("div", { "style": { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '10px' } }, React.createElement("div", null, React.createElement("h1", { "className": "header-title", "style": { fontSize: '1.45rem', marginBottom: '2px' } }, "Sandboxed Live Preview"), React.createElement("div", { "style": { fontSize: '0.82rem', color: 'var(--text-sub)' } }, "Entry: ", React.createElement("strong", null, project.settings.entryFile), " • Isolated iframe execution with live console capture")), React.createElement("div", { "style": { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, React.createElement("button", { "type": "button", "className": `glass-btn ${viewport === 'mobile' ? 'glass-btn-primary' : ''}`, "onClick": () => setViewport('mobile') }, "📱 Phone"), React.createElement("button", { "type": "button", "className": `glass-btn ${viewport === 'tablet' ? 'glass-btn-primary' : ''}`, "onClick": () => setViewport('tablet') }, "📟 Tablet"), React.createElement("button", { "type": "button", "className": `glass-btn ${viewport === 'full' ? 'glass-btn-primary' : ''}`, "onClick": () => setViewport('full') }, "🖥️ Full Width"), viewport !== 'full' && (
            React.createElement("button", { "type": "button", "className": "glass-btn", "onClick": () => setLandscape((l) => !l) }, "🔄 ", landscape ? 'Landscape' : 'Portrait')
          ), React.createElement("button", { "type": "button", "className": "glass-btn", "onClick": () => {
              setLogs([]);
              setRefreshKey((k) => k + 1);
            } }, "↻ Reload"))), React.createElement("div", { "style": {
          display: 'flex',
          justifyContent: 'center',
          alignItems: 'center',
          padding: '16px',
          borderRadius: '20px',
          background: 'rgba(15, 23, 42, 0.22)',
          border: '1px solid var(--glass-border)',
          overflowX: 'auto',
        } }, React.createElement("div", { "style": {
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
          } }, React.createElement("div", { "style": {
              height: '24px',
              background: project.settings.statusBarColor || '#4f46e5',
              color: '#ffffff',
              fontSize: '0.7rem',
              fontWeight: 700,
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              padding: '0 12px',
            } }, React.createElement("span", null, "9:41"), React.createElement("span", null, project.settings.appName), React.createElement("span", null, "5G 100%")), React.createElement("iframe", { "key": refreshKey, "title": "Sandboxed App Preview", "sandbox": "allow-scripts", "srcDoc": srcDoc, "style": { width: '100%', flex: 1, border: 'none', background: '#fff' } }))), React.createElement("div", { "style": {
          borderRadius: '16px',
          background: 'rgba(15, 23, 42, 0.92)',
          color: '#f8fafc',
          padding: '14px',
          border: '1px solid rgba(148, 163, 184, 0.25)',
        } }, React.createElement("div", { "style": { display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '8px' } }, React.createElement("span", { "style": { fontSize: '0.82rem', fontWeight: 700, color: '#94a3b8' } }, "VIRTUAL DEVELOPER CONSOLE (", logs.length, ")"), React.createElement("button", { "type": "button", "onClick": () => setLogs([]), "style": {
              background: 'transparent',
              border: '1px solid #475569',
              color: '#cbd5e1',
              borderRadius: '6px',
              padding: '2px 8px',
              fontSize: '0.75rem',
              cursor: 'pointer',
            } }, "Clear")), React.createElement("div", { "style": {
            maxHeight: '140px',
            overflowY: 'auto',
            fontFamily: 'monospace',
            fontSize: '0.8rem',
            display: 'flex',
            flexDirection: 'column',
            gap: '4px',
          } }, logs.length === 0 ? (
            React.createElement("div", { "style": { color: '#64748b' } }, "Console ready. Logs and runtime errors from your previewed app appear here.")
          ) : (
            logs.map((entry) => (
              React.createElement("div", { "key": entry.id, "style": {
                  color:
                    entry.level === 'error'
                      ? '#f87171'
                      : entry.level === 'warn'
                      ? '#fbbf24'
                      : '#38bdf8',
                } }, "[", entry.level.toUpperCase(), "] ", entry.message)
            ))
          ))))
  );
};
exports.LivePreviewPanel = LivePreviewPanel;


  };

  modules["./features/studios/CustomizationStudioPanel"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const React = (() => { const _m = require("react"); return _m && _m.__esModule && _m.default !== undefined ? _m.default : _m; })(); const { useState } = require("react");
const { StudioProject, ProjectSettings, SplashAnimationType, OrientationOption } = require("../../types");



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

const CustomizationStudioPanel = ({
  project,
  onUpdateSettings,
}) => {
  const { settings } = project;
  const [iconInfo, setIconInfo] = useState('Square PNG/JPG/WebP recommended (512×512px)');

  const handleIconUpload = (e) => {
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

  const togglePermission = (permId) => {
    const exists = settings.permissions.includes(permId);
    const next = exists
      ? settings.permissions.filter((p) => p !== permId)
      : [...settings.permissions, permId];
    onUpdateSettings({ permissions: next });
  };

  const htmlFiles = project.files.filter((f) => f.path.endsWith('.html'));

  return (
    React.createElement("div", { "style": { display: 'flex', flexDirection: 'column', gap: '20px' } }, React.createElement("div", null, React.createElement("h1", { "className": "header-title" }, "App, Icon, Splash & Permission Studio"), React.createElement("p", { "className": "header-sub", "style": { marginBottom: 0 } }, "Configure Android manifest identity, SDK levels, launcher icons, splash animations, and permissions.")), React.createElement("div", { "style": {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(300px, 1fr))',
          gap: '16px',
        } }, React.createElement("div", { "className": "metric-card", "style": { display: 'flex', flexDirection: 'column', gap: '12px' } }, React.createElement("h3", { "style": { fontSize: '1.05rem', fontWeight: 700 } }, "1. Android App Identity & SDK"), React.createElement("label", { "style": { fontSize: '0.82rem', fontWeight: 600 } }, "Application Name", React.createElement("input", { "type": "text", "className": "glass-input", "value": settings.appName, "onChange": (e) => onUpdateSettings({ appName: e.target.value }), "style": { marginTop: '4px' } })), React.createElement("label", { "style": { fontSize: '0.82rem', fontWeight: 600 } }, "Package Identifier (Application ID)", React.createElement("input", { "type": "text", "className": "glass-input", "value": settings.packageName, "onChange": (e) => onUpdateSettings({ packageName: e.target.value.trim() }), "placeholder": "com.company.appname", "style": { marginTop: '4px', fontFamily: 'monospace' } })), React.createElement("div", { "style": { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } }, React.createElement("label", { "style": { fontSize: '0.82rem', fontWeight: 600 } }, "Version Name", React.createElement("input", { "type": "text", "className": "glass-input", "value": settings.versionName, "onChange": (e) => onUpdateSettings({ versionName: e.target.value }), "style": { marginTop: '4px' } })), React.createElement("label", { "style": { fontSize: '0.82rem', fontWeight: 600 } }, "Version Code", React.createElement("input", { "type": "number", "min": 1, "className": "glass-input", "value": settings.versionCode, "onChange": (e) =>
                  onUpdateSettings({ versionCode: Math.max(1, parseInt(e.target.value || '1', 10)) }), "style": { marginTop: '4px' } }))), React.createElement("div", { "style": { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } }, React.createElement("label", { "style": { fontSize: '0.82rem', fontWeight: 600 } }, "Min SDK", React.createElement("select", { "className": "glass-select", "value": settings.minSdk, "onChange": (e) => onUpdateSettings({ minSdk: Number(e.target.value) }), "style": { marginTop: '4px' } }, React.createElement("option", { "value": 24 }, "API 24 (Android 7.0)"), React.createElement("option", { "value": 26 }, "API 26 (Android 8.0)"), React.createElement("option", { "value": 28 }, "API 28 (Android 9.0)"), React.createElement("option", { "value": 29 }, "API 29 (Android 10)"))), React.createElement("label", { "style": { fontSize: '0.82rem', fontWeight: 600 } }, "Target SDK", React.createElement("select", { "className": "glass-select", "value": settings.targetSdk, "onChange": (e) => onUpdateSettings({ targetSdk: Number(e.target.value) }), "style": { marginTop: '4px' } }, React.createElement("option", { "value": 33 }, "API 33 (Android 13)"), React.createElement("option", { "value": 34 }, "API 34 (Android 14)"), React.createElement("option", { "value": 35 }, "API 35 (Android 15)")))), React.createElement("div", { "style": { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } }, React.createElement("label", { "style": { fontSize: '0.82rem', fontWeight: 600 } }, "Orientation", React.createElement("select", { "className": "glass-select", "value": settings.orientation, "onChange": (e) =>
                  onUpdateSettings({ orientation: e.target.value }), "style": { marginTop: '4px' } }, React.createElement("option", { "value": "portrait" }, "Portrait"), React.createElement("option", { "value": "landscape" }, "Landscape"), React.createElement("option", { "value": "sensor" }, "Auto Rotate (Sensor)"))), React.createElement("label", { "style": { fontSize: '0.82rem', fontWeight: 600 } }, "Entry HTML File", React.createElement("select", { "className": "glass-select", "value": settings.entryFile, "onChange": (e) => onUpdateSettings({ entryFile: e.target.value }), "style": { marginTop: '4px' } }, htmlFiles.map((f) => (
                  React.createElement("option", { "key": f.path, "value": f.path }, f.path)
                )))))), React.createElement("div", { "className": "metric-card", "style": { display: 'flex', flexDirection: 'column', gap: '12px' } }, React.createElement("h3", { "style": { fontSize: '1.05rem', fontWeight: 700 } }, "2. Launcher Icon & System Bars"), React.createElement("div", { "style": { display: 'flex', alignItems: 'center', gap: '16px' } }, settings.iconDataUrl ? (
              React.createElement("img", { "src": settings.iconDataUrl, "alt": "Launcher Preview", "style": {
                  width: '72px',
                  height: '72px',
                  borderRadius: '18px',
                  objectFit: 'cover',
                  border: '2px solid var(--glass-border)',
                } })
            ) : (
              React.createElement("div", { "style": {
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
                } }, settings.appName.slice(0, 2).toUpperCase())
            ), React.createElement("div", { "style": { display: 'flex', flexDirection: 'column', gap: '6px' } }, React.createElement("div", { "style": { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, React.createElement("label", { "className": "glass-btn", "style": { cursor: 'pointer' } }, React.createElement("span", null, "🖼️ Upload Icon"), React.createElement("input", { "type": "file", "accept": "image/png,image/jpeg,image/webp,image/svg+xml", "onChange": handleIconUpload, "style": { display: 'none' } })), settings.iconDataUrl && (
                  React.createElement("button", { "type": "button", "className": "glass-btn glass-btn-danger", "onClick": () => onUpdateSettings({ iconDataUrl: null }) }, "Reset")
                )), React.createElement("span", { "style": { fontSize: '0.76rem', color: 'var(--text-sub)' } }, iconInfo))), React.createElement("div", { "style": { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } }, React.createElement("label", { "style": { fontSize: '0.82rem', fontWeight: 600 } }, "Status Bar Color", React.createElement("input", { "type": "color", "className": "glass-input", "value": settings.statusBarColor, "onChange": (e) => onUpdateSettings({ statusBarColor: e.target.value }), "style": { marginTop: '4px', height: '42px', padding: '4px' } })), React.createElement("label", { "style": { fontSize: '0.82rem', fontWeight: 600 } }, "Navigation Bar Color", React.createElement("input", { "type": "color", "className": "glass-input", "value": settings.navigationBarColor, "onChange": (e) => onUpdateSettings({ navigationBarColor: e.target.value }), "style": { marginTop: '4px', height: '42px', padding: '4px' } }))), React.createElement("div", { "style": { display: 'flex', flexDirection: 'column', gap: '8px', marginTop: '4px' } }, React.createElement("label", { "style": { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' } }, React.createElement("input", { "type": "checkbox", "checked": settings.fullscreen, "onChange": (e) => onUpdateSettings({ fullscreen: e.target.checked }) }), React.createElement("span", null, "Immersive Fullscreen Mode (Hide Android Status Bar)")), React.createElement("label", { "style": { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' } }, React.createElement("input", { "type": "checkbox", "checked": settings.enableJavaScript, "onChange": (e) => onUpdateSettings({ enableJavaScript: e.target.checked }) }), React.createElement("span", null, "Enable WebView JavaScript Execution")), React.createElement("label", { "style": { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' } }, React.createElement("input", { "type": "checkbox", "checked": settings.enableDomStorage, "onChange": (e) => onUpdateSettings({ enableDomStorage: e.target.checked }) }), React.createElement("span", null, "Enable DOM Storage (localStorage & IndexedDB)")), React.createElement("label", { "style": { display: 'flex', alignItems: 'center', gap: '8px', fontSize: '0.85rem', cursor: 'pointer' } }, React.createElement("input", { "type": "checkbox", "checked": settings.enableZoom, "onChange": (e) => onUpdateSettings({ enableZoom: e.target.checked }) }), React.createElement("span", null, "Allow Pinch-to-Zoom Gesture")))), React.createElement("div", { "className": "metric-card", "style": { display: 'flex', flexDirection: 'column', gap: '12px' } }, React.createElement("h3", { "style": { fontSize: '1.05rem', fontWeight: 700 } }, "3. Splash Screen & Animation Studio"), React.createElement("label", { "style": { fontSize: '0.82rem', fontWeight: 600 } }, "Splash Headline", React.createElement("input", { "type": "text", "className": "glass-input", "value": settings.splashTitle, "onChange": (e) => onUpdateSettings({ splashTitle: e.target.value }), "style": { marginTop: '4px' } })), React.createElement("label", { "style": { fontSize: '0.82rem', fontWeight: 600 } }, "Splash Tagline", React.createElement("input", { "type": "text", "className": "glass-input", "value": settings.splashTagline, "onChange": (e) => onUpdateSettings({ splashTagline: e.target.value }), "style": { marginTop: '4px' } })), React.createElement("div", { "style": { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '10px' } }, React.createElement("label", { "style": { fontSize: '0.82rem', fontWeight: 600 } }, "Splash Animation Preset", React.createElement("select", { "className": "glass-select", "value": settings.splashAnimation, "onChange": (e) =>
                  onUpdateSettings({ splashAnimation: e.target.value }), "style": { marginTop: '4px' } }, React.createElement("option", { "value": "liquid-pulse" }, "Liquid Glass Pulse"), React.createElement("option", { "value": "fade" }, "Smooth Crossfade"), React.createElement("option", { "value": "scale-up" }, "Zoom Scale-Up"), React.createElement("option", { "value": "slide-up" }, "Vertical Slide-Up"))), React.createElement("label", { "style": { fontSize: '0.82rem', fontWeight: 600 } }, "Duration (", settings.splashDurationMs, " ms)", React.createElement("input", { "type": "range", "min": 400, "max": 3000, "step": 200, "value": settings.splashDurationMs, "onChange": (e) => onUpdateSettings({ splashDurationMs: Number(e.target.value) }), "style": { width: '100%', marginTop: '12px' } }))), React.createElement("div", { "style": {
              marginTop: '6px',
              borderRadius: '16px',
              padding: '18px',
              background: settings.splashColor || '#4f46e5',
              color: '#ffffff',
              textAlign: 'center',
              boxShadow: 'inset 0 2px 6px rgba(0,0,0,0.2)',
            } }, React.createElement("div", { "style": { fontWeight: 800, fontSize: '1.05rem' } }, settings.splashTitle), React.createElement("div", { "style": { fontSize: '0.78rem', opacity: 0.85, marginTop: '2px' } }, settings.splashTagline, " • ", settings.splashAnimation, " (", settings.splashDurationMs, "ms)"))), React.createElement("div", { "className": "metric-card", "style": { display: 'flex', flexDirection: 'column', gap: '10px' } }, React.createElement("h3", { "style": { fontSize: '1.05rem', fontWeight: 700 } }, "4. Android Manifest Permissions (", settings.permissions.length, " enabled)"), React.createElement("div", { "style": { display: 'flex', flexDirection: 'column', gap: '8px' } }, ANDROID_PERMISSIONS.map((perm) => {
              const checked = settings.permissions.includes(perm.id);
              return (
                React.createElement("label", { "key": perm.id, "style": {
                    display: 'flex',
                    alignItems: 'flex-start',
                    gap: '10px',
                    padding: '10px',
                    borderRadius: '12px',
                    background: checked ? 'rgba(79, 70, 229, 0.14)' : 'rgba(255,255,255,0.25)',
                    border: '1px solid var(--glass-border)',
                    cursor: 'pointer',
                  } }, React.createElement("input", { "type": "checkbox", "checked": checked, "onChange": () => togglePermission(perm.id), "style": { marginTop: '3px' } }), React.createElement("div", null, React.createElement("div", { "style": { fontSize: '0.85rem', fontWeight: 700 } }, perm.label), React.createElement("div", { "style": { fontSize: '0.75rem', color: 'var(--text-sub)', lineHeight: 1.35 } }, perm.description)))
              );
            })))))
  );
};
exports.CustomizationStudioPanel = CustomizationStudioPanel;


  };

  modules["./features/workspace/WorkspacePanel"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const React = (() => { const _m = require("react"); return _m && _m.__esModule && _m.default !== undefined ? _m.default : _m; })(); const { useState } = require("react");
const { StudioProject, ProjectFile } = require("../../types");
const { STARTER_TEMPLATES } = require("../../services/templates");
const { sanitizeArchivePath } = require("../../services/archive");



const WorkspacePanel = ({
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

  const handleCreateProject = (e) => {
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

  const handleAssetUpload = (e) => {
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
    React.createElement("div", { "style": { display: 'flex', flexDirection: 'column', gap: '20px' } }, React.createElement("div", { "style": { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '12px' } }, React.createElement("div", null, React.createElement("h1", { "className": "header-title" }, "Project & File Explorer"), React.createElement("p", { "className": "header-sub", "style": { marginBottom: 0 } }, "Create projects from starter templates, import/export ZIP archives, and manage files.")), React.createElement("div", { "style": { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, React.createElement("label", { "className": "glass-btn", "style": { cursor: 'pointer' } }, React.createElement("span", null, "📥 Import ZIP Project"), React.createElement("input", { "type": "file", "accept": ".zip,application/zip", "onChange": (e) => {
                const f = e.target.files?.[0];
                if (f) onImportZip(f);
                e.target.value = '';
              }, "style": { display: 'none' } })), React.createElement("button", { "type": "button", "className": "glass-btn", "onClick": onExportZip }, "📤 Export Project ZIP"))), React.createElement("div", { "style": {
          display: 'grid',
          gridTemplateColumns: 'repeat(auto-fit, minmax(280px, 1fr))',
          gap: '16px',
        } }, React.createElement("div", { "className": "metric-card", "style": { display: 'flex', flexDirection: 'column', gap: '10px' } }, React.createElement("h3", { "style": { fontSize: '1rem', fontWeight: 700 } }, "Saved Workspace Projects (", allProjects.length, ")"), React.createElement("div", { "style": { display: 'flex', flexDirection: 'column', gap: '8px', maxHeight: '220px', overflowY: 'auto' } }, allProjects.map((p) => {
              const isCurrent = p.id === project.id;
              return (
                React.createElement("div", { "key": p.id, "style": {
                    display: 'flex',
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    padding: '10px 12px',
                    borderRadius: '12px',
                    background: isCurrent ? 'rgba(79, 70, 229, 0.16)' : 'rgba(255,255,255,0.28)',
                    border: isCurrent ? '1px solid #4f46e5' : '1px solid var(--glass-border)',
                  } }, React.createElement("div", { "onClick": () => onSelectProject(p.id), "style": { cursor: 'pointer', flex: 1, minWidth: 0 } }, React.createElement("div", { "style": { fontWeight: 700, fontSize: '0.9rem', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, p.name), React.createElement("div", { "style": { fontSize: '0.75rem', color: 'var(--text-sub)', fontFamily: 'monospace' } }, p.settings.packageName, " • ", p.files.length, " files")), allProjects.length > 1 && (
                    React.createElement("button", { "type": "button", "className": "glass-btn glass-btn-danger", "style": { padding: '5px 9px', fontSize: '0.75rem' }, "onClick": () =>
                        onRequestConfirm({
                          title: 'Delete Project',
                          message: `Delete "${p.name}" from local storage? This cannot be undone.`,
                          danger: true,
                          onConfirm: () => onDeleteProject(p.id),
                        }) }, "Delete")
                  ))
              );
            }))), React.createElement("form", { "onSubmit": handleCreateProject, "className": "metric-card", "style": { display: 'flex', flexDirection: 'column', gap: '10px' } }, React.createElement("h3", { "style": { fontSize: '1rem', fontWeight: 700 } }, "Create New Project from Template"), React.createElement("select", { "className": "glass-select", "value": selectedTemplate, "onChange": (e) => setSelectedTemplate(e.target.value) }, STARTER_TEMPLATES.map((tpl) => (
              React.createElement("option", { "key": tpl.id, "value": tpl.id }, tpl.name, " (", tpl.category, ")")
            ))), React.createElement("input", { "type": "text", "className": "glass-input", "placeholder": "Project Name (e.g. My Weather App)", "value": newProjName, "onChange": (e) => setNewProjName(e.target.value) }), React.createElement("input", { "type": "text", "className": "glass-input", "placeholder": "Package ID (e.g. com.mycompany.weather)", "value": newProjPkg, "onChange": (e) => setNewProjPkg(e.target.value) }), React.createElement("button", { "type": "submit", "className": "glass-btn glass-btn-primary", "style": { marginTop: 'auto' } }, "✨ Create & Switch Project"))), React.createElement("div", { "className": "metric-card", "style": { display: 'flex', flexDirection: 'column', gap: '12px' } }, React.createElement("div", { "style": { display: 'flex', flexWrap: 'wrap', justifyContent: 'space-between', alignItems: 'center', gap: '10px' } }, React.createElement("h3", { "style": { fontSize: '1.05rem', fontWeight: 700 } }, "Files in \"", project.name, "\" (", project.files.length, ")"), React.createElement("div", { "style": { display: 'flex', gap: '8px', flexWrap: 'wrap' } }, React.createElement("input", { "type": "text", "className": "glass-input", "placeholder": "Filter files...", "value": fileFilter, "onChange": (e) => setFileFilter(e.target.value), "style": { width: '180px', padding: '7px 12px' } }), React.createElement("button", { "type": "button", "className": "glass-btn", "onClick": handleCreateNewFile }, "+ New File"), React.createElement("label", { "className": "glass-btn", "style": { cursor: 'pointer' } }, React.createElement("span", null, "+ Upload File/Asset"), React.createElement("input", { "type": "file", "onChange": handleAssetUpload, "style": { display: 'none' } })))), React.createElement("div", { "style": { display: 'flex', flexDirection: 'column', gap: '6px' } }, filteredFiles.map((file) => {
            const isEntry = file.path === project.settings.entryFile;
            return (
              React.createElement("div", { "key": file.path, "style": {
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  gap: '10px',
                  padding: '10px 14px',
                  borderRadius: '12px',
                  background: 'rgba(255,255,255,0.32)',
                  border: '1px solid var(--glass-border)',
                } }, React.createElement("div", { "onClick": () => !file.isBinary && onOpenFileInEditor(file.path), "style": {
                    display: 'flex',
                    alignItems: 'center',
                    gap: '10px',
                    cursor: file.isBinary ? 'default' : 'pointer',
                    flex: 1,
                    minWidth: 0,
                  } }, React.createElement("span", null, file.isBinary ? '🖼️' : file.path.endsWith('.html') ? '🌐' : file.path.endsWith('.css') ? '🎨' : '📄'), React.createElement("div", { "style": { minWidth: 0 } }, React.createElement("div", { "style": { fontWeight: 600, fontSize: '0.9rem', fontFamily: 'monospace', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' } }, file.path, isEntry && (
                        React.createElement("span", { "style": {
                            marginLeft: '8px',
                            fontSize: '0.7rem',
                            padding: '2px 6px',
                            borderRadius: '999px',
                            background: '#4f46e5',
                            color: '#fff',
                          } }, "Entry")
                      )), React.createElement("div", { "style": { fontSize: '0.74rem', color: 'var(--text-sub)' } }, (file.content.length / 1024).toFixed(2), " KB • ", file.isBinary ? 'Binary Asset' : 'Source Text'))), React.createElement("div", { "style": { display: 'flex', gap: '6px' } }, !file.isBinary && (
                    React.createElement("button", { "type": "button", "className": "glass-btn", "style": { padding: '6px 10px', fontSize: '0.78rem' }, "onClick": () => onOpenFileInEditor(file.path) }, "Edit")
                  ), React.createElement("button", { "type": "button", "className": "glass-btn", "style": { padding: '6px 10px', fontSize: '0.78rem' }, "onClick": () =>
                      onRequestPrompt({
                        title: 'Rename / Move File',
                        defaultValue: file.path,
                        onConfirm: (nextPath) => {
                          const clean = sanitizeArchivePath(nextPath);
                          if (clean && clean !== file.path) {
                            onRenameFile(file.path, clean);
                          }
                        },
                      }) }, "Rename"), project.files.length > 1 && (
                    React.createElement("button", { "type": "button", "className": "glass-btn glass-btn-danger", "style": { padding: '6px 10px', fontSize: '0.78rem' }, "onClick": () =>
                        onRequestConfirm({
                          title: 'Delete File',
                          message: `Remove "${file.path}" from "${project.name}"?`,
                          danger: true,
                          onConfirm: () => onDeleteFile(file.path),
                        }) }, "✕")
                  )))
            );
          }))))
  );
};
exports.WorkspacePanel = WorkspacePanel;


  };

  modules["./main"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const React = (() => { const _m = require("react"); return _m && _m.__esModule && _m.default !== undefined ? _m.default : _m; })();
const ReactDOM = (() => { const _m = require("react-dom/client"); return _m && _m.__esModule && _m.default !== undefined ? _m.default : _m; })();
const { App } = require("./App");
require("./styles/liquid-glass.css");

const rootEl = document.getElementById('root');
if (rootEl) {
  ReactDOM.createRoot(rootEl).render(
    React.createElement(React.StrictMode, null, React.createElement(App, null))
  );
}


  };

  modules["./services/androidGenerator"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const JSZip = (() => { const _m = require("jszip"); return _m && _m.__esModule && _m.default !== undefined ? _m.default : _m; })();
const { StudioProject } = require("../types");
const { computeSha256Hex } = require("./archive");



function validateProjectForAndroid(project) {
  const errors = [];
  const warnings = [];
  const { settings, files } = project;

  if (!settings.appName.trim()) {
    errors.push('Application Name cannot be empty.');
  }

  const pkgRegex = /^[a-z][a-z0-9_]*(\.[a-z][a-z0-9_]*)+$/;
  if (!pkgRegex.test(settings.packageName.trim())) {
    errors.push(
      `Invalid Android Package Name "${settings.packageName}". Must follow reverse-domain format (e.g. com.company.app).`
    );
  }

  if (!/^\d+\.\d+(\.\d+)?(-[a-zA-Z0-9.]+)?$/.test(settings.versionName.trim())) {
    errors.push('Version Name must follow semantic format (e.g. 1.0.0).');
  }

  if (!Number.isInteger(settings.versionCode) || settings.versionCode < 1) {
    errors.push('Version Code must be a positive integer (>= 1).');
  }

  if (settings.minSdk < 21 || settings.minSdk > settings.targetSdk) {
    errors.push(`minSdk (${settings.minSdk}) must be between 21 and targetSdk (${settings.targetSdk}).`);
  }

  const entryExists = files.some((f) => f.path === settings.entryFile);
  if (!entryExists) {
    errors.push(`Entry file "${settings.entryFile}" was not found in project files.`);
  }

  if (!settings.iconDataUrl) {
    warnings.push('No custom app icon uploaded; the default adaptive vector launcher icon will be used.');
  }

  return {
    valid: errors.length === 0,
    errors,
    warnings,
  };
}
exports.validateProjectForAndroid = validateProjectForAndroid;

function generateAndroidManifestXml(project) {
  const { settings } = project;
  const permissionsXml = settings.permissions
    .map((perm) => `    <uses-permission android:name="${perm}" />`)
    .join('\n');

  const screenOrientation =
    settings.orientation === 'portrait'
      ? 'portrait'
      : settings.orientation === 'landscape'
      ? 'landscape'
      : 'unspecified';

  return `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">

${permissionsXml}

    <application
        android:allowBackup="true"
        android:label="@string/app_name"
        android:supportsRtl="true"
        android:usesCleartextTraffic="${settings.allowCleartextTraffic ? 'true' : 'false'}"
        android:theme="@android:style/Theme.DeviceDefault.NoActionBar">
        <activity
            android:name=".MainActivity"
            android:exported="true"
            android:screenOrientation="${screenOrientation}"
            android:configChanges="orientation|screenSize|keyboardHidden">
            <intent-filter>
                <action android:name="android.intent.action.MAIN" />
                <category android:name="android.intent.category.LAUNCHER" />
            </intent-filter>
        </activity>
    </application>
</manifest>
`;
}
exports.generateAndroidManifestXml = generateAndroidManifestXml;

function generateMainActivityJava(project) {
  const { settings } = project;
  return `package ${settings.packageName};

import android.annotation.SuppressLint;
import android.app.Activity;
import android.graphics.Color;
import android.net.Uri;
import android.os.Bundle;
import android.view.View;
import android.view.Window;
import android.view.WindowManager;
import android.webkit.JavascriptInterface;
import android.webkit.WebChromeClient;
import android.webkit.WebResourceRequest;
import android.webkit.WebResourceResponse;
import android.webkit.WebSettings;
import android.webkit.WebView;
import android.webkit.WebViewClient;
import android.widget.Toast;
import androidx.webkit.WebViewAssetLoader;

public class MainActivity extends Activity {
    private WebView webView;

    @SuppressLint("SetJavaScriptEnabled")
    @Override
    protected void onCreate(Bundle savedInstanceState) {
        super.onCreate(savedInstanceState);

        Window window = getWindow();
        window.setStatusBarColor(Color.parseColor("${settings.statusBarColor || '#4f46e5'}"));
        window.setNavigationBarColor(Color.parseColor("${settings.navigationBarColor || '#0f172a'}"));
        ${
          settings.fullscreen
            ? 'window.setFlags(WindowManager.LayoutParams.FLAG_FULLSCREEN, WindowManager.LayoutParams.FLAG_FULLSCREEN);'
            : ''
        }

        webView = new WebView(this);
        setContentView(webView);

        final WebViewAssetLoader assetLoader = new WebViewAssetLoader.Builder()
                .addPathHandler("/assets/", new WebViewAssetLoader.AssetsPathHandler(this))
                .build();

        WebSettings ws = webView.getSettings();
        ws.setJavaScriptEnabled(${settings.enableJavaScript ? 'true' : 'false'});
        ws.setDomStorageEnabled(${settings.enableDomStorage ? 'true' : 'false'});
        ws.setDatabaseEnabled(true);
        ws.setBuiltInZoomControls(${settings.enableZoom ? 'true' : 'false'});
        ws.setDisplayZoomControls(false);
        ws.setAllowFileAccess(false);
        ws.setAllowContentAccess(false);

        webView.addJavascriptInterface(new NativeBridge(), "AndroidStudioBridge");
        webView.setWebChromeClient(new WebChromeClient());
        webView.setWebViewClient(new WebViewClient() {
            @Override
            public WebResourceResponse shouldInterceptRequest(WebView view, WebResourceRequest request) {
                return assetLoader.shouldInterceptRequest(request.getUrl());
            }
        });

        webView.loadUrl("https://appassets.androidplatform.net/assets/webapp/${settings.entryFile}");
    }

    public class NativeBridge {
        @JavascriptInterface
        public void showToast(String message) {
            runOnUiThread(() -> Toast.makeText(MainActivity.this, message, Toast.LENGTH_SHORT).show());
        }
    }

    @Override
    public void onBackPressed() {
        if (webView != null && webView.canGoBack()) {
            webView.goBack();
        } else {
            super.onBackPressed();
        }
    }
}
`;
}
exports.generateMainActivityJava = generateMainActivityJava;

async function generateCompileReadyAndroidZip(
  project
) {
  const zip = new JSZip();
  const { settings } = project;
  const pkgPath = settings.packageName.replace(/\./g, '/');

  zip.file(
    'settings.gradle',
    `pluginManagement {
    repositories {
        google()
        mavenCentral()
        gradlePluginPortal()
    }
}
dependencyResolutionManagement {
    repositoriesMode.set(RepositoriesMode.FAIL_ON_PROJECT_REPOS)
    repositories {
        google()
        mavenCentral()
    }
}
rootProject.name = "${settings.appName.replace(/[^a-zA-Z0-9_-]/g, '') || 'APKStudioApp'}"
include ':app'
`
  );

  zip.file(
    'build.gradle',
    `plugins {
    id 'com.android.application' version '8.2.2' apply false
}
`
  );

  zip.file(
    'gradle.properties',
    `org.gradle.jvmargs=-Xmx2048m -Dfile.encoding=UTF-8
android.useAndroidX=true
`
  );

  zip.file(
    'app/build.gradle',
    `plugins {
    id 'com.android.application'
}

android {
    namespace '${settings.packageName}'
    compileSdk ${settings.targetSdk}

    defaultConfig {
        applicationId "${settings.packageName}"
        minSdk ${settings.minSdk}
        targetSdk ${settings.targetSdk}
        versionCode ${settings.versionCode}
        versionName "${settings.versionName}"
    }

    compileOptions {
        sourceCompatibility JavaVersion.VERSION_17
        targetCompatibility JavaVersion.VERSION_17
    }
}

dependencies {
    implementation 'androidx.webkit:webkit:1.10.0'
}
`
  );

  zip.file('app/src/main/AndroidManifest.xml', generateAndroidManifestXml(project));
  zip.file(
    `app/src/main/java/${pkgPath}/MainActivity.java`,
    generateMainActivityJava(project)
  );
  zip.file(
    'app/src/main/res/values/strings.xml',
    `<?xml version="1.0" encoding="utf-8"?>
<resources>
    <string name="app_name">${settings.appName.replace(/[<>&'"]/g, '')}</string>
</resources>
`
  );

  for (const file of project.files) {
    const assetPath = `app/src/main/assets/webapp/${file.path}`;
    if (file.isBinary && file.content.startsWith('data:')) {
      const commaIdx = file.content.indexOf(',');
      const base64 = commaIdx >= 0 ? file.content.slice(commaIdx + 1) : '';
      zip.file(assetPath, base64, { base64: true });
    } else {
      zip.file(assetPath, file.content);
    }
  }

  zip.file(
    '.github/workflows/build-apk.yml',
    `name: Build Android APK

on:
  workflow_dispatch:
  push:
    branches: [ "main", "master" ]

permissions:
  contents: read

jobs:
  build-apk:
    runs-on: ubuntu-latest
    steps:
      - name: Checkout repository
        uses: actions/checkout@v4

      - name: Set up JDK 17
        uses: actions/setup-java@v4
        with:
          distribution: 'temurin'
          java-version: '17'

      - name: Setup Android SDK
        uses: android-actions/setup-android@v3

      - name: Install Android SDK Platform ${settings.targetSdk} & Build Tools
        run: |
          yes | sdkmanager --licenses || true
          sdkmanager "platforms;android-${settings.targetSdk}" "build-tools;34.0.0" "platform-tools"

      - name: Setup Gradle
        uses: gradle/actions/setup-gradle@v3
        with:
          gradle-version: '8.5'

      - name: Build Debug APK
        run: gradle assembleDebug --no-daemon --stacktrace

      - name: Upload APK Artifact
        uses: actions/upload-artifact@v4
        with:
          name: ${settings.packageName}-debug-apk
          path: app/build/outputs/apk/debug/app-debug.apk
          if-no-files-found: error
`
  );

  const uint8 = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const sha256 = await computeSha256Hex(uint8);
  const blob = new Blob([uint8.buffer], { type: 'application/zip' });
  const slug = settings.packageName.split('.').pop() || 'android-app';
  return {
    blob,
    sha256,
    size: uint8.byteLength,
    filename: `${slug}-android-project-v${settings.versionName}.zip`,
  };
}
exports.generateCompileReadyAndroidZip = generateCompileReadyAndroidZip;


  };

  modules["./services/archive"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const JSZip = (() => { const _m = require("jszip"); return _m && _m.__esModule && _m.default !== undefined ? _m.default : _m; })();
const { ProjectFile, StudioProject } = require("../types");
const { createDefaultSettings } = require("./templates");

const TEXT_EXTENSIONS = new Set([
  'html',
  'htm',
  'css',
  'js',
  'mjs',
  'cjs',
  'ts',
  'tsx',
  'jsx',
  'json',
  'md',
  'txt',
  'svg',
  'xml',
  'yml',
  'yaml',
  'py',
  'gradle',
  'properties',
  'java',
  'kt',
]);

function getExtension(filePath) {
  const parts = filePath.toLowerCase().split('.');
  return parts.length > 1 ? parts[parts.length - 1] : '';
}

function getMimeType(filePath) {
  const ext = getExtension(filePath);
  switch (ext) {
    case 'png':
      return 'image/png';
    case 'jpg':
    case 'jpeg':
      return 'image/jpeg';
    case 'webp':
      return 'image/webp';
    case 'gif':
      return 'image/gif';
    case 'svg':
      return 'image/svg+xml';
    case 'json':
      return 'application/json';
    case 'html':
    case 'htm':
      return 'text/html';
    case 'css':
      return 'text/css';
    case 'js':
      return 'application/javascript';
    default:
      return 'application/octet-stream';
  }
}

function sanitizeArchivePath(rawPath) {
  const normalized = rawPath.replace(/\\/g, '/').replace(/^\/+/, '').trim();
  if (!normalized) return null;
  const segments = normalized.split('/');
  if (segments.some((seg) => seg === '..' || seg === '.')) {
    return null;
  }
  return segments.join('/');
}
exports.sanitizeArchivePath = sanitizeArchivePath;

async function computeSha256Hex(bytes) {
  if (typeof crypto !== 'undefined' && crypto.subtle) {
    const digest = await crypto.subtle.digest('SHA-256', bytes.buffer);
    return Array.from(new Uint8Array(digest))
      .map((b) => b.toString(16).padStart(2, '0'))
      .join('');
  }
  let hash = 0x811c9dc5;
  for (let i = 0; i < bytes.length; i++) {
    hash ^= bytes[i];
    hash = Math.imul(hash, 0x01000193) >>> 0;
  }
  return hash.toString(16).padStart(8, '0');
}
exports.computeSha256Hex = computeSha256Hex;

async function importProjectFromZip(
  file,
  onProgress
) {
  const zip = await JSZip.loadAsync(file);
  const entryNames = Object.keys(zip.files).filter((name) => !zip.files[name].dir);
  if (entryNames.length === 0) {
    throw new Error('The uploaded ZIP archive does not contain any files.');
  }

  // Strip common single top-level folder prefix if all files share one
  const sanitizedEntries = entryNames
    .map((raw) => ({ raw, clean: sanitizeArchivePath(raw) }))
    .filter((item) => Boolean(item.clean));

  if (sanitizedEntries.length === 0) {
    throw new Error('No safe file paths found inside the archive.');
  }

  const firstSegments = new Set(
    sanitizedEntries.map((e) => e.clean.split('/')[0])
  );
  const hasSharedRoot =
    firstSegments.size === 1 &&
    sanitizedEntries.every((e) => e.clean.includes('/'));

  const projectFiles = [];
  const now = Date.now();

  for (let i = 0; i < sanitizedEntries.length; i++) {
    const { raw, clean } = sanitizedEntries[i];
    const relPath = hasSharedRoot
      ? clean.split('/').slice(1).join('/')
      : clean;

    if (!relPath || relPath.startsWith('.git/') || relPath.includes('node_modules/')) {
      continue;
    }

    onProgress?.(Math.round(((i + 1) / sanitizedEntries.length) * 100), relPath);
    const zipObj = zip.files[raw];
    const ext = getExtension(relPath);

    if (TEXT_EXTENSIONS.has(ext) || ext === '') {
      const content = await zipObj.async('string');
      projectFiles.push({
        path: relPath,
        content,
        isBinary: false,
        mimeType: getMimeType(relPath),
        updatedAt: now,
      });
    } else {
      const base64 = await zipObj.async('base64');
      const mime = getMimeType(relPath);
      projectFiles.push({
        path: relPath,
        content: `data:${mime};base64,${base64}`,
        isBinary: true,
        mimeType: mime,
        updatedAt: now,
      });
    }
  }

  if (projectFiles.length === 0) {
    throw new Error('No editable web files found in the archive.');
  }

  // Check if this is an APK Studio backup containing project.apkstudio.json
  const metaFile = projectFiles.find((f) => f.path === 'project.apkstudio.json');
  if (metaFile && !metaFile.isBinary) {
    try {
      const parsed = JSON.parse(metaFile.content);
      if (parsed && parsed.name && parsed.settings) {
        return {
          ...parsed,
          id: `proj_${now}_${Math.random().toString(36).slice(2, 7)}`,
          updatedAt: now,
          files: projectFiles.filter((f) => f.path !== 'project.apkstudio.json'),
        };
      }
    } catch {
      // Continue as standard web project import
    }
  }

  const baseName = file.name.replace(/\.zip$/i, '').replace(/[^a-zA-Z0-9_-]/g, ' ').trim() || 'Imported App';
  const slug = baseName.toLowerCase().replace(/[^a-z0-9]/g, '') || 'importedapp';
  const entryCandidate =
    projectFiles.find((f) => f.path === 'index.html')?.path ||
    projectFiles.find((f) => f.path.endsWith('/index.html'))?.path ||
    projectFiles.find((f) => f.path.endsWith('.html'))?.path ||
    projectFiles[0].path;

  const settings = createDefaultSettings(baseName, `com.apkstudio.${slug}`);
  settings.entryFile = entryCandidate;

  return {
    id: `proj_${now}_${Math.random().toString(36).slice(2, 7)}`,
    name: baseName,
    description: `Imported from ${file.name} (${projectFiles.length} files)`,
    templateId: 'imported-zip',
    createdAt: now,
    updatedAt: now,
    files: projectFiles,
    settings,
  };
}
exports.importProjectFromZip = importProjectFromZip;

async function exportProjectAsZipBlob(
  project
) {
  const zip = new JSZip();

  for (const file of project.files) {
    if (file.isBinary && file.content.startsWith('data:')) {
      const commaIdx = file.content.indexOf(',');
      const base64Data = commaIdx >= 0 ? file.content.slice(commaIdx + 1) : '';
      zip.file(file.path, base64Data, { base64: true });
    } else {
      zip.file(file.path, file.content);
    }
  }

  zip.file(
    'project.apkstudio.json',
    JSON.stringify(
      {
        id: project.id,
        name: project.name,
        description: project.description,
        templateId: project.templateId,
        createdAt: project.createdAt,
        updatedAt: project.updatedAt,
        settings: project.settings,
      },
      null,
      2
    )
  );

  const uint8 = await zip.generateAsync({
    type: 'uint8array',
    compression: 'DEFLATE',
    compressionOptions: { level: 6 },
  });
  const sha256 = await computeSha256Hex(uint8);
  const blob = new Blob([uint8.buffer], { type: 'application/zip' });
  return { blob, sha256, size: uint8.byteLength };
}
exports.exportProjectAsZipBlob = exportProjectAsZipBlob;

function triggerBrowserDownload(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  document.body.removeChild(a);
  setTimeout(() => URL.revokeObjectURL(url), 5000);
}
exports.triggerBrowserDownload = triggerBrowserDownload;


  };

  modules["./services/storage"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { StudioProject, BuildRecord } = require("../types");
const { createProjectFromTemplate } = require("./templates");

const DB_NAME = 'apk_studio_idb_v2';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_BUILDS = 'builds';
const LS_ACTIVE_PROJECT = 'apk_studio_active_project_id';
const LS_THEME = 'apk_studio_theme_dark';
const LS_FALLBACK_PROJECTS = 'apk_studio_fallback_projects_v2';
const LS_FALLBACK_BUILDS = 'apk_studio_fallback_builds_v2';

function openDatabase() {
  return new Promise((resolve) => {
    if (typeof indexedDB === 'undefined') {
      resolve(null);
      return;
    }
    try {
      const request = indexedDB.open(DB_NAME, DB_VERSION);
      request.onupgradeneeded = () => {
        const db = request.result;
        if (!db.objectStoreNames.contains(STORE_PROJECTS)) {
          db.createObjectStore(STORE_PROJECTS, { keyPath: 'id' });
        }
        if (!db.objectStoreNames.contains(STORE_BUILDS)) {
          db.createObjectStore(STORE_BUILDS, { keyPath: 'id' });
        }
      };
      request.onsuccess = () => resolve(request.result);
      request.onerror = () => resolve(null);
    } catch {
      resolve(null);
    }
  });
}

async function loadAllProjects() {
  const db = await openDatabase();
  if (db) {
    try {
      const items = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PROJECTS, 'readonly');
        const store = tx.objectStore(STORE_PROJECTS);
        const req = store.getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      if (items.length > 0) {
        return items.sort((a, b) => b.updatedAt - a.updatedAt);
      }
    } catch {
      // Fallback to localStorage below
    }
  }

  try {
    const raw = localStorage.getItem(LS_FALLBACK_PROJECTS);
    if (raw) {
      const parsed = JSON.parse(raw);
      if (Array.isArray(parsed) && parsed.length > 0) {
        return parsed.sort((a, b) => b.updatedAt - a.updatedAt);
      }
    }
  } catch {
    // Ignore parse error
  }

  const initial = createProjectFromTemplate('liquid-glass-starter');
  await saveProject(initial);
  return [initial];
}
exports.loadAllProjects = loadAllProjects;

async function saveProject(project) {
  const updated = { ...project, updatedAt: Date.now() };
  const db = await openDatabase();
  if (db) {
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PROJECTS, 'readwrite');
        tx.objectStore(STORE_PROJECTS).put(updated);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Also write fallback
    }
  }

  try {
    const raw = localStorage.getItem(LS_FALLBACK_PROJECTS);
    const list = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((p) => p.id === updated.id);
    if (idx >= 0) {
      list[idx] = updated;
    } else {
      list.unshift(updated);
    }
    localStorage.setItem(LS_FALLBACK_PROJECTS, JSON.stringify(list));
  } catch {
    // Quota exceeded or private browsing
  }
}
exports.saveProject = saveProject;

async function deleteProjectById(projectId) {
  const db = await openDatabase();
  if (db) {
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_PROJECTS, 'readwrite');
        tx.objectStore(STORE_PROJECTS).delete(projectId);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Ignore
    }
  }

  try {
    const raw = localStorage.getItem(LS_FALLBACK_PROJECTS);
    if (raw) {
      const list = JSON.parse(raw);
      localStorage.setItem(
        LS_FALLBACK_PROJECTS,
        JSON.stringify(list.filter((p) => p.id !== projectId))
      );
    }
  } catch {
    // Ignore
  }
}
exports.deleteProjectById = deleteProjectById;

async function loadBuildHistory() {
  const db = await openDatabase();
  if (db) {
    try {
      const records = await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_BUILDS, 'readonly');
        const req = tx.objectStore(STORE_BUILDS).getAll();
        req.onsuccess = () => resolve(req.result || []);
        req.onerror = () => reject(req.error);
      });
      if (records.length > 0) {
        return records.sort((a, b) => b.createdAt - a.createdAt);
      }
    } catch {
      // Fallback
    }
  }

  try {
    const raw = localStorage.getItem(LS_FALLBACK_BUILDS);
    if (raw) {
      const parsed = JSON.parse(raw);
      return parsed.sort((a, b) => b.createdAt - a.createdAt);
    }
  } catch {
    // Ignore
  }
  return [];
}
exports.loadBuildHistory = loadBuildHistory;

async function saveBuildRecord(record) {
  const db = await openDatabase();
  if (db) {
    try {
      await new Promise((resolve, reject) => {
        const tx = db.transaction(STORE_BUILDS, 'readwrite');
        tx.objectStore(STORE_BUILDS).put(record);
        tx.oncomplete = () => resolve();
        tx.onerror = () => reject(tx.error);
      });
    } catch {
      // Ignore
    }
  }

  try {
    const raw = localStorage.getItem(LS_FALLBACK_BUILDS);
    const list = raw ? JSON.parse(raw) : [];
    const idx = list.findIndex((b) => b.id === record.id);
    if (idx >= 0) {
      list[idx] = record;
    } else {
      list.unshift(record);
    }
    localStorage.setItem(LS_FALLBACK_BUILDS, JSON.stringify(list.slice(0, 30)));
  } catch {
    // Ignore
  }
}
exports.saveBuildRecord = saveBuildRecord;

function getActiveProjectId() {
  try {
    return localStorage.getItem(LS_ACTIVE_PROJECT);
  } catch {
    return null;
  }
}
exports.getActiveProjectId = getActiveProjectId;

function setActiveProjectId(id) {
  try {
    localStorage.setItem(LS_ACTIVE_PROJECT, id);
  } catch {
    // Ignore
  }
}
exports.setActiveProjectId = setActiveProjectId;

function getSavedDarkMode() {
  try {
    return localStorage.getItem(LS_THEME) === 'true';
  } catch {
    return false;
  }
}
exports.getSavedDarkMode = getSavedDarkMode;

function setSavedDarkMode(dark) {
  try {
    localStorage.setItem(LS_THEME, dark ? 'true' : 'false');
  } catch {
    // Ignore
  }
}
exports.setSavedDarkMode = setSavedDarkMode;


  };

  modules["./services/templates"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });
const { StudioProject, ProjectSettings } = require("../types");



function createDefaultSettings(
  appName,
  packageName
) {
  return {
    appName,
    packageName,
    versionName: '1.0.0',
    versionCode: 1,
    minSdk: 24,
    targetSdk: 34,
    orientation: 'portrait',
    fullscreen: false,
    statusBarColor: '#4f46e5',
    navigationBarColor: '#0f172a',
    themeMode: 'system',
    enableJavaScript: true,
    enableDomStorage: true,
    enableZoom: false,
    allowCleartextTraffic: false,
    entryFile: 'index.html',
    iconDataUrl: null,
    splashColor: '#4f46e5',
    splashTitle: appName,
    splashTagline: 'Built with APK Studio',
    splashDurationMs: 1200,
    splashAnimation: 'liquid-pulse',
    pageTransition: 'fade',
    permissions: ['android.permission.INTERNET'],
    backendUrl: 'http://localhost:4000',
    githubRepo: '',
    githubWorkflowFile: 'build-apk.yml',
    githubBranch: 'main',
  };
}
exports.createDefaultSettings = createDefaultSettings;

const STARTER_TEMPLATES = [
  {
    id: 'liquid-glass-starter',
    name: 'Liquid Glass WebApp',
    category: 'HTML / CSS / JS',
    description: 'Modern glassmorphic mobile application with interactive state and native bridge hooks.',
    defaultPackage: 'com.apkstudio.liquidapp',
    files: [
      {
        path: 'index.html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Liquid Glass App</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <main class="card">
    <span class="badge">ANDROID READY</span>
    <h1>Liquid Glass Starter</h1>
    <p>Tap the counter below to test JavaScript state and local storage persistence inside your APK.</p>
    <div class="counter-box">
      <span id="count-val">0</span>
      <div class="btn-row">
        <button id="dec-btn" type="button">-1</button>
        <button id="inc-btn" type="button">+1</button>
        <button id="reset-btn" type="button">Reset</button>
      </div>
    </div>
  </main>
  <script src="app.js"></script>
</body>
</html>`,
      },
      {
        path: 'styles.css',
        content: `* { box-sizing: border-box; margin: 0; padding: 0; font-family: system-ui, sans-serif; }
body {
  min-height: 100vh;
  display: flex;
  align-items: center;
  justify-content: center;
  padding: 20px;
  background: linear-gradient(135deg, #ff9a9e 0%, #fecfef 100%);
  color: #1d1d1f;
}
.card {
  width: 100%;
  max-width: 380px;
  padding: 28px;
  border-radius: 24px;
  background: rgba(255, 255, 255, 0.55);
  backdrop-filter: blur(18px);
  border: 1px solid rgba(255, 255, 255, 0.7);
  box-shadow: 0 20px 40px rgba(31, 38, 135, 0.14);
  text-align: center;
}
.badge {
  display: inline-block;
  font-size: 0.72rem;
  font-weight: 700;
  padding: 4px 10px;
  border-radius: 999px;
  background: #4f46e5;
  color: #fff;
  margin-bottom: 12px;
}
h1 { font-size: 1.55rem; margin-bottom: 8px; }
p { font-size: 0.92rem; color: #515154; margin-bottom: 20px; line-height: 1.45; }
.counter-box {
  padding: 18px;
  border-radius: 16px;
  background: rgba(255, 255, 255, 0.5);
}
#count-val { display: block; font-size: 2.5rem; font-weight: 800; margin-bottom: 12px; }
.btn-row { display: flex; gap: 8px; justify-content: center; }
button {
  padding: 10px 16px;
  border-radius: 10px;
  border: none;
  background: #4f46e5;
  color: white;
  font-weight: 600;
  cursor: pointer;
}`,
      },
      {
        path: 'app.js',
        content: `const countEl = document.getElementById('count-val');
let count = Number(localStorage.getItem('liquid_count') || '0');

function render() {
  countEl.textContent = String(count);
  localStorage.setItem('liquid_count', String(count));
}

document.getElementById('inc-btn').addEventListener('click', () => {
  count += 1;
  console.log('Incremented counter to', count);
  render();
});

document.getElementById('dec-btn').addEventListener('click', () => {
  count -= 1;
  console.log('Decremented counter to', count);
  render();
});

document.getElementById('reset-btn').addEventListener('click', () => {
  count = 0;
  console.info('Counter reset');
  render();
});

render();`,
      },
    ],
  },
  {
    id: 'responsive-portfolio',
    name: 'Responsive Multi-Section Site',
    category: 'Responsive Web',
    description: 'Mobile-first responsive layout with navigation bar, feature cards, and contact form.',
    defaultPackage: 'com.apkstudio.portfolio',
    files: [
      {
        path: 'index.html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Responsive Studio App</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <header class="topbar">
    <strong>NovaMobile</strong>
    <button id="theme-btn" type="button">Toggle Theme</button>
  </header>
  <section class="hero">
    <h1>Designed for Mobile First</h1>
    <p>Adaptive grid architecture compiled into a standalone Android WebView package.</p>
  </section>
  <section class="grid" id="feature-grid"></section>
  <script src="app.js"></script>
</body>
</html>`,
      },
      {
        path: 'styles.css',
        content: `body { font-family: system-ui, sans-serif; margin: 0; padding: 16px; background: #f8fafc; color: #0f172a; transition: 0.25s; }
body.dark { background: #0f172a; color: #f8fafc; }
.topbar { display: flex; justify-content: space-between; align-items: center; padding: 12px 0; }
.hero { padding: 28px 20px; border-radius: 18px; background: linear-gradient(135deg, #4f46e5, #7c3aed); color: #fff; margin-bottom: 16px; }
.grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(160px, 1fr)); gap: 12px; }
.item { padding: 16px; border-radius: 14px; background: rgba(148,163,184,0.15); }
button { padding: 8px 12px; border-radius: 8px; border: 1px solid #6366f1; background: #6366f1; color: #fff; cursor: pointer; }`,
      },
      {
        path: 'app.js',
        content: `const items = [
  { title: 'Offline Ready', desc: 'Bundled directly inside Android assets.' },
  { title: 'Fast Startup', desc: 'Zero external network latency required.' },
  { title: 'Native Bridge', desc: 'Communicate with Android Toast & vibrations.' }
];
const grid = document.getElementById('feature-grid');
items.forEach((it) => {
  const div = document.createElement('div');
  div.className = 'item';
  div.innerHTML = '<h3>' + it.title + '</h3><p>' + it.desc + '</p>';
  grid.appendChild(div);
});
document.getElementById('theme-btn').addEventListener('click', () => {
  document.body.classList.toggle('dark');
  console.log('Theme toggled');
});`,
      },
    ],
  },
  {
    id: 'utility-expense-tracker',
    name: 'Offline Expense & Notes Utility',
    category: 'Utility App',
    description: 'Persistent local ledger with instant totals and JSON export.',
    defaultPackage: 'com.apkstudio.ledger',
    files: [
      {
        path: 'index.html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Quick Ledger</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div class="app">
    <h2>Quick Expense Tracker</h2>
    <div class="total">Total: $<span id="total-amount">0.00</span></div>
    <form id="entry-form">
      <input id="label-in" placeholder="Item name" required />
      <input id="amount-in" type="number" step="0.01" placeholder="Amount" required />
      <button type="submit">Add</button>
    </form>
    <ul id="list"></ul>
  </div>
  <script src="app.js"></script>
</body>
</html>`,
      },
      {
        path: 'styles.css',
        content: `body { font-family: system-ui, sans-serif; background: #0f172a; color: #f8fafc; padding: 20px; margin: 0; }
.app { max-width: 420px; margin: 0 auto; background: #1e293b; padding: 20px; border-radius: 18px; }
.total { font-size: 1.5rem; font-weight: 800; color: #38bdf8; margin: 12px 0; }
form { display: flex; gap: 8px; margin-bottom: 16px; }
input { flex: 1; padding: 10px; border-radius: 8px; border: 1px solid #334155; background: #0f172a; color: #fff; }
button { padding: 10px 14px; border-radius: 8px; border: none; background: #0284c7; color: #fff; font-weight: 700; }
ul { list-style: none; padding: 0; margin: 0; }
li { display: flex; justify-content: space-between; padding: 10px; border-bottom: 1px solid #334155; }`,
      },
      {
        path: 'app.js',
        content: `const form = document.getElementById('entry-form');
const listEl = document.getElementById('list');
const totalEl = document.getElementById('total-amount');
let entries = JSON.parse(localStorage.getItem('ledger_items') || '[]');

function render() {
  listEl.innerHTML = '';
  let sum = 0;
  entries.forEach((e) => {
    sum += Number(e.amount);
    const li = document.createElement('li');
    li.innerHTML = '<span>' + e.label + '</span><strong>$' + Number(e.amount).toFixed(2) + '</strong>';
    listEl.appendChild(li);
  });
  totalEl.textContent = sum.toFixed(2);
  localStorage.setItem('ledger_items', JSON.stringify(entries));
}

form.addEventListener('submit', (ev) => {
  ev.preventDefault();
  const label = document.getElementById('label-in').value.trim();
  const amount = parseFloat(document.getElementById('amount-in').value || '0');
  if (!label) return;
  entries.unshift({ label, amount });
  form.reset();
  console.log('Added ledger entry:', label, amount);
  render();
});

render();`,
      },
    ],
  },
  {
    id: 'webview-native-bridge',
    name: 'Android WebView Bridge Tester',
    category: 'Android Native Bridge',
    description: 'Tests window.AndroidStudioBridge native methods, device metrics, and offline asset loading.',
    defaultPackage: 'com.apkstudio.bridgetest',
    files: [
      {
        path: 'index.html',
        content: `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1.0" />
  <title>Android Bridge Diagnostic</title>
  <link rel="stylesheet" href="styles.css" />
</head>
<body>
  <div class="box">
    <h2>WebView Native Bridge</h2>
    <p id="bridge-status">Checking bridge...</p>
    <button id="toast-btn" type="button">Trigger Native Toast</button>
    <pre id="device-info"></pre>
  </div>
  <script src="app.js"></script>
</body>
</html>`,
      },
      {
        path: 'styles.css',
        content: `body { font-family: monospace; background: #111827; color: #10b981; padding: 20px; }
.box { border: 1px solid #10b981; border-radius: 12px; padding: 18px; }
button { background: #10b981; color: #064e3b; border: none; padding: 10px 14px; border-radius: 8px; font-weight: 700; cursor: pointer; }
pre { background: #000; padding: 12px; border-radius: 8px; overflow-x: auto; margin-top: 12px; }`,
      },
      {
        path: 'app.js',
        content: `const statusEl = document.getElementById('bridge-status');
const infoEl = document.getElementById('device-info');
const bridge = window.AndroidStudioBridge;

if (bridge) {
  statusEl.textContent = 'Connected to AndroidStudioBridge';
} else {
  statusEl.textContent = 'Running in standard browser preview';
}

infoEl.textContent = JSON.stringify({
  userAgent: navigator.userAgent,
  viewport: window.innerWidth + 'x' + window.innerHeight,
  online: navigator.onLine
}, null, 2);

document.getElementById('toast-btn').addEventListener('click', () => {
  if (bridge && typeof bridge.showToast === 'function') {
    bridge.showToast('Hello from WebView JavaScript!');
  } else {
    console.log('Toast simulated in preview: Hello from WebView JavaScript!');
  }
});`,
      },
    ],
  },
];
exports.STARTER_TEMPLATES = STARTER_TEMPLATES;

function createProjectFromTemplate(
  templateId,
  customName,
  customPackage
) {
  const template =
    STARTER_TEMPLATES.find((t) => t.id === templateId) || STARTER_TEMPLATES[0];
  const now = Date.now();
  const name = (customName || template.name).trim();
  const pkg = (customPackage || template.defaultPackage).trim();

  return {
    id: `proj_${now}_${Math.random().toString(36).slice(2, 7)}`,
    name,
    description: template.description,
    templateId: template.id,
    createdAt: now,
    updatedAt: now,
    files: template.files.map((f) => ({
      path: f.path,
      content: f.content,
      updatedAt: now,
    })),
    settings: createDefaultSettings(name, pkg),
  };
}
exports.createProjectFromTemplate = createProjectFromTemplate;


  };

  modules["./types/index"] = function(module, exports, require) {
"use strict";
Object.defineProperty(exports, "__esModule", { value: true });





















  };

  if (typeof window !== "undefined") {
    window.__APK_STUDIO_REQUIRE__ = requireModule;
    window.addEventListener("DOMContentLoaded", function() { requireModule("./main"); });
  }
  if (typeof global !== "undefined") {
    global.__APK_STUDIO_REQUIRE__ = requireModule;
  }
})();
