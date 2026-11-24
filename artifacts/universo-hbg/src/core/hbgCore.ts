import { HBGContextStore } from "./context.ts";
import { HBGEventBus, type HBGEventSubscriber } from "./eventBus.ts";
import { HBGError } from "./errors.ts";
import { getHBGCoreIdentity } from "./identity.ts";
import { HBGMemoryStore } from "./memory.ts";
import { HBGRequestProcessor } from "./requestProcessor.ts";
import type {
  HBGActionHandler,
  HBGActionName,
  HBGActionResult,
  HBGActionRouter,
  HBGContextSubscriber,
  HBGDispatchOptions,
  HBGMemorySubscriber,
  HBGPendingRequest,
  HBGCoreIdentity,
  ModuleConfig,
  ModuleId,
} from "./types";

export type {
  HBGActionHandler,
  HBGActionName,
  HBGActionResult,
  HBGActionRouter,
  HBGDispatchOptions,
  HBGPendingRequest,
  HBGCoreIdentity,
  ModuleConfig,
  ModuleId,
} from "./types";

export const MODULES: ModuleConfig[] = [
  {
    id: "universo",
    label: "UNIVERSO",
    icon: "◈",
    description: "Centro de control del ecosistema HBG",
    color: "#7C4DFF",
  },
  {
    id: "instinto",
    label: "INSTINTO",
    icon: "⬡",
    description: "Módulo de notas y creatividad",
    color: "#00E5FF",
  },
  {
    id: "vibra",
    label: "VIBRA PRO",
    icon: "◉",
    description: "Motor de audio y estados de ánimo",
    color: "#FF4081",
  },
  {
    id: "terminador",
    label: "TERMINADOR",
    icon: "⬢",
    description: "Agente de automatización del sistema",
    color: "#69FF47",
  },
];

export const HBG_CORE_EVENTS = {
  ACTION_REQUESTED: "hbg_core.action_requested",
  ACTION_SUCCEEDED: "hbg_core.action_succeeded",
  ACTION_FAILED: "hbg_core.action_failed",
  MOOD_CHANGED: "hbg_core.mood_changed",
} as const;

export interface HBGActionLifecycleEvent {
  action: HBGActionName;
  requestId?: string;
  code?: string;
}

type ModuleSubscriber = (module: ModuleId) => void;
const STORAGE_KEY = "hbg_active_module";
const VALID_MODULES = new Set<ModuleId>([
  "universo",
  "instinto",
  "vibra",
  "terminador",
]);

function isModuleId(value: string): value is ModuleId {
  return VALID_MODULES.has(value as ModuleId);
}

function readStoredModule(): ModuleId | null {
  if (typeof window === "undefined") return null;
  try {
    const stored = window.localStorage.getItem(STORAGE_KEY);
    return stored && isModuleId(stored) ? stored : null;
  } catch {
    return null;
  }
}

function storeModule(module: ModuleId): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, module);
  } catch {
    // Navigation remains functional when browser storage is unavailable.
  }
}

export class HBGCore implements HBGActionRouter {
  private activeModule: ModuleId = "universo";
  private initialized = false;
  private readonly moduleSubscribers = new Set<ModuleSubscriber>();
  private readonly context = new HBGContextStore();
  private readonly memory = new HBGMemoryStore();
  private readonly requestProcessor = new HBGRequestProcessor();
  private readonly events = new HBGEventBus();

  init(): void {
    if (this.initialized) return;
    this.activeModule = readStoredModule() ?? "universo";
    this.memory.init();
    this.initialized = true;
  }

  getIdentity(): HBGCoreIdentity {
    return getHBGCoreIdentity();
  }

  getModule(): ModuleId {
    return this.activeModule;
  }

  setModule(module: ModuleId): void {
    if (!isModuleId(module)) {
      throw new HBGError("INVALID_MODULE", `Módulo HBG no válido: ${module}`);
    }
    if (this.activeModule === module) return;
    this.activeModule = module;
    storeModule(module);
    this.moduleSubscribers.forEach((subscriber) => subscriber(module));
  }

