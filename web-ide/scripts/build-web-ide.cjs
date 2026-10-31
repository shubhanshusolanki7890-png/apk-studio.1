#!/usr/bin/env node
/**
 * Builds the `web-ide` React + TypeScript application into
 * `../app-shell/app/src/main/assets/webapp/`.
 */
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const { spawnSync } = require('child_process');
const { compileTsxToCommonJs } = require('./ts-jsx-compiler.cjs');

const webIdeRoot = path.resolve(__dirname, '..');
const outDir = path.resolve(webIdeRoot, '../app-shell/app/src/main/assets/webapp');
const srcDir = path.join(webIdeRoot, 'src');

function ensureDir(dir) {
  fs.mkdirSync(dir, { recursive: true });
}

function walkFiles(dir, acc = []) {
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      walkFiles(full, acc);
    } else {
      acc.push(full);
    }
  }
  return acc;
}

function tryViteBuild() {
  const viteBin = path.join(webIdeRoot, 'node_modules', '.bin', 'vite');
  if (fs.existsSync(viteBin)) {
    console.log('[build-web-ide] Found local Vite binary, running `vite build`...');
    const res = spawnSync(viteBin, ['build'], {
      cwd: webIdeRoot,
      stdio: 'inherit',
    });
    if (res.status === 0) {
      return true;
    }
  }
  return false;
}

function buildWithAstBundler() {
  console.log('[build-web-ide] Building production bundle with zero-dependency AST compiler...');
  ensureDir(outDir);
  ensureDir(path.join(outDir, 'assets'));

  // 1. Copy CSS
  const cssPath = path.join(srcDir, 'styles', 'liquid-glass.css');
  const cssContent = fs.readFileSync(cssPath, 'utf8');
  fs.writeFileSync(path.join(outDir, 'assets', 'liquid-glass.css'), cssContent, 'utf8');

  // 2. Compile every .ts / .tsx file in src/
  const allSrcFiles = walkFiles(srcDir).filter((f) => /\.(ts|tsx)$/.test(f));
  const compiledModules = {};

  for (const absFile of allSrcFiles) {
    const relFromSrc = './' + path.relative(srcDir, absFile).replace(/\\/g, '/').replace(/\.(ts|tsx)$/, '');
    const sourceCode = fs.readFileSync(absFile, 'utf8');
    const compiledCode = compileTsxToCommonJs(sourceCode, absFile);
    compiledModules[relFromSrc] = compiledCode;
  }

  const runtimeHeader = `(function() {
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
`;

  const moduleEntries = Object.entries(compiledModules)
    .map(([modId, code]) => {
      return `  modules[${JSON.stringify(modId)}] = function(module, exports, require) {\n${code}\n  };`;
    })
    .join('\n\n');

  const runtimeFooter = `\n  if (typeof window !== "undefined") {\n    window.__APK_STUDIO_REQUIRE__ = requireModule;\n    window.addEventListener("DOMContentLoaded", function() { requireModule("./main"); });\n  }\n  if (typeof global !== "undefined") {\n    global.__APK_STUDIO_REQUIRE__ = requireModule;\n  }\n})();\n`;

  const fullBundle = runtimeHeader + '\n' + moduleEntries + '\n' + runtimeFooter;

  new vm.Script(fullBundle, { filename: 'app-bundle.js' });

  const bundlePath = path.join(outDir, 'assets', 'app-bundle.js');
  fs.writeFileSync(bundlePath, fullBundle, 'utf8');

  const rawHtml = fs.readFileSync(path.join(webIdeRoot, 'index.html'), 'utf8');
  const prodHtml = rawHtml.replace(
    /<script\s+type="module"\s+src="\.\/src\/main\.tsx"><\/script>/,
    `  <link rel="stylesheet" href="./assets/liquid-glass.css" />\n  <script defer src="./assets/app-bundle.js"></script>`
  );
  fs.writeFileSync(path.join(outDir, 'index.html'), prodHtml, 'utf8');

  console.log(`[build-web-ide] Successfully bundled ${allSrcFiles.length} TypeScript/React modules into ${outDir}`);
}

if (!tryViteBuild()) {
  buildWithAstBundler();
}
