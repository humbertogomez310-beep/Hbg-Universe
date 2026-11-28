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
const FALLBACK_BACKUP_KEY = "__hbg_instinto_fallback_backup_v1__";
const RECORD_REVISION_PREFIX = "__hbg_instinto_record_revision__:";
const RECORD_KEYS: InstintoRecordKey[] = ["notes", "lyrics", "projects", "draft"];
const LEGACY_KEYS: Record<InstintoRecordKey, string> = {
  notes: "hbg_instinto_notes_v2",
  lyrics: "hbg_instinto_lyrics_v2",
  projects: "hbg_instinto_projects",
  draft: "hbg_instinto_draft_v1",
};

let lastRevision = 0;

function nextInstintoRevision(minimum = 0): number {
  lastRevision = Math.max(Date.now() * 1_000, lastRevision + 1, minimum + 1);
  return lastRevision;
}

function revisionKey(key: InstintoRecordKey): string {
  return RECORD_REVISION_PREFIX + key;
}

export function shouldApplyInstintoFallback(fallbackRevision: number | null, storedRevision: number | null, hasStoredValue: boolean): boolean {
  if (fallbackRevision === null) return !hasStoredValue;
  return storedRevision === null || fallbackRevision > storedRevision;
}

type InstintoFallbackSnapshot = { data: InstintoData; revisions: Partial<Record<InstintoRecordKey, number>> };

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
  const fallbackBackupRaw = safeReadLegacyValue(storage, FALLBACK_BACKUP_KEY);
  if (fallbackBackupRaw !== null) {
    const snapshot = readInstintoFallbackSnapshot(storage);
    if (!snapshot) return false;
    try {
      const revision = nextInstintoRevision(snapshot.revisions[key] ?? 0);
      storage.setItem(FALLBACK_BACKUP_KEY, JSON.stringify({
        format: "hbg-instinto-fallback-v1",
        ...snapshot.data,
        [key]: value,
        revisions: { ...snapshot.revisions, [key]: revision },
      }));
      return true;
    } catch { return false; }
  }
  try {
    const revision = nextInstintoRevision();
    storage.setItem(LEGACY_KEYS[key], JSON.stringify({
      format: "hbg-instinto-record-fallback-v1", revision, value,
    }));
    try {
      const pending = new Set(readPendingFallbackKeys(storage));
      pending.add(key);
      storage.setItem(PENDING_FALLBACK_KEY, JSON.stringify([...pending]));
    } catch { /* The versioned fallback is discoverable without the journal. */ }
    return true;
  } catch { return false; }
}

export function persistInstintoFallbackData(
  data: InstintoData,
  storage: LegacyStorage | null = getLegacyStorage(),
): boolean {
  if (!storage) return false;
  try {
    // One localStorage write makes fallback restoration all-or-nothing.
    // Separate per-collection writes could leave a partially restored backup
    // marked for later migration when storage quota is reached mid-restore.
    const revisions = Object.fromEntries(RECORD_KEYS.map((key) => [key, nextInstintoRevision()])) as Record<InstintoRecordKey, number>;
    storage.setItem(FALLBACK_BACKUP_KEY, JSON.stringify({
      format: "hbg-instinto-fallback-v1",
      notes: data.notes,
      lyrics: data.lyrics,
      projects: data.projects,
      draft: data.draft,
      revisions,
    }));
    return true;
  } catch {
    return false;
  }
}

function clearInstintoFallbackKeys(
  keys: InstintoRecordKey[],
  storage: LegacyStorage | null,
): boolean {
  if (!keys.length) return true;
  if (!storage) return false;
  try {
    const pending = readPendingFallbackKeys(storage).filter((key) => !keys.includes(key));
    if (pending.length) storage.setItem(PENDING_FALLBACK_KEY, JSON.stringify(pending));
    else storage.removeItem(PENDING_FALLBACK_KEY);
  } catch {
    // Keep fallback data available if its reconciliation marker cannot be updated.
    return false;
  }
  for (const key of keys) {
    try { storage.removeItem(LEGACY_KEYS[key]); } catch { /* The marker is already cleared. */ }
  }
  return true;
}

function parseFallbackRecord(raw: string | null): { value: unknown; revision: number | null; versioned: boolean } | null {
  if (raw === null) return null;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
      const record = parsed as Record<string, unknown>;
      if (record.format === "hbg-instinto-record-fallback-v1" &&
          typeof record.revision === "number" && Number.isFinite(record.revision) &&
          record.revision > 0 && "value" in record) {
        lastRevision = Math.max(lastRevision, record.revision);
        return { value: record.value, revision: record.revision, versioned: true };
      }
    }
    return { value: parsed, revision: null, versioned: false };
  } catch { return null; }
}

function parseArray<T>(raw: string | null): T[] {
  const parsed = parseFallbackRecord(raw);
  return Array.isArray(parsed?.value) ? parsed.value as T[] : [];
}

