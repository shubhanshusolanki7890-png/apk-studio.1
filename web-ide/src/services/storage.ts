import { StudioProject, BuildRecord } from '../types';
import { createProjectFromTemplate } from './templates';

const DB_NAME = 'apk_studio_idb_v2';
const DB_VERSION = 1;
const STORE_PROJECTS = 'projects';
const STORE_BUILDS = 'builds';
const LS_ACTIVE_PROJECT = 'apk_studio_active_project_id';
const LS_THEME = 'apk_studio_theme_dark';
const LS_FALLBACK_PROJECTS = 'apk_studio_fallback_projects_v2';
const LS_FALLBACK_BUILDS = 'apk_studio_fallback_builds_v2';

function openDatabase(): Promise<IDBDatabase | null> {
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

export async function loadAllProjects(): Promise<StudioProject[]> {
  const db = await openDatabase();
  if (db) {
    try {
      const items = await new Promise<StudioProject[]>((resolve, reject) => {
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
      const parsed = JSON.parse(raw) as StudioProject[];
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

export async function saveProject(project: StudioProject): Promise<void> {
  const updated: StudioProject = { ...project, updatedAt: Date.now() };
  const db = await openDatabase();
  if (db) {
    try {
      await new Promise<void>((resolve, reject) => {
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
    const list: StudioProject[] = raw ? JSON.parse(raw) : [];
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

export async function deleteProjectById(projectId: string): Promise<void> {
  const db = await openDatabase();
  if (db) {
    try {
      await new Promise<void>((resolve, reject) => {
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
      const list: StudioProject[] = JSON.parse(raw);
      localStorage.setItem(
        LS_FALLBACK_PROJECTS,
        JSON.stringify(list.filter((p) => p.id !== projectId))
      );
    }
  } catch {
    // Ignore
  }
}

export async function loadBuildHistory(): Promise<BuildRecord[]> {
  const db = await openDatabase();
  if (db) {
    try {
      const records = await new Promise<BuildRecord[]>((resolve, reject) => {
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
      const parsed = JSON.parse(raw) as BuildRecord[];
      return parsed.sort((a, b) => b.createdAt - a.createdAt);
    }
  } catch {
    // Ignore
  }
  return [];
}

export async function saveBuildRecord(record: BuildRecord): Promise<void> {
  const db = await openDatabase();
  if (db) {
    try {
      await new Promise<void>((resolve, reject) => {
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
    const list: BuildRecord[] = raw ? JSON.parse(raw) : [];
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

export function getActiveProjectId(): string | null {
  try {
    return localStorage.getItem(LS_ACTIVE_PROJECT);
  } catch {
    return null;
  }
}

export function setActiveProjectId(id: string): void {
  try {
    localStorage.setItem(LS_ACTIVE_PROJECT, id);
  } catch {
    // Ignore
  }
}

export function getSavedDarkMode(): boolean {
  try {
    return localStorage.getItem(LS_THEME) === 'true';
  } catch {
    return false;
  }
}

export function setSavedDarkMode(dark: boolean): void {
  try {
    localStorage.setItem(LS_THEME, dark ? 'true' : 'false');
  } catch {
    // Ignore
  }
}
