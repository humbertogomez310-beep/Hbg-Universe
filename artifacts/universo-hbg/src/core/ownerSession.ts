import { useSyncExternalStore } from "react";

export interface OwnerSessionState {
  isOwner: boolean;
  checking: boolean;
}

export type OwnerLoginResult =
  | { ok: true; detail: "OK" }
  | { ok: false; reason: "invalid" | "limited" | "error"; detail: string };

let state: OwnerSessionState = { isOwner: false, checking: true };
let version = 0;
const listeners = new Set<() => void>();

function publish(next: Partial<OwnerSessionState>): void {
  state = { ...state, ...next };
  listeners.forEach((listener) => listener());
}

function subscribe(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

function getSnapshot(): OwnerSessionState {
  return state;
}

// Pregunta al servidor si hay sesión de dueño. La interfaz nunca decide por sí sola.
async function checkSession(): Promise<void> {
  const mine = ++version;
  let owner = false;
  try {
    const response = await fetch("/api/auth/me", { credentials: "include" });
    const body = (await response.json().catch(() => null)) as {
      authenticated?: boolean;
      user?: { role?: string } | null;
    } | null;
    owner =
      response.ok && body?.authenticated === true && body.user?.role === "owner";
  } catch {
    owner = false;
  }
  if (mine === version) publish({ isOwner: owner, checking: false });
}

// La clave solo viaja en esta llamada; no se guarda en ningún sitio.
async function login(credential: string): Promise<OwnerLoginResult> {
  let response: Response;
  try {
    response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "owner", credential }),
    });
  } catch {
    return { ok: false, reason: "error", detail: "NET" };
  }
  if (response.status === 401) return { ok: false, reason: "invalid", detail: "HTTP401" };
  if (response.status === 429) return { ok: false, reason: "limited", detail: "HTTP429" };
  if (!response.ok) return { ok: false, reason: "error", detail: `HTTP${response.status}` };
  await checkSession();
  if (!state.isOwner) return { ok: false, reason: "error", detail: "NOSESSION" };
  return { ok: true, detail: "OK" };
}

async function logout(): Promise<void> {
  version += 1;
  try {
    await fetch("/api/auth/logout", { method: "POST", credentials: "include" });
  } catch {
    // Aunque falle la red, la interfaz se bloquea.
  }
  publish({ isOwner: false, checking: false });
}

export const ownerSession = {
  checkSession,
  login,
  logout,
  getState: getSnapshot,
  /** Solo para pruebas. */
  _reset(): void {
    version += 1;
    state = { isOwner: false, checking: true };
    listeners.forEach((listener) => listener());
  },
};

export function useOwnerSession(): OwnerSessionState {
  return useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
}