  subscribe(subscriber: ModuleSubscriber): () => void {
    this.moduleSubscribers.add(subscriber);
    return () => this.moduleSubscribers.delete(subscriber);
  }

  getModuleConfig(id: ModuleId): ModuleConfig {
    const config = MODULES.find((module) => module.id === id);
    if (!config) {
      throw new HBGError("INVALID_MODULE", `Módulo HBG no registrado: ${id}`);
    }
    return config;
  }

  registerAction(name: HBGActionName, handler: HBGActionHandler): () => void {
    return this.requestProcessor.registerAction(name, handler);
  }

  async dispatchAction(
    name: HBGActionName,
    payload?: Record<string, unknown>,
    options?: HBGDispatchOptions,
  ): Promise<HBGActionResult> {
    this.events.publish(HBG_CORE_EVENTS.ACTION_REQUESTED, { action: name });
    const result = await this.requestProcessor.dispatchAction(name, payload, options);
    const event: HBGActionLifecycleEvent = {
      action: name,
      ...(result.requestId ? { requestId: result.requestId } : {}),
      ...(result.code ? { code: result.code } : {}),
    };
    this.events.publish(
      result.success ? HBG_CORE_EVENTS.ACTION_SUCCEEDED : HBG_CORE_EVENTS.ACTION_FAILED,
      event,
    );
    return result;
  }

  getRegisteredActions(): HBGActionName[] {
    return this.requestProcessor.getRegisteredActions();
  }

  subscribeActions(subscriber: (actions: HBGActionName[]) => void): () => void {
    return this.requestProcessor.subscribeActions(subscriber);
  }

  /** Publish a notification between modules; notifications never authorize actions. */
  publishEvent<T = unknown>(channel: string, payload: T): void {
    this.events.publish(channel, payload);
  }

  /** Subscribe to lifecycle notifications; event payloads never include action data. */
  subscribeEvent<T = unknown>(
    channel: string,
    subscriber: HBGEventSubscriber<T>,
  ): () => void {
    return this.events.subscribe(channel, subscriber);
  }

  getActiveEventChannels(): string[] {
    return this.events.getActiveChannels();
  }

  getPendingRequests(): HBGPendingRequest[] {
    return this.requestProcessor.getPendingRequests();
  }

  cancelPending(requestId?: string): number {
    return this.requestProcessor.cancelPending(requestId);
  }

  getActionRouter(): HBGActionRouter {
    // Preserve lifecycle notifications for consumers using the shared router API.
    return this;
  }

  setContext(key: string, value: unknown): void {
    this.context.set(key, value);
  }

  getContext<T>(key: string): T | undefined {
    return this.context.get<T>(key);
  }

  hasContext(key: string): boolean {
    return this.context.has(key);
  }

  deleteContext(key: string): boolean {
    return this.context.delete(key);
  }

  clearContext(): void {
    this.context.clear();
  }

  getContextSnapshot(): Record<string, unknown> {
    return this.context.snapshot();
  }

  subscribeContext(subscriber: HBGContextSubscriber): () => void {
    return this.context.subscribe(subscriber);
  }

  remember(key: string, value: unknown): void {
    this.memory.remember(key, value);
    if (key === "core.mood") {
      this.events.publish(HBG_CORE_EVENTS.MOOD_CHANGED, { mood: value });
    }
  }

  recall<T>(key: string): T | undefined {
    return this.memory.recall<T>(key);
  }

  forgetMemory(key: string): boolean {
    return this.memory.forget(key);
  }

  clearMemory(): void {
    this.memory.clear();
  }

  getMemorySnapshot(): Record<string, unknown> {
    return this.memory.snapshot();
  }

  isMemoryPersistenceAvailable(): boolean {
    return this.memory.isPersistenceAvailable();
  }

  subscribeMemory(subscriber: HBGMemorySubscriber): () => void {
    return this.memory.subscribe(subscriber);
  }
}

export const hbgCore = new HBGCore();