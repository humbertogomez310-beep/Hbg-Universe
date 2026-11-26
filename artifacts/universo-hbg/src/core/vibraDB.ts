// IndexedDB engine for persisting audio files between sessions

const DB_NAME = "hbg_vibra_db";
const DB_VERSION = 2;
const STORE_AUDIO = "audio_files";
const STORE_META = "track_meta";
const STORE_STATE = "app_state";

export interface TrackMeta {
  id: string;
  title: string;
  artist: string;
  album: string;
  duration: number; // seconds
  size: number; // bytes
  type: string;
  importedAt: number;
  /** Locally estimated tempo; omitted until analysis is available. */
  bpm?: number;
  bpmConfidence?: number;
  /** Strength of the detected rhythmic pulse (0–1), estimated locally. */
  beatStrength?: number;
  /** Relative RMS energy of the track (0–1), estimated locally. */
  energyLevel?: number;
  /** Transient impact/punch estimate (0–1), not a semantic drop detector. */
  impactStrength?: number;
  /** Locally estimated musical key, e.g. C major or A minor. */
  musicalKey?: string;
  keyConfidence?: number;
  analyzedAt?: number;
  /** SHA-256 of exact file bytes when safely available during a manual device scan. */
  contentHash?: string;
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
      if (!db.objectStoreNames.contains(STORE_STATE)) {
        db.createObjectStore(STORE_STATE); // key = application state name
      }
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(
  storeName: string,
  mode: IDBTransactionMode,
  fn: (store: IDBObjectStore) => IDBRequest,
): Promise<unknown> {
  const db = await openDB();
  return new Promise((resolve, reject) => {
    let settled = false;
    let result: unknown;
    const close = () => db.close();
    const fail = (error: DOMException | Error | null) => {
      if (settled) return;
      settled = true;
      close();
      reject(error ?? new Error("La operación IndexedDB no pudo completarse."));
    };

    let transaction: IDBTransaction;
    try {
      transaction = db.transaction(storeName, mode);
      const request = fn(transaction.objectStore(storeName));
      request.onsuccess = () => {
        result = request.result;
      };
      request.onerror = () => fail(request.error);
      transaction.oncomplete = () => {
        if (settled) return;
        settled = true;
        close();
        resolve(result);
      };
      transaction.onerror = () => fail(transaction.error);
      transaction.onabort = () => fail(transaction.error);
    } catch (error) {
      fail(error instanceof Error ? error : new Error("No se pudo iniciar la transacción IndexedDB."));
    }
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
  return (await tx(STORE_META, "readonly", (store) => store.getAll())) as TrackMeta[];
}

export async function saveAppState<T>(key: string, value: T): Promise<void> {
  await tx(STORE_STATE, "readwrite", (store) => store.put(value, key));
}

export async function getAppState<T>(key: string): Promise<T | null> {
  const value = await tx(STORE_STATE, "readonly", (store) => store.get(key));
  return (value as T) ?? null;
}

export async function deleteAppState(key: string): Promise<void> {
  await tx(STORE_STATE, "readwrite", (store) => store.delete(key));
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
