import { StudioProject, ProjectSettings } from '../types';

export interface ProjectTemplate {
  id: string;
  name: string;
  category: string;
  description: string;
  defaultPackage: string;
  files: Array<{ path: string; content: string }>;
}

export function createDefaultSettings(
  appName: string,
  packageName: string
): ProjectSettings {
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

export const STARTER_TEMPLATES: ProjectTemplate[] = [
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

export function createProjectFromTemplate(
  templateId: string,
  customName?: string,
  customPackage?: string
): StudioProject {
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
