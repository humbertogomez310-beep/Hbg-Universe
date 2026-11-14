export type TerminadorMemoryScope = "session" | "persistent";
export type TerminadorMemoryKind = "preference" | "decision";

export interface TerminadorMemoryEntry {
  key: string;
  value: string;
  kind: TerminadorMemoryKind;
  scope: TerminadorMemoryScope;
  createdAt: string;
  updatedAt: string;
}

export interface TerminadorMemoryStorage {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

const STORAGE_KEY = "hbg_terminador_memory_v1";
const MAX_ENTRIES = 100;
const MAX_VALUE_LENGTH = 2_000;
const MAX_STORAGE_BYTES = 100_000;
const SENSITIVE = /\b(password|passwd|secret|credential|api[\s_-]?key|token|authorization|bearer)\b/i;

function browserStorage(): TerminadorMemoryStorage | undefined {
  if (typeof window === "undefined") return undefined;
  try {
    return window.localStorage;
  } catch {
    return undefined;
  }
}

function serialized(entries: Map<string, TerminadorMemoryEntry>): string {
  return JSON.stringify({ version: 1, entries: [...entries.values()].filter((entry) => entry.scope === "persistent") });
}

function validateEntry(value: unknown): value is TerminadorMemoryEntry {
  if (typeof value !== "object" || value === null) return false;
  const entry = value as Partial<TerminadorMemoryEntry>;
  return typeof entry.key === "string" &&
    typeof entry.value === "string" &&
    (entry.kind === "preference" || entry.kind === "decision") &&
    (entry.scope === "session" || entry.scope === "persistent") &&
    typeof entry.createdAt === "string" &&
    typeof entry.updatedAt === "string";
}

export class TerminadorMemory {
  private readonly entries = new Map<string, TerminadorMemoryEntry>();
  private readonly storage?: TerminadorMemoryStorage;

  constructor(storage: TerminadorMemoryStorage | undefined = browserStorage()) {
    this.storage = storage;
  }

  get persistenceAvailable(): boolean {
    return Boolean(this.storage);
  }

  init(): void {
    const raw = this.storage?.getItem(STORAGE_KEY);
    if (!raw) return;
    let parsed: unknown;
    try {
      parsed = JSON.parse(raw);
    } catch (error) {
      throw new Error(`La memoria persistente está dañada: ${error instanceof Error ? error.message : "JSON inválido"}`);
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      parsed.version !== 1 ||
      !("entries" in parsed) ||
      !Array.isArray(parsed.entries) ||
      !parsed.entries.every(validateEntry)
    ) {
      throw new Error("El formato de memoria de Terminador no es compatible.");
    }
    if (parsed.entries.length > MAX_ENTRIES) throw new Error("La memoria persistente supera el límite de entradas.");
    parsed.entries.forEach((entry) => this.entries.set(`${entry.scope}:${entry.key}`, entry));
  }

  remember(
    key: string,
    value: string,
    options: { kind: TerminadorMemoryKind; scope?: TerminadorMemoryScope },
  ): TerminadorMemoryEntry {
    const cleanKey = key.trim();
    const cleanValue = value.trim();
    const scope = options.scope ?? "persistent";
    if (!cleanKey || !cleanValue) throw new Error("La clave y el valor de memoria son obligatorios.");
    if (cleanValue.length > MAX_VALUE_LENGTH) throw new Error(`El valor supera ${MAX_VALUE_LENGTH} caracteres.`);
    if (SENSITIVE.test(cleanKey) || SENSITIVE.test(cleanValue)) {
      throw new Error("No se almacenan secretos, credenciales ni tokens en memoria.");
    }
    if (scope === "persistent" && !this.storage) {
      throw new Error("El almacenamiento local persistente no está disponible en este entorno.");
    }
    const id = `${scope}:${cleanKey}`;
    const previous = this.entries.get(id);
    const now = new Date().toISOString();
    const entry: TerminadorMemoryEntry = {
      key: cleanKey,
      value: cleanValue,
      kind: options.kind,
      scope,
      createdAt: previous?.createdAt ?? now,
      updatedAt: now,
    };
    this.entries.set(id, entry);
    try {
      this.persist();
    } catch (error) {
      if (previous) this.entries.set(id, previous);
      else this.entries.delete(id);
      throw error;
    }
    return entry;
  }

  recall(key: string): TerminadorMemoryEntry | undefined {
    return this.entries.get(`persistent:${key}`) ?? this.entries.get(`session:${key}`);
  }

  recallRelevant(query: string, limit = 5): TerminadorMemoryEntry[] {
    const words = new Set(query.toLowerCase().split(/[^\p{L}\p{N}]+/u).filter((word) => word.length > 2));
    if (!words.size) return [];
    return [...this.entries.values()]
      .map((entry) => ({
        entry,
        score: [...words].filter((word) => `${entry.key} ${entry.value}`.toLowerCase().includes(word)).length,
      }))
      .filter((match) => match.score > 0)
      .sort((left, right) => right.score - left.score)
      .slice(0, Math.max(0, limit))
      .map(({ entry }) => entry);
  }

  forget(key: string, scope?: TerminadorMemoryScope): boolean {
    const scopes: TerminadorMemoryScope[] = scope ? [scope] : ["persistent", "session"];
    const removed = scopes.reduce<number>((count, itemScope) => {
      return count + Number(this.entries.delete(`${itemScope}:${key}`));
    }, 0);
    if (removed) this.persist();
    return removed > 0;
  }

  list(scope?: TerminadorMemoryScope): TerminadorMemoryEntry[] {
    return [...this.entries.values()].filter((entry) => !scope || entry.scope === scope);
  }

  exportBackup(): string {
    return serialized(this.entries);
  }

  importBackup(backup: string): void {
    let parsed: unknown;
    try {
      parsed = JSON.parse(backup);
    } catch (error) {
      throw new Error(`El respaldo de memoria no es JSON válido: ${error instanceof Error ? error.message : "error"}`);
    }
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("version" in parsed) ||
      parsed.version !== 1 ||
      !("entries" in parsed) ||
      !Array.isArray(parsed.entries) ||
      !parsed.entries.every(validateEntry)
    ) {
      throw new Error("El respaldo de memoria no tiene un formato compatible.");
    }
    const imported = new Map(this.entries);
    for (const entry of parsed.entries) {
      if (entry.scope !== "persistent" || SENSITIVE.test(entry.key) || SENSITIVE.test(entry.value)) {
        throw new Error("El respaldo incluye datos no permitidos.");
      }
      imported.set(`persistent:${entry.key}`, entry);
    }
    if (imported.size > MAX_ENTRIES || serialized(imported).length > MAX_STORAGE_BYTES) {
      throw new Error("El respaldo excede los límites de almacenamiento.");
    }
    const previous = new Map(this.entries);
    this.entries.clear();
    imported.forEach((entry, key) => this.entries.set(key, entry));
    try {
      this.persist();
    } catch (error) {
      this.entries.clear();
      previous.forEach((entry, key) => this.entries.set(key, entry));
      throw error;
    }
  }

  clear(scope?: TerminadorMemoryScope): void {
    for (const [id, entry] of this.entries) {
      if (!scope || entry.scope === scope) this.entries.delete(id);
    }
    this.persist();
  }

  private persist(): void {
    const value = serialized(this.entries);
    if (value.length > MAX_STORAGE_BYTES) throw new Error("La memoria de Terminador supera el límite de almacenamiento.");
    this.storage?.setItem(STORAGE_KEY, value);
  }
}
