/**
 * Local persistence for state, saved comparison snapshots (localStorage),
 * and uploaded bedroom wall photos (IndexedDB).
 */

const STATE_KEY = 'baseball_stencil_state_v2';
const SNAPSHOTS_KEY = 'baseball_stencil_snapshots_v2';
const DB_NAME = 'baseball_stencil_media';
const DB_STORE = 'photos';
const PHOTO_KEY = 'custom_wall_photo';

export function loadSavedState(fallback) {
  try {
    const raw = localStorage.getItem(STATE_KEY);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return {
      ...fallback,
      ...parsed,
      wall: { ...fallback.wall, ...(parsed.wall || {}) },
      layout: { ...fallback.layout, ...(parsed.layout || {}) },
      stitch: { ...fallback.stitch, ...(parsed.stitch || {}) },
      photo: { ...fallback.photo, ...(parsed.photo || {}) },
      obstacles: Array.isArray(parsed.obstacles) ? parsed.obstacles : fallback.obstacles,
    };
  } catch {
    return fallback;
  }
}

export function saveState(state) {
  try {
    localStorage.setItem(STATE_KEY, JSON.stringify(state));
  } catch {
    // Ignore storage quota errors gracefully
  }
}

export function loadSnapshots() {
  try {
    const raw = localStorage.getItem(SNAPSHOTS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? parsed : [];
  } catch {
    return [];
  }
}

export function saveSnapshots(snapshots) {
  try {
    localStorage.setItem(SNAPSHOTS_KEY, JSON.stringify(snapshots));
    return true;
  } catch {
    return false;
  }
}

function openMediaDB() {
  return new Promise((resolve, reject) => {
    if (typeof indexedDB === 'undefined') {
      reject(new Error('IndexedDB unavailable'));
      return;
    }
    const req = indexedDB.open(DB_NAME, 1);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(DB_STORE)) {
        db.createObjectStore(DB_STORE);
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

export async function saveCustomPhotoDataUrl(dataUrl) {
  try {
    const db = await openMediaDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).put(dataUrl, PHOTO_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Fallback ignored if IndexedDB is blocked
  }
}

export async function loadCustomPhotoDataUrl() {
  try {
    const db = await openMediaDB();
    const result = await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readonly');
      const req = tx.objectStore(DB_STORE).get(PHOTO_KEY);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
    db.close();
    return result;
  } catch {
    return null;
  }
}

export async function clearCustomPhoto() {
  try {
    const db = await openMediaDB();
    await new Promise((resolve, reject) => {
      const tx = db.transaction(DB_STORE, 'readwrite');
      tx.objectStore(DB_STORE).delete(PHOTO_KEY);
      tx.oncomplete = resolve;
      tx.onerror = () => reject(tx.error);
    });
    db.close();
  } catch {
    // Ignore
  }
}
