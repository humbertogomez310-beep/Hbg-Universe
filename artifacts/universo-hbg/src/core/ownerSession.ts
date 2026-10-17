export interface OwnerSessionSnapshot {
  isOwner: boolean;
  checking: boolean;
}

export type OwnerLoginResult =
  | { ok: true }
  | { ok: false; reason: "invalid" | "limited" | "error" };

type OwnerSessionListener = () => void;
type SessionResponse = {
  authenticated?: unknown;
  user?: { role?: unknown } | null;
};

let snapshot: OwnerSessionSnapshot = { isOwner: false, checking: true };
let requestVersion = 0;
const listeners = new Set<OwnerSessionListener>();

function publish(next: OwnerSessionSnapshot): void {
  snapshot = next;
  listeners.forEach((listener) => listener());
}

async function checkSession(): Promise<void> {
  const version = ++requestVersion;
  publish({ isOwner: false, checking: true });

  try {
    const response = await fetch("/api/auth/me", { credentials: "include" });
    const data = response.ok
      ? ((await response.json()) as SessionResponse)
      : null;
    if (version !== requestVersion) return;

    publish({
      isOwner: data?.authenticated === true && data.user?.role === "owner",
      checking: false,
    });
  } catch {
    if (version === requestVersion) {
      publish({ isOwner: false, checking: false });
    }
  }
}

async function login(credential: string): Promise<OwnerLoginResult> {
  const version = ++requestVersion;
  publish({ isOwner: false, checking: true });

  try {
    const response = await fetch("/api/auth/login", {
      method: "POST",
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ username: "owner", credential }),
    });

    if (response.status === 401) {
      if (version === requestVersion) {
        publish({ isOwner: false, checking: false });
      }
      return { ok: false, reason: "invalid" };
    }
    if (response.status === 429) {
      if (version === requestVersion) {
        publish({ isOwner: false, checking: false });
      }
      return { ok: false, reason: "limited" };
    }
    if (!response.ok) {
      if (version === requestVersion) {
        publish({ isOwner: false, checking: false });
      }
      return { ok: false, reason: "error" };
    }

    await checkSession();
    return snapshot.isOwner
      ? { ok: true }
      : { ok: false, reason: "error" };
  } catch {
    if (version === requestVersion) {
      publish({ isOwner: false, checking: false });
    }
    return { ok: false, reason: "error" };
  }
}

async function logout(): Promise<void> {
  const version = ++requestVersion;
  publish({ isOwner: false, checking: false });

  try {
    await fetch("/api/auth/logout", {
      method: "POST",
      credentials: "include",
    });
  } catch {
    // La interfaz se bloquea localmente aunque el servidor no responda.
  } finally {
    if (version === requestVersion) {
      publish({ isOwner: false, checking: false });
    }
  }
}

export const ownerSession = {
  get isOwner(): boolean {
    return snapshot.isOwner;
  },
  get checking(): boolean {
    return snapshot.checking;
  },
  getSnapshot(): OwnerSessionSnapshot {
    return snapshot;
  },
  subscribe(listener: OwnerSessionListener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
  },
  checkSession,
  login,
  logout,
};
