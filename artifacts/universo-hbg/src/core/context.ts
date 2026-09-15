import type { HBGContextSubscriber } from "./types";

export class HBGContextStore {
  private readonly values = new Map<string, unknown>();
  private readonly subscribers = new Set<HBGContextSubscriber>();

  set(key: string, value: unknown): void {
    this.values.set(key, value);
    this.notify(key, value);
  }

  get<T>(key: string): T | undefined {
    return this.values.get(key) as T | undefined;
  }

  has(key: string): boolean {
    return this.values.has(key);
  }

  delete(key: string): boolean {
    const deleted = this.values.delete(key);
    if (deleted) this.notify(key, undefined);
    return deleted;
  }

  clear(): void {
    const keys = [...this.values.keys()];
    this.values.clear();
    keys.forEach((key) => this.notify(key, undefined));
  }

  snapshot(): Record<string, unknown> {
    return Object.fromEntries(this.values.entries());
  }

  subscribe(subscriber: HBGContextSubscriber): () => void {
    this.subscribers.add(subscriber);
    return () => this.subscribers.delete(subscriber);
  }

  private notify(key: string, value: unknown | undefined): void {
    this.subscribers.forEach((subscriber) => subscriber(key, value));
  }
}