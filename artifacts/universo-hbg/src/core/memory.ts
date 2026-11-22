import { HBGError } from "./errors";
import type { HBGMemorySubscriber } from "./types";

const MEMORY_KEY = "hbg_core_memory";

interface StorageLike {
  getItem(key: string): string | null;
  setItem(key: string, value: string): void;
  removeItem(key: string): void;
}

function browserStorage(): StorageLike | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

export class HBGMemoryStore {
  private readonly values = new Map<string, unknown>();
  private readonly subscribers = new Set<HBGMemorySubscriber>();
  private initialized = false;
  private persistenceAvailable = false;

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    const storage = browserStorage();
    if (!storage) {
      this.persistenceAvailable = false;
      return;
    }

    try {
      const serialized = storage.getItem(MEMORY_KEY);
      if (serialized) {
        const parsed: unknown = JSON.parse(serialized);
        if (
          typeof parsed !== "object" ||
          parsed === null ||
          Array.isArray(parsed)
        ) {
          this.persistenceAvailable = false;
          return;
        }
        const entries = Object.entries(parsed);
        if (
          entries.length > 500 ||
          entries.some(([key]) => !key.trim() || key.length > 100)
        ) {
          this.persistenceAvailable = false;
          return;
        }
        entries.forEach(([key, value]) => this.values.set(key, value));
      }
      this.persistenceAvailable = true;
    } catch {
      // Keep malformed or inaccessible storage untouched; memory remains session-local.
      this.persistenceAvailable = false;
    }
  }

  remember(key: string, value: unknown): void {
    if (!key.trim() || key.length > 100) {
      throw new HBGError(
        "MEMORY_SERIALIZATION_FAILED",
        "La clave de memoria debe tener entre 1 y 100 caracteres.",
      );
    }
    try {
      JSON.stringify(value);
    } catch (error) {
      throw new HBGError(
        "MEMORY_SERIALIZATION_FAILED",
        `No se pudo guardar memoria para "${key}".`,
        { cause: error },
      );
    }

    this.values.set(key, value);
    this.persistenceAvailable = this.persist();
    this.notify(key, value);
  }

  recall<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  forget(key: string): boolean {
    const deleted = this.values.delete(key);
    if (!deleted) return false;
    this.persistenceAvailable = this.persist();
    this.notify(key, undefined);
    return true;
  }

  clear(): void {
    const keys = [...this.values.keys()];
    this.values.clear();
    this.persistenceAvailable = this.persist();
    keys.forEach((key) => this.notify(key, undefined));
  }

  snapshot(): Record<string, unknown> {
    return Object.fromEntries(this.values.entries());
  }

  subscribe(subscriber: HBGMemorySubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  isPersistenceAvailable(): boolean {
    return this.persistenceAvailable;
  }

  private persist(): boolean {
    const storage = browserStorage();
    if (!storage) return false;
    try {
      storage.setItem(MEMORY_KEY, JSON.stringify(this.snapshot()));
      return true;
    } catch {
      return false;
    }
  }

  private notify(key: string, value: unknown | undefined): void {
    this.subscribers.forEach((subscriber) => subscriber(key, value));
  }
}
