export type ModuleId = "universo" | "instinto" | "vibra" | "terminador";

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

  private _notify(): void {
    this._subscribers.forEach((cb) => cb(this._activeModule));
  }
}

export const hbgCore = new HBGCore();
