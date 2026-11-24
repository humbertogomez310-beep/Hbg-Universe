export interface HBGEvent<T = unknown> {
  channel: string;
  payload: T;
  timestamp: string;
}

export type HBGEventSubscriber<T = unknown> = (event: HBGEvent<T>) => void;

/**
 * Lightweight in-process event bus adapted from the reusable SyncEngine
 * in lib-hbg-ecosystem-v2.zip.
 *
 * This bus carries notifications only. Commands that change application
 * state must continue to use HBGCore's registered action router.
 */
export class HBGEventBus {
  private readonly channels = new Map<string, Set<HBGEventSubscriber<unknown>>>();

  subscribe<T = unknown>(
    channel: string,
    subscriber: HBGEventSubscriber<T>,
  ): () => void {
    this.assertChannel(channel);
    let subscribers = this.channels.get(channel);
    if (!subscribers) {
      subscribers = new Set();
      this.channels.set(channel, subscribers);
    }
    subscribers.add(subscriber as HBGEventSubscriber<unknown>);

    return () => {
      const current = this.channels.get(channel);
      current?.delete(subscriber as HBGEventSubscriber<unknown>);
      if (current?.size === 0) this.channels.delete(channel);
    };
  }

  publish<T = unknown>(channel: string, payload: T): void {
    this.assertChannel(channel);
    const event: HBGEvent<T> = {
      channel,
      payload,
      timestamp: new Date().toISOString(),
    };
    queueMicrotask(() => this.dispatch(event));
  }

  /** Synchronous delivery is intended for deterministic unit tests. */
  publishSync<T = unknown>(channel: string, payload: T): void {
    this.assertChannel(channel);
    this.dispatch({
      channel,
      payload,
      timestamp: new Date().toISOString(),
    });
  }

  getActiveChannels(): string[] {
    return [...this.channels.keys()];
  }

  private dispatch<T>(event: HBGEvent<T>): void {
    const subscribers = this.channels.get(event.channel);
    if (!subscribers) return;

    for (const subscriber of [...subscribers]) {
      try {
        subscriber(event);
      } catch (error) {
        console.error(
          `[HBGEventBus] Subscriber failed for channel "${event.channel}":`,
          error,
        );
      }
    }
  }

  private assertChannel(channel: string): void {
    if (
      typeof channel !== "string" ||
      channel.trim().length === 0 ||
      channel.length > 120
    ) {
      throw new Error("El canal de eventos debe tener entre 1 y 120 caracteres.");
    }
  }
}
