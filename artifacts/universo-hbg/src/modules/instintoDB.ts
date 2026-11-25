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

type LegacyStorage = Pick<Storage, "getItem" | "setItem" | "removeItem">;

const DB_NAME = "hbg_instinto_db";
const DB_VERSION = 1;
const STORE_NAME = "records";
const MIGRATION_KEY = "__local_storage_migrated_v1__";
const PENDING_FALLBACK_KEY = "__hbg_instinto_fallback_pending_v1__";
const RECORD_KEYS: InstintoRecordKey[] = ["notes", "lyrics", "projects", "draft"];
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

function readPendingFallbackKeys(storage: LegacyStorage | null): InstintoRecordKey[] {
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(PENDING_FALLBACK_KEY) ?? "[]");
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((key): key is InstintoRecordKey =>
          typeof key === "string" && RECORD_KEYS.includes(key as InstintoRecordKey)))]
      : [];
  } catch {
    return [];
  }
}

/** Decide which localStorage records must be imported into IndexedDB. */
export function getInstintoMigrationKeys(
  migrationComplete: boolean,
  pendingValue: string | null,
): InstintoRecordKey[] {
  if (!migrationComplete) return [...RECORD_KEYS];
  try {
    const parsed: unknown = JSON.parse(pendingValue ?? "[]");
    return Array.isArray(parsed)
      ? [...new Set(parsed.filter((key): key is InstintoRecordKey =>
          typeof key === "string" && RECORD_KEYS.includes(key as InstintoRecordKey)))]
      : [];
  } catch {
    return [];
  }
}

/** Persist one record to the localStorage fallback and mark it for later reconciliation. */
export function persistInstintoFallbackRecord(
  key: InstintoRecordKey,
  value: InstintoData[InstintoRecordKey],
  storage: LegacyStorage | null = getLegacyStorage(),
): boolean {
  if (!storage) return false;
  try {
    storage.setItem(LEGACY_KEYS[key], JSON.stringify(value));
    const pending = new Set(readPendingFallbackKeys(storage));
    pending.add(key);
    storage.setItem(PENDING_FALLBACK_KEY, JSON.stringify([...pending]));
    return true;
  } catch {
    return false;
  }
}

export function persistInstintoFallbackData(
  data: InstintoData,
  storage: LegacyStorage | null = getLegacyStorage(),
): boolean {
  if (!storage) return false;
  for (const key of RECORD_KEYS) {
    if (!persistInstintoFallbackRecord(key, data[key], storage)) return false;
  }
  return true;
}

function clearInstintoFallbackKeys(
  keys: InstintoRecordKey[],
  storage: LegacyStorage | null,
): void {
  if (!storage || !keys.length) return;
  try {
    const pending = readPendingFallbackKeys(storage).filter((key) => !keys.includes(key));
    if (pending.length) storage.setItem(PENDING_FALLBACK_KEY, JSON.stringify(pending));
    else storage.removeItem(PENDING_FALLBACK_KEY);
  } catch {
    // Keep the fallback records marked if their reconciliation marker cannot be updated.
    return;
  }
  for (const key of keys) {
    try { storage.removeItem(LEGACY_KEYS[key]); } catch { /* The marker is already cleared. */ }
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

function safeReadLegacyValue(storage: LegacyStorage | null, key: string): string | null {
  try { return storage?.getItem(key) ?? null; } catch { return null; }
}

export function readLegacyInstintoData(storage: LegacyStorage | null): InstintoData {
  return {
    notes: parseArray<InstintoNote>(safeReadLegacyValue(storage, LEGACY_KEYS.notes)),
    lyrics: parseArray<InstintoLyric>(safeReadLegacyValue(storage, LEGACY_KEYS.lyrics)),
    projects: parseArray<InstintoProject>(safeReadLegacyValue(storage, LEGACY_KEYS.projects)),
    draft: parseDraft(safeReadLegacyValue(storage, LEGACY_KEYS.draft)),
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
    let syncedKeys: InstintoRecordKey[] = [];
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const markerRequest = store.get(MIGRATION_KEY);
      markerRequest.onsuccess = () => {
        const migrationComplete = markerRequest.result === true;
        let pendingValue: string | null = null;
        try { pendingValue = storage?.getItem(PENDING_FALLBACK_KEY) ?? null; } catch { /* storage unavailable */ }
        syncedKeys = getInstintoMigrationKeys(migrationComplete, pendingValue);
        if (!syncedKeys.length) return;

        const legacy = readLegacyInstintoData(storage);
        for (const key of syncedKeys) store.put(legacy[key], key);
        store.put(true, MIGRATION_KEY);
      };
      markerRequest.onerror = () => transaction.abort();
      transaction.oncomplete = () => {
        database.close();
        clearInstintoFallbackKeys(syncedKeys, storage);
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
  await initializeInstintoStorage();
  const database = await openDatabase();
  await new Promise<void>((resolve, reject) => {
    try {
      const transaction = database.transaction(STORE_NAME, "readwrite");
      transaction.objectStore(STORE_NAME).put(value, key);
      transaction.oncomplete = () => {
        database.close();
        clearInstintoFallbackKeys([key], getLegacyStorage());
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
        clearInstintoFallbackKeys(RECORD_KEYS, getLegacyStorage());
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
