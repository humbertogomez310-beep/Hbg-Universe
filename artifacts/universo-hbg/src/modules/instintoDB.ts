import type {
  InstintoDraft,
  InstintoLyric,
  InstintoNote,
  InstintoProject,
} from "./instintoBackup.ts";

export interface InstintoData {
  notes: InstintoNote[];
  lyrics: InstintoLyric[];
  projects: InstintoProject[];
  draft: InstintoDraft;
}

export type InstintoRecordKey = keyof InstintoData;

type LegacyStorage = Pick<Storage, "getItem" | "removeItem">;

const DB_NAME = "hbg_instinto_db";
const DB_VERSION = 1;
const STORE_NAME = "records";
const MIGRATION_KEY = "__local_storage_migrated_v1__";
const FALLBACK_JOURNAL_KEY = "__instinto_fallback_pending_v1__";
const LEGACY_KEYS: Record<InstintoRecordKey, string> = {
  notes: "hbg_instinto_notes_v2",
  lyrics: "hbg_instinto_lyrics_v2",
  projects: "hbg_instinto_projects",
  draft: "hbg_instinto_draft_v1",
};

const EMPTY_DRAFT: InstintoDraft = {
  title: "",
  content: "",
  category: "notas",
  tags: [],
};

function getLegacyStorage(): LegacyStorage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function parseArray<T>(raw: string | null): T[] {
  if (!raw) return [];
  try {
    const value: unknown = JSON.parse(raw);
    return Array.isArray(value) ? value as T[] : [];
  } catch {
    return [];
  }
}

function parseDraft(raw: string | null): InstintoDraft {
  if (!raw) return { ...EMPTY_DRAFT, tags: [] };
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value)) {
      return { ...EMPTY_DRAFT, tags: [] };
    }
    const record = value as Record<string, unknown>;
    const category = record.category;
    return {
      title: typeof record.title === "string" ? record.title : "",
      content: typeof record.content === "string" ? record.content : "",
      category: category === "notas" || category === "letras" || category === "ideas" || category === "reflexiones"
        ? category
        : "notas",
      tags: Array.isArray(record.tags)
        ? record.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 30)
        : [],
    };
  } catch {
    return { ...EMPTY_DRAFT, tags: [] };
  }
}

export function readLegacyInstintoData(storage: LegacyStorage | null): InstintoData {
  return {
    notes: parseArray<InstintoNote>(storage?.getItem(LEGACY_KEYS.notes) ?? null),
    lyrics: parseArray<InstintoLyric>(storage?.getItem(LEGACY_KEYS.lyrics) ?? null),
    projects: parseArray<InstintoProject>(storage?.getItem(LEGACY_KEYS.projects) ?? null),
    draft: parseDraft(storage?.getItem(LEGACY_KEYS.draft) ?? null),
  };
}

function openDatabase(): Promise<IDBDatabase> {
  if (typeof indexedDB === "undefined") {
    return Promise.reject(new Error("IndexedDB no está disponible en este navegador."));
  }

  return new Promise((resolve, reject) => {
    const request = indexedDB.open(DB_NAME, DB_VERSION);
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir IndexedDB."));
    request.onblocked = () => reject(new Error("La apertura de IndexedDB está bloqueada por otra pestaña."));
  });
}

