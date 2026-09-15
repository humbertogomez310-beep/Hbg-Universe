import { HBGContextStore } from "./context";
import { HBGError } from "./errors";
import { getHBGCoreIdentity } from "./identity";
import { HBGMemoryStore } from "./memory";
import { HBGRequestProcessor } from "./requestProcessor";
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

  dispatchAction(
    name: HBGActionName,
    payload?: Record<string, unknown>,
    options?: HBGDispatchOptions,
  ): Promise<HBGActionResult> {
    return this.requestProcessor.dispatchAction(name, payload, options);
  }

  getRegisteredActions(): HBGActionName[] {
    return this.requestProcessor.getRegisteredActions();
  }

  getPendingRequests(): HBGPendingRequest[] {
    return this.requestProcessor.getPendingRequests();
  }

  cancelPending(requestId?: string): number {
    return this.requestProcessor.cancelPending(requestId);
  }

  getActionRouter(): HBGActionRouter {
    return this.requestProcessor;
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

  subscribeMemory(subscriber: HBGMemorySubscriber): () => void {
    return this.memory.subscribe(subscriber);
  }
}

export const hbgCore = new HBGCore();