function parseDraft(raw: string | null): InstintoDraft {
  if (!raw) return { ...EMPTY_DRAFT, tags: [] };
  try {
    const value: unknown = parseFallbackRecord(raw)?.value;
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

function readInstintoFallbackSnapshot(storage: LegacyStorage | null): InstintoFallbackSnapshot | null {
  const raw = safeReadLegacyValue(storage, FALLBACK_BACKUP_KEY);
  if (!raw) return null;
  try {
    const value: unknown = JSON.parse(raw);
    if (typeof value !== "object" || value === null || Array.isArray(value) ||
        (value as Record<string, unknown>).format !== "hbg-instinto-fallback-v1") return null;
    const record = value as Record<string, unknown>;
    if (!Array.isArray(record.notes) || !Array.isArray(record.lyrics) || !Array.isArray(record.projects) ||
        typeof record.draft !== "object" || record.draft === null || Array.isArray(record.draft)) return null;
    const revisions: Partial<Record<InstintoRecordKey, number>> = {};
    if (typeof record.revisions === "object" && record.revisions !== null && !Array.isArray(record.revisions)) {
      for (const key of RECORD_KEYS) {
        const revision = (record.revisions as Record<string, unknown>)[key];
        if (typeof revision === "number" && Number.isFinite(revision) && revision > 0) {
          revisions[key] = revision;
          lastRevision = Math.max(lastRevision, revision);
        }
      }
    }
    return {
      data: {
        notes: record.notes as InstintoNote[],
        lyrics: record.lyrics as InstintoLyric[],
        projects: record.projects as InstintoProject[],
        draft: parseDraft(JSON.stringify(record.draft)),
      },
      revisions,
    };
  } catch { return null; }
}

export function readInstintoFallbackData(storage: LegacyStorage | null): InstintoData | null {
  return readInstintoFallbackSnapshot(storage)?.data ?? null;
}

function clearInstintoFallbackBackup(storage: LegacyStorage | null): boolean {
  if (!storage) return false;
  try {
    storage.removeItem(FALLBACK_BACKUP_KEY);
    return true;
  } catch {
    return false;
  }
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
    let blocked = false;
    request.onupgradeneeded = () => {
      const database = request.result;
      if (!database.objectStoreNames.contains(STORE_NAME)) {
        database.createObjectStore(STORE_NAME);
      }
    };
    request.onsuccess = () => {
      const database = request.result;
      if (blocked) {
        database.close();
        return;
      }
      database.onversionchange = () => database.close();
      resolve(database);
    };
    request.onerror = () => reject(request.error ?? new Error("No se pudo abrir IndexedDB."));
    request.onblocked = () => {
      blocked = true;
      reject(new Error("La apertura de IndexedDB está bloqueada por otra pestaña."));
    };
  });
}

