// IndexedDB engine for persisting audio files between sessions

const DB_NAME = "hbg_vibra_db";
const DB_VERSION = 1;
const STORE_AUDIO = "audio_files";
const STORE_META = "track_meta";

export interface TrackMeta {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // seconds
  size: number; // bytes
  type: string;
  importedAt: number;
}

function openDB(): Promise<IDBDatabase> {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB_NAME, DB_VERSION);
    req.onupgradeneeded = (e) => {
      const db = (e.target as IDBOpenDBRequest).result;
      if (!db.objectStoreNames.contains(STORE_AUDIO)) {
        db.createObjectStore(STORE_AUDIO); // key = track id
      }
      if (!db.objectStoreNames.contains(STORE_META)) {
        db.createObjectStore(STORE_META); // key = track id
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest
): Promise<unknown> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(storeName, mode);
    const store = transaction.objectStore(storeName);
    const req = fn(store);
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
    transaction.oncomplete = () => db.close();
  });
}

export async function saveAudioBlob(id: string, blob: Blob): Promise<void> {
  await tx(STORE_AUDIO, "readwrite", (s) => s.put(blob, id));
}

export async function getAudioBlob(id: string): Promise<Blob | null> {
  const result = await tx(STORE_AUDIO, "readonly", (s) => s.get(id));
  return (result as Blob) ?? null;
}

export async function deleteAudioBlob(id: string): Promise<void> {
  await tx(STORE_AUDIO, "readwrite", (s) => s.delete(id));
}

export async function saveTrackMeta(meta: TrackMeta): Promise<void> {
  await tx(STORE_META, "readwrite", (s) => s.put(meta, meta.id));
}

export async function getAllTrackMeta(): Promise<TrackMeta[]> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    const transaction = db.transaction(STORE_META, "readonly");
    const store = transaction.objectStore(STORE_META);
    const req = store.getAll();
    req.onsuccess = () => resolve(req.result as TrackMeta[]);
    req.onerror = () => reject(req.error);
    transaction.oncomplete = () => db.close();
  });
}

export async function deleteTrackMeta(id: string): Promise<void> {
  await tx(STORE_META, "readwrite", (s) => s.delete(id));
}

// Utility: read audio duration from a Blob
export function getAudioDuration(blob: Blob): Promise<number> {
  return new Promise((resolve) => {
    const url = URL.createObjectURL(blob);
    const audio = new Audio();
    audio.preload = "metadata";
    audio.src = url;
    audio.onloadedmetadata = () => {
      resolve(isFinite(audio.duration) ? audio.duration : 0);
      URL.revokeObjectURL(url);
    };
    audio.onerror = () => {
      resolve(0);
      URL.revokeObjectURL(url);
    };
  });
}

// Parse filename into title/artist
export function parseFilename(filename: string): { title: string; artist: string } {
  const base = filename.replace(/\.[^/.]+$/, ""); // strip extension
  // Try "Artist - Title" pattern
  const parts = base.split(" - ");
  if (parts.length >= 2) {
    return { artist: parts[0].trim(), title: parts.slice(1).join(" - ").trim() };
  }
  return { artist: "Artista desconocido", title: base.trim() };
}

export function formatDuration(seconds: number): string {
  if (!seconds || !isFinite(seconds)) return "0:00";
  const m = Math.floor(seconds / 60);
  const s = Math.floor(seconds % 60);
  return `${m}:${String(s).padStart(2, "0")}`;
}
