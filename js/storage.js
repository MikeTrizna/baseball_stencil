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

/**
 * Encode shareable design parameters (excluding private local photos) into a compact
 * base64url hash string (`#d=...`) so designs can be shared via GitHub Pages URLs.
 */
export function encodeStateToHash(state) {
  const payload = {
    v: 2,
    u: state.units,
    m: state.maskBehindFurniture ? 1 : 0,
    w: state.wall,
    l: state.layout,
    s: state.stitch,
    o: state.obstacles,
  };
  const json = JSON.stringify(payload);
  const bytes = new TextEncoder().encode(json);
  let bin = '';
  for (let i = 0; i < bytes.length; i++) {
    bin += String.fromCharCode(bytes[i]);
  }
  const b64url = btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  return `#d=${b64url}`;
}

/**
 * Decode a `#d=...` URL hash into a partial state patch, or return null if absent/invalid.
 */
export function decodeStateFromHash(hash, fallback) {
  if (!hash || !hash.startsWith('#d=')) return null;
  try {
    let b64 = hash.slice(3).replace(/-/g, '+').replace(/_/g, '/');
    while (b64.length % 4) b64 += '=';
    const bin = atob(b64);
    const bytes = new Uint8Array(bin.length);
    for (let i = 0; i < bin.length; i++) {
      bytes[i] = bin.charCodeAt(i);
    }
    const parsed = JSON.parse(new TextDecoder().decode(bytes));
    if (!parsed || typeof parsed !== 'object') return null;

    return {
      ...fallback,
      activePresetId: null,
      units: parsed.u === 'cm' ? 'cm' : 'in',
      maskBehindFurniture: parsed.m !== undefined ? Boolean(parsed.m) : fallback.maskBehindFurniture,
      wall: { ...fallback.wall, ...(parsed.w || {}) },
      layout: { ...fallback.layout, ...(parsed.l || {}) },
      stitch: { ...fallback.stitch, ...(parsed.s || {}) },
      obstacles: Array.isArray(parsed.o) ? parsed.o : fallback.obstacles,
    };
  } catch {
    return null;
  }
}