export async function initializeInstintoStorage(): Promise<void> {
  const database = await openDatabase();
  const storage = getLegacyStorage();
  await new Promise<void>((resolve, reject) => {
    let syncedKeys: InstintoRecordKey[] = [];
    let syncedFullBackup = false;
    let transaction: IDBTransaction;
    try {
      transaction = database.transaction(STORE_NAME, "readwrite");
      const store = transaction.objectStore(STORE_NAME);
      const markerRequest = store.get(MIGRATION_KEY);
      markerRequest.onsuccess = () => {
        const migrationComplete = markerRequest.result === true;
        const backupRaw = safeReadLegacyValue(storage, FALLBACK_BACKUP_KEY);
        if (backupRaw !== null) {
          const snapshot = readInstintoFallbackSnapshot(storage);
          if (!snapshot) { transaction.abort(); return; }

          if (!migrationComplete) {
            for (const key of RECORD_KEYS) {
              const revision = snapshot.revisions[key] ?? nextInstintoRevision();
              store.put(snapshot.data[key], key);
              store.put(revision, revisionKey(key));
            }
            syncedKeys = [...RECORD_KEYS];
            syncedFullBackup = true;
            store.put(true, MIGRATION_KEY);
            return;
          }

          let completed = 0;
          let ambiguous = false;
          const reconciled = new Set<InstintoRecordKey>();
          const finishKey = () => {
            completed += 1;
            if (completed === RECORD_KEYS.length && !ambiguous && reconciled.size === RECORD_KEYS.length) {
              syncedKeys = [...RECORD_KEYS];
              syncedFullBackup = true;
            }
          };
          for (const key of RECORD_KEYS) {
            const valueRequest = store.get(key);
            const revisionRequest = store.get(revisionKey(key));
            let valueReady = false;
            let revisionReady = false;
            const reconcile = () => {
              if (!valueReady || !revisionReady) return;
              const hasStoredValue = valueRequest.result !== undefined;
              const storedRevision = typeof revisionRequest.result === "number" ? revisionRequest.result : null;
              const fallbackRevision = snapshot.revisions[key] ?? null;
              if (shouldApplyInstintoFallback(fallbackRevision, storedRevision, hasStoredValue)) {
                const revision = fallbackRevision ?? nextInstintoRevision(storedRevision ?? 0);
                store.put(snapshot.data[key], key);
                store.put(revision, revisionKey(key));
                reconciled.add(key);
              } else if (fallbackRevision !== null && storedRevision !== null && fallbackRevision <= storedRevision) {
                reconciled.add(key);
              } else {
                // Unversioned legacy data cannot safely replace a populated record.
                ambiguous = true;
              }
              finishKey();
            };
            valueRequest.onsuccess = () => { valueReady = true; reconcile(); };
            revisionRequest.onsuccess = () => { revisionReady = true; reconcile(); };
            valueRequest.onerror = () => transaction.abort();
            revisionRequest.onerror = () => transaction.abort();
          }
          store.put(true, MIGRATION_KEY);
          return;
        }

        let pendingValue: string | null = null;
        try { pendingValue = storage?.getItem(PENDING_FALLBACK_KEY) ?? null; } catch { /* storage unavailable */ }
        const pendingSet = new Set(getInstintoMigrationKeys(migrationComplete, pendingValue));
        if (migrationComplete) {
          for (const key of RECORD_KEYS) {
            if (parseFallbackRecord(safeReadLegacyValue(storage, LEGACY_KEYS[key]))?.versioned) pendingSet.add(key);
          }
        }
        const pending = [...pendingSet];
        if (!pending.length) return;

        if (!migrationComplete) {
          const legacy = readLegacyInstintoData(storage);
          for (const key of RECORD_KEYS) {
            const fallback = parseFallbackRecord(safeReadLegacyValue(storage, LEGACY_KEYS[key]));
            const revision = fallback?.versioned && fallback.revision !== null ? fallback.revision : nextInstintoRevision();
            store.put(legacy[key], key);
            store.put(revision, revisionKey(key));
          }
          syncedKeys = [...RECORD_KEYS];
          store.put(true, MIGRATION_KEY);
          return;
        }

        let completed = 0;
        const reconciled = new Set<InstintoRecordKey>();
        const finishKey = () => {
          completed += 1;
          if (completed === pending.length) syncedKeys = [...reconciled];
        };
        for (const key of pending) {
          const fallback = parseFallbackRecord(safeReadLegacyValue(storage, LEGACY_KEYS[key]));
          const valueRequest = store.get(key);
          const revisionRequest = store.get(revisionKey(key));
          let valueReady = false;
          let revisionReady = false;
          const reconcile = () => {
            if (!valueReady || !revisionReady) return;
            const hasStoredValue = valueRequest.result !== undefined;
            const storedRevision = typeof revisionRequest.result === "number" ? revisionRequest.result : null;
            if (fallback?.versioned && fallback.revision !== null) {
              if (shouldApplyInstintoFallback(fallback.revision, storedRevision, hasStoredValue)) {
                store.put(fallback.value, key);
                store.put(fallback.revision, revisionKey(key));
                reconciled.add(key);
              } else if (storedRevision !== null && fallback.revision <= storedRevision) {
                reconciled.add(key);
              }
            } else if (!hasStoredValue && fallback) {
              const valid = key === "draft"
                ? typeof fallback.value === "object" && fallback.value !== null && !Array.isArray(fallback.value)
                : Array.isArray(fallback.value);
              if (valid) {
                store.put(fallback.value, key);
                store.put(nextInstintoRevision(storedRevision ?? 0), revisionKey(key));
                reconciled.add(key);
              }
            }
            // Keep unversioned values when a record exists: their age is unknown.
            finishKey();
          };
          valueRequest.onsuccess = () => { valueReady = true; reconcile(); };
          revisionRequest.onsuccess = () => { revisionReady = true; reconcile(); };
          valueRequest.onerror = () => transaction.abort();
          revisionRequest.onerror = () => transaction.abort();
        }
      };
      markerRequest.onerror = () => transaction.abort();
      transaction.oncomplete = () => {
        database.close();
        const markersCleared = clearInstintoFallbackKeys(syncedKeys, storage);
        if (syncedFullBackup && markersCleared) clearInstintoFallbackBackup(storage);
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
      const store = transaction.objectStore(STORE_NAME);
      const revisionRequest = store.get(revisionKey(key));
      revisionRequest.onsuccess = () => {
        const storedRevision = typeof revisionRequest.result === "number" ? revisionRequest.result : 0;
        const revision = nextInstintoRevision(storedRevision);
        store.put(value, key);
        store.put(revision, revisionKey(key));
      };
      revisionRequest.onerror = () => transaction.abort();
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
      for (const key of RECORD_KEYS) {
        const revisionRequest = store.get(revisionKey(key));
        revisionRequest.onsuccess = () => {
          const storedRevision = typeof revisionRequest.result === "number" ? revisionRequest.result : 0;
          const revision = nextInstintoRevision(storedRevision);
          store.put(data[key], key);
          store.put(revision, revisionKey(key));
        };
        revisionRequest.onerror = () => transaction.abort();
      }
      store.put(true, MIGRATION_KEY);
      transaction.oncomplete = () => {
        database.close();
        const storage = getLegacyStorage();
        const markersCleared = clearInstintoFallbackKeys(RECORD_KEYS, storage);
        if (markersCleared) clearInstintoFallbackBackup(storage);
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

}