export async function initializeInstintoStorage(): Promise<void> {
  const database = await openDatabase();
  const storage = getLegacyStorage();
  await new Promise<void>((resolve, reject) => {
    let migrated = false;
    let recoveredFallbackKeys: string[] = [];
    let remainingFallbackKeys: string[] = [];
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const markerRequest = store.get(MIGRATION_KEY);
      markerRequest.onsuccess = () => {
        if (markerRequest.result === true) {
          // A failed IndexedDB write may have been saved to LocalStorage after
          // the first migration. Replay only journaled keys so newer fallback
          // values are not silently hidden by the completed migration marker.
          let pending: string[] = [];
          try {
            const parsed: unknown = JSON.parse(storage?.getItem(FALLBACK_JOURNAL_KEY) ?? "[]");
            if (Array.isArray(parsed)) pending = parsed.filter((key): key is string => typeof key === "string");
          } catch { pending = []; }

          for (const legacyKey of pending) {
            const recordKey = (Object.keys(LEGACY_KEYS) as InstintoRecordKey[])
              .find((key) => LEGACY_KEYS[key] === legacyKey);
            const raw = storage?.getItem(legacyKey) ?? null;
            if (!recordKey || raw === null) continue;
            try {
              const parsed: unknown = JSON.parse(raw);
              if (recordKey === "draft") {
                if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
                  store.put(parseDraft(raw), recordKey);
                  recoveredFallbackKeys.push(legacyKey);
                }
              } else if (Array.isArray(parsed)) {
                store.put(parsed, recordKey);
                recoveredFallbackKeys.push(legacyKey);
              }
            } catch { /* Leave malformed fallback data available for recovery. */ }
          }
          remainingFallbackKeys = pending.filter((key) => !recoveredFallbackKeys.includes(key));
          return;
        }

        const legacy = readLegacyInstintoData(storage);
        for (const key of Object.keys(LEGACY_KEYS) as InstintoRecordKey[]) {
          store.put(legacy[key], key);
        }
        store.put(true, MIGRATION_KEY);
        migrated = true;
      };
      markerRequest.onerror = () => transaction.abort();
      transaction.oncomplete = () => {
        database.close();
        if (storage && migrated) {
          for (const key of Object.values(LEGACY_KEYS)) {
            try { storage.removeItem(key); } catch { /* Keep the committed IndexedDB copy. */ }
          }
          try { storage.removeItem(FALLBACK_JOURNAL_KEY); } catch { /* IndexedDB is authoritative. */ }
        } else if (storage && recoveredFallbackKeys.length > 0) {
          for (const key of recoveredFallbackKeys) {
            try { storage.removeItem(key); } catch { /* Keep the committed IndexedDB copy. */ }
          }
          try {
            if (remainingFallbackKeys.length > 0) {
              storage.setItem(FALLBACK_JOURNAL_KEY, JSON.stringify(remainingFallbackKeys));
            } else {
              storage.removeItem(FALLBACK_JOURNAL_KEY);
            }
          } catch { /* The next load can retry recovery from the existing journal. */ }
        }
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error ?? new Error("Falló la migración de INSTINTO a IndexedDB."));
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error ?? new Error("La migración de INSTINTO fue cancelada."));
      };
    } catch (error) {
      database.close();
      reject(error instanceof Error ? error : new Error("No se pudo iniciar la migración de INSTINTO."));
    }
  });
}

export async function loadInstintoData(): Promise<InstintoData> {
  await initializeInstintoStorage();
  const database = await openDatabase();
  return new Promise((resolve, reject) => {
    const result: InstintoData = {
      notes: [],
      lyrics: [],
      projects: [],
      draft: { ...EMPTY_DRAFT, tags: [] },
    };
    try {
      const transaction = database.transaction(STORE_NAME, "readonly");
      const store = transaction.objectStore(STORE_NAME);
      for (const key of Object.keys(LEGACY_KEYS) as InstintoRecordKey[]) {
        const request = store.get(key);
        request.onsuccess = () => {
          const value = request.result;
          if (key === "draft") {
            result.draft = value && typeof value === "object"
              ? value as InstintoDraft
              : { ...EMPTY_DRAFT, tags: [] };
          } else if (Array.isArray(value)) {
            result[key] = value as never;
          }
        };
      }
      transaction.oncomplete = () => {
        database.close();
        resolve(result);
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error ?? new Error("No se pudieron leer los datos de INSTINTO."));
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error ?? new Error("La lectura de INSTINTO fue cancelada."));
      };
    } catch (error) {
      database.close();
      reject(error instanceof Error ? error : new Error("No se pudieron leer los datos de INSTINTO."));
    }
  });
}

export async function saveInstintoRecord(key: InstintoRecordKey, value: InstintoData[InstintoRecordKey]): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(value, key);
      transaction.oncomplete = () => {
        database.close();
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error ?? new Error("No se pudo guardar en IndexedDB."));
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error ?? new Error("El guardado en IndexedDB fue cancelado."));
      };
    } catch (error) {
      database.close();
      reject(error instanceof Error ? error : new Error("No se pudo guardar en IndexedDB."));
    }
  });
}

export async function replaceInstintoData(data: InstintoData): Promise<void> {
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      store.put(data.notes, "notes");
      store.put(data.lyrics, "lyrics");
      store.put(data.projects, "projects");
      store.put(data.draft, "draft");
      store.put(true, MIGRATION_KEY);
      transaction.oncomplete = () => {
        database.close();
        const storage = getLegacyStorage();
        if (storage) {
          for (const key of Object.values(LEGACY_KEYS)) {
            try { storage.removeItem(key); } catch { /* IndexedDB is already authoritative. */ }
          }
        }
        resolve();
      };
      transaction.onerror = () => {
        database.close();
        reject(transaction.error ?? new Error("No se pudo restaurar el respaldo de INSTINTO."));
      };
      transaction.onabort = () => {
        database.close();
        reject(transaction.error ?? new Error("La restauración del respaldo fue cancelada."));
      };
    } catch (error) {
      database.close();
      reject(error instanceof Error ? error : new Error("No se pudo restaurar el respaldo de INSTINTO."));
    }
  });
}
