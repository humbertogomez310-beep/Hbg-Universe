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
  | "universe.navigate";

export interface HBGActionResult<T = unknown> {
  success: boolean;
  error?: string;
  data?: T;
}

export type HBGActionHandler = (
  payload?: Record<string, unknown>,
) => HBGActionResult | Promise<HBGActionResult>;

interface PendingAction {
  name: HBGActionName;
  payload?: Record<string, unknown>;
  resolve: (result: HBGActionResult) => void;
}

export interface ModuleConfig {
  id: ModuleId;
  label: string;
  icon: string;
  description: string;
  color: string;
}

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

type Subscriber = (module: ModuleId) => void;

const STORAGE_KEY = "hbg_active_module";

class HBGCore {
  private _activeModule: ModuleId = "universo";
  private _subscribers: Subscriber[] = [];
  private _initialized = false;
  private _handlers = new Map<HBGActionName, HBGActionHandler>();
  private _pending: PendingAction[] = [];
  private _context = new Map<string, unknown>();

  init(): void {
    if (this._initialized) return;
    const stored = localStorage.getItem(STORAGE_KEY) as ModuleId | null;
    const valid: ModuleId[] = ["universo", "instinto", "vibra", "terminador"];
    if (stored && valid.includes(stored)) {
      this._activeModule = stored;
    }
    this._initialized = true;
  }

  getModule(): ModuleId {
    return this._activeModule;
  }

  setModule(module: ModuleId): void {
    if (this._activeModule === module) return;
    this._activeModule = module;
    localStorage.setItem(STORAGE_KEY, module);
    this._notify();
  }

  subscribe(callback: Subscriber): () => void {
    this._subscribers.push(callback);
    return () => {
      this._subscribers = this._subscribers.filter((s) => s !== callback);
    };
  }

  getModuleConfig(id: ModuleId): ModuleConfig {
    return MODULES.find((m) => m.id === id)!;
  }

  registerAction(name: HBGActionName, handler: HBGActionHandler): () => void {
    this._handlers.set(name, handler);
    void this.flushPending();
    return () => {
      if (this._handlers.get(name) === handler) this._handlers.delete(name);
    };
  }

  async dispatchAction(
    name: HBGActionName,
    payload?: Record<string, unknown>,
  ): Promise<HBGActionResult> {
    const handler = this._handlers.get(name);
    if (!handler) {
      return new Promise((resolve) => {
        this._pending.push({ name, payload, resolve });
      });
    }
    try {
      return await handler(payload);
    } catch (error) {
      return {
        success: false,
        error: error instanceof Error ? error.message : "Error de ejecución",
      };
    }
  }

  getRegisteredActions(): HBGActionName[] {
    return [...this._handlers.keys()];
  }

  setContext(key: string, value: unknown): void {
    this._context.set(key, value);
  }

  getContext<T>(key: string): T | undefined {
    return this._context.get(key) as T | undefined;
  }

  private async flushPending(): Promise<void> {
    if (!this._pending.length) return;
    const pending = [...this._pending];
    this._pending = [];
    for (const action of pending) {
      if (this._handlers.has(action.name)) {
        action.resolve(await this.dispatchAction(action.name, action.payload));
      } else {
        this._pending.push(action);
      }
    }
  }

  private _notify(): void {
    this._subscribers.forEach((cb) => cb(this._activeModule));
  }
}

export const hbgCore = new HBGCore();
