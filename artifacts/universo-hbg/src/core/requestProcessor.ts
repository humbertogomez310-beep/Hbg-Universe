import { HBGError, toActionError } from "./errors";
import type {
  HBGActionHandler,
  HBGActionName,
  HBGActionResult,
  HBGDispatchOptions,
  HBGPendingRequest,
} from "./types";

interface PendingAction extends HBGPendingRequest {
  payload?: Record<string, unknown>;
  resolve: (result: HBGActionResult) => void;
  timer?: ReturnType<typeof setTimeout>;
}

function requestId(): string {
  if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
    return crypto.randomUUID();
  }
  return `hbg-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}

export class HBGRequestProcessor {
  private readonly handlers = new Map<HBGActionName, HBGActionHandler>();
  private pending: PendingAction[] = [];

  registerAction(name: HBGActionName, handler: HBGActionHandler): () => void {
    this.handlers.set(name, handler);
    void this.flushPending();
    return () => {
      if (this.handlers.get(name) === handler) this.handlers.delete(name);
    };
  }

  async dispatchAction(
    name: HBGActionName,
    payload?: Record<string, unknown>,
    options?: HBGDispatchOptions,
  ): Promise<HBGActionResult> {
    const id = requestId();
    const handler = this.handlers.get(name);
    if (!handler) {
      return new Promise((resolve) => {
        const pending: PendingAction = {
          requestId: id,
          name,
          payload,
          createdAt: Date.now(),
          resolve,
        };

        if (options?.timeoutMs !== undefined && options.timeoutMs > 0) {
          pending.timer = setTimeout(() => {
            this.removePending(id);
            resolve({
              success: false,
              error: `La acción "${name}" agotó el tiempo de espera.`,
              code: "ACTION_TIMEOUT",
              requestId: id,
            });
          }, options.timeoutMs);
        }
        this.pending.push(pending);
      });
    }

    return this.invoke(handler, payload, id);
  }

  getRegisteredActions(): HBGActionName[] {
    return [...this.handlers.keys()];
  }

  getPendingRequests(): HBGPendingRequest[] {
    return this.pending.map(({ requestId: id, name, createdAt }) => ({
      requestId: id,
      name,
      createdAt,
    }));
  }

  cancelPending(requestIdToCancel?: string): number {
    const cancelled = requestIdToCancel
      ? this.pending.filter((action) => action.requestId === requestIdToCancel)
      : [...this.pending];

    cancelled.forEach((action) => {
      if (action.timer) clearTimeout(action.timer);
      action.resolve({
        success: false,
        error: "La acción fue cancelada.",
        code: "ACTION_CANCELLED",
        requestId: action.requestId,
      });
      this.removePending(action.requestId);
    });
    return cancelled.length;
  }

  private async invoke(
    handler: HBGActionHandler,
    payload: Record<string, unknown> | undefined,
    id: string,
  ): Promise<HBGActionResult> {
    try {
      const result = await handler(payload);
      if (!result || typeof result.success !== "boolean") {
        throw new HBGError(
          "ACTION_HANDLER_FAILED",
          "El handler devolvió un resultado inválido.",
        );
      }
      return { ...result, requestId: id };
    } catch (error) {
      return toActionError(error, id);
    }
  }

  private async flushPending(): Promise<void> {
    if (!this.pending.length) return;
    const pending = [...this.pending];
    this.pending = [];

    for (const action of pending) {
      if (this.handlers.has(action.name)) {
        if (action.timer) clearTimeout(action.timer);
        const result = await this.invoke(
          this.handlers.get(action.name)!,
          action.payload,
          action.requestId,
        );
        action.resolve(result);
      } else {
        this.pending.push(action);
      }
    }
  }

  private removePending(id: string): void {
    this.pending = this.pending.filter((action) => action.requestId !== id);
  }
}