// IndexedDB store for recent projects.
// A recent entry contains everything needed to reopen the project, including
// the media assets (video files become object URLs again on open).

export interface StoredAsset {
  id: string;
  name: string;
  kind: 'video' | 'audio' | 'image';
  duration: number;
  width?: number | undefined;
  height?: number | undefined;
  blob: Blob;
}

export interface RecentProject {
  id: string;
  name: string;
  kind: 'video' | 'image';
  createdAt: number;
  updatedAt: number;
  thumbnail?: string | undefined;        // small JPEG data URL
  videoJson?: string;        // video: JSON project state (name, aspect, clips, texts)
  assets?: StoredAsset[];    // video / audio / image blobs referenced above
  imageBlob?: Blob;          // image: flattened exported file
  /** Supabase row id when this entry came from (or maps to) cloud projects. */
  cloudId?: string | undefined;
}

const DB_NAME = 'clipforge-recent';
const STORE = 'recent';
const VERSION = 1;

function openDb(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, VERSION);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error ?? new Error('IndexedDB open failed'));
  });
}

export async function putRecentProject(entry: RecentProject): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).put(entry);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Recent save failed')); };
  });
}

export async function getRecentProject(id: string): Promise<RecentProject | undefined> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).get(id);
    req.onsuccess = () => {
      const result = req.result as RecentProject | undefined;
      db.close();
      resolve(result);
    };
    req.onerror = () => { db.close(); reject(req.error ?? new Error('Recent load failed')); };
  });
}

export async function listRecentProjects(): Promise<RecentProject[]> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const req = db.transaction(STORE, 'readonly').objectStore(STORE).getAll();
    req.onsuccess = () => {
      const items = (req.result as RecentProject[]) ?? [];
      db.close();
      resolve(items.sort((a, b) => b.updatedAt - a.updatedAt));
    };
    req.onerror = () => { db.close(); reject(req.error ?? new Error('Recent list failed')); };
  });
}

export async function deleteRecentProject(id: string): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).delete(id);
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Recent delete failed')); };
  });
}

export async function clearRecentProjects(): Promise<void> {
  const db = await openDb();
  return new Promise((resolve, reject) => {
    const tx = db.transaction(STORE, 'readwrite');
    tx.objectStore(STORE).clear();
    tx.oncomplete = () => { db.close(); resolve(); };
    tx.onerror = () => { db.close(); reject(tx.error ?? new Error('Recent clear failed')); };
  });
}
