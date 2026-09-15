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

  init(): void {
    if (this.initialized) return;
    this.initialized = true;
    const storage = browserStorage();
    if (!storage) return;

    try {
      const serialized = storage.getItem(MEMORY_KEY);
      if (!serialized) return;
      const parsed: unknown = JSON.parse(serialized);
      if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return;
      Object.entries(parsed).forEach(([key, value]) => this.values.set(key, value));
    } catch {
      // Corrupt local memory must not prevent HBG CORE from mounting.
      storage.removeItem(MEMORY_KEY);
    }
  }

  remember(key: string, value: unknown): void {
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
    this.persist();
    this.notify(key, value);
  }

  recall<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  forget(key: string): boolean {
    const deleted = this.values.delete(key);
    if (!deleted) return false;
    this.persist();
    this.notify(key, undefined);
    return true;
  }

  clear(): void {
    const keys = [...this.values.keys()];
    this.values.clear();
    this.persist();
    keys.forEach((key) => this.notify(key, undefined));
  }

  snapshot(): Record<string, unknown> {
    return Object.fromEntries(this.values.entries());
  }

  subscribe(subscriber: HBGMemorySubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  private persist(): void {
    const storage = browserStorage();
    if (!storage) return;
    try {
      storage.setItem(MEMORY_KEY, JSON.stringify(this.snapshot()));
    } catch {
      // Memory is an enhancement; a storage quota failure must not break actions.
    }
  }

  private notify(key: string, value: unknown | undefined): void {
    this.subscribers.forEach((subscriber) => subscriber(key, value));
  }
}