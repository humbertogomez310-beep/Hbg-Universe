import { useCallback, useEffect, useState } from "react";

interface ManagedApp {
  id: string;
  name: string;
  version: string;
  status: string;
  capabilities: string[];
  updatedAt: string;
  protected: boolean;
}

interface AuditEvent {
  id: string;
  action: string;
  resource: string;
  result: string;
  errorCode: string | null;
  createdAt: string;
}

type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; code?: string };

async function api<T>(path: string, init?: RequestInit): Promise<ApiResult<T>> {
  try {
    const response = await fetch(`/api${path}`, {
      credentials: "include",
      headers: { "Content-Type": "application/json" },
      ...init,
    });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    if (!response.ok) {
      return { ok: false, status: response.status, code: typeof body.code === "string" ? body.code : undefined };
    }
    return { ok: true, data: body as T };
  } catch {
    return { ok: false, status: 0 };
  }
}

function describeError(status: number, code?: string): string {
  if (status === 401 || status === 403) return "Sesión vencida o sin permiso. Vuelve a entrar.";
  if (code === "APP_PROTECTED") return "Esa app está protegida y no se puede apagar.";
  if (status === 404) return "La app ya no existe en el registro.";
  if (status === 0) return "Sin conexión con el servidor.";
  return "No se pudo completar la acción.";
}

function formatTime(value: string): string {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? "" : date.toLocaleString("es-ES", { hour12: false });
}

export function TerminadorApps() {
  const [apps, setApps] = useState<ManagedApp[]>([]);
  const [events, setEvents] = useState<AuditEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [confirmId, setConfirmId] = useState<string | null>(null);
  const [message, setMessage] = useState("");

  const refresh = useCallback(async () => {
    const [appsResult, auditResult] = await Promise.all([
      api<{ applications: ManagedApp[] }>("/terminador/apps"),
      api<{ events: AuditEvent[] }>("/audit?limit=15"),
    ]);
    if (appsResult.ok) {
      setApps(appsResult.data.applications);
      setMessage("");
    } else {
      setMessage(describeError(appsResult.status, appsResult.code));
    }
    if (auditResult.ok) setEvents(auditResult.data.events);
    setLoading(false);
  }, []);

  useEffect(() => {
    void refresh();
  }, [refresh]);

  const changeStatus = async (app: ManagedApp, status: "active" | "disabled") => {
    if (busyId) return;
    setBusyId(app.id);
    setConfirmId(null);
    const result = await api<{ changed: boolean }>(
      `/terminador/apps/${encodeURIComponent(app.id)}/status`,
      { method: "POST", body: JSON.stringify({ status }) },
    );
    setBusyId(null);
    if (!result.ok) {
      setMessage(describeError(result.status, result.code));
      return;
    }
    await refresh();
    setMessage(status === "disabled" ? `${app.name} apagada.` : `${app.name} encendida.`);
  };

  return (
    <div>
      <div className="section-title">// apps del ecosistema (datos reales)</div>
      {message && (
        <div className="hbg-card" role="status" style={{ marginBottom: 10, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--neon-cyan)" }}>
          {message}
        </div>
      )}
      {loading ? (
        <div className="hbg-card" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>Cargando…</div>
      ) : apps.length === 0 ? (
        <div className="hbg-card" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>No hay apps registradas.</div>
      ) : (
        <div className="hbg-list" style={{ gap: 8, marginBottom: 16 }}>
          {apps.map((app) => {
            const active = app.status === "active";
            return (
              <div key={app.id} className="hbg-card" style={{ padding: "12px 14px" }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                  <div>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: active ? "var(--neon-green)" : "var(--text-muted)" }}>
                      {app.name} <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>v{app.version}</span>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                      estado: {active ? "ACTIVA" : "APAGADA"} · {formatTime(app.updatedAt)}
                    </div>
                  </div>
                  {app.protected ? (
                    <span className="hbg-badge hbg-badge-purple">PROTEGIDA</span>
                  ) : active ? (
                    confirmId === app.id ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="hbg-btn hbg-btn-danger" style={{ padding: "4px 8px", fontSize: 9 }} disabled={busyId !== null} onClick={() => void changeStatus(app, "disabled")}>
                          CONFIRMAR
                        </button>
                        <button className="hbg-btn hbg-btn-ghost" style={{ padding: "4px 8px", fontSize: 9 }} onClick={() => setConfirmId(null)}>
                          NO
                        </button>
                      </div>
                    ) : (
                      <button className="hbg-btn hbg-btn-danger" style={{ padding: "4px 10px", fontSize: 9 }} disabled={busyId !== null} onClick={() => setConfirmId(app.id)}>
                        APAGAR
                      </button>
                    )
                  ) : (
                    <button className="hbg-btn hbg-btn-success" style={{ padding: "4px 10px", fontSize: 9 }} disabled={busyId !== null} onClick={() => void changeStatus(app, "active")}>
                      ENCENDER
                    </button>
                  )}
                </div>
              </div>
            );
          })}
        </div>
      )}

      <div className="section-title">// historial real (auditoría del servidor)</div>
      {events.length === 0 ? (
        <div className="hbg-card" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>Sin eventos todavía.</div>
      ) : (
        <div className="hbg-list" style={{ gap: 4 }}>
          {events.map((event) => (
            <div key={event.id} className="hbg-list-item" style={{ padding: "8px 12px" }}>
              <div style={{ flex: 1 }}>
                <div style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--text-primary)" }}>
                  {event.action} · {event.resource}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                  {event.result}
                  {event.errorCode ? ` · ${event.errorCode}` : ""} · {formatTime(event.createdAt)}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}

// Sección plegable que se muestra encima del panel de Terminador (solo con sesión de dueño).
export function TerminadorAppsSection() {
  const [open, setOpen] = useState(true);
  return (
    <div style={{ marginBottom: 16 }}>
      <button
        className="hbg-btn hbg-btn-ghost"
        style={{ width: "100%", textAlign: "left" }}
        aria-expanded={open}
        onClick={() => setOpen((current) => !current)}
      >
        {open ? "▾" : "▸"} APPS DEL ECOSISTEMA (REAL)
      </button>
      {open && (
        <div style={{ marginTop: 10 }}>
          <TerminadorApps />
        </div>
      )}
    </div>
  );
}