export type ModuleId = "universo" | "instinto" | "vibra" | "terminador";

export type HBGActionName =
  | "music.play"
  | "music.pause"
  | "music.next"
  | "music.previous"
  | "music.search"
  | "music.playTrack"
  | "music.volume"
  | "music.favorite"
  | "music.playlist"
  | "music.mood"
  | "universe.navigate";

export interface HBGActionResult<T = unknown> {
  success: boolean;
  data?: T;
  error?: string;
  code?: string;
  requestId?: string;
}

export type HBGActionHandler = (
  payload?: Record<string, unknown>,
) => HBGActionResult | Promise<HBGActionResult>;

export interface HBGDispatchOptions {
  /**
   * Pending actions intentionally wait for a module to mount by default.
   * A timeout is available to callers that need a bounded request.
   */
  timeoutMs?: number;
}

export interface HBGPendingRequest {
  requestId: string;
  name: HBGActionName;
  createdAt: number;
}

export interface HBGActionRouter {
  registerAction(name: HBGActionName, handler: HBGActionHandler): () => void;
  dispatchAction(
    name: HBGActionName,
    payload?: Record<string, unknown>,
    options?: HBGDispatchOptions,
  ): Promise<HBGActionResult>;
  getRegisteredActions(): HBGActionName[];
  getPendingRequests(): HBGPendingRequest[];
  cancelPending(requestId?: string): number;
}

export interface ModuleConfig {
  id: ModuleId;
  label: string;
  icon: string;
  description: string;
  color: string;
}

export interface HBGCoreIdentity {
  id: "hbg-core";
  name: "HBG CORE";
  version: string;
  protocolVersion: "1";
}

export type HBGContextSubscriber = (
  key: string,
  value: unknown | undefined,
) => void;

export type HBGMemorySubscriber = (
  key: string,
  value: unknown | undefined,
) => void;