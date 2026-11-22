import { useState, useEffect, useRef } from "react";
import { UniversoScreen } from "../components/UniversoScreen";
import { hbgCore } from "../core/hbgCore";
import { TerminadorAppsSection } from "./terminador-apps";
import {
  approveTerminadorAuthorization,
  denyTerminadorAuthorization,
  executeTerminadorAuthorization,
  listTerminadorAuthorizations,
  proposeTerminadorAuthorization,
  refreshTerminadorAuthorization,
  requestTerminadorApi,
  revokeTerminadorAuthorization,
  type TerminadorAuthorization,
} from "./terminadorRequest";
import { TerminadorEngine, createDefaultTerminadorProviders } from "./terminadorEngine";
import { createTerminadorPlan, type TerminadorPlan, type TerminadorTask } from "./terminadorPlanner";
import { executeTerminadorPlanWithHBG } from "./terminadorExecution";
import { TerminadorMemory } from "./terminadorMemory";

type ViewMode = "dashboard" | "recursos" | "automatizaciones" | "cronjobs" | "logs" | "salud" | "universo";
type HealthLevel = "unavailable" | "excellent" | "warning" | "critical";
type Priority = "alta" | "media" | "baja";

interface ActionHistory {
  id: string;
  action: string;
  result: "ok" | "warn" | "error";
  time: string;
  details: string;
}

interface AutoTask {
  id: string;
  name: string;
  trigger: string;
  action: string;
  active: boolean;
  priority: Priority;
  lastRun: string;
  runCount: number;
}

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  action: string;
  nextRun: string;
  active: boolean;
  frequency: "diaria" | "semanal" | "mensual";
}

interface Metric {
  label: string;
  value: number;
  max: number;
  unit: string;
  color: string;
  critical: number;
  warning: number;
}

interface LogEntry {
  time: string;
  level: "INFO" | "WARN" | "OK" | "SCAN" | "OPTIM" | "CRON" | "ERR";
  message: string;
}

interface CoreMessage {
  id: string;
  role: "user" | "core";
  text: string;
  phase?: "interpretation" | "plan" | "authorization" | "execution" | "result" | "error";
}

const terminadorEngine = new TerminadorEngine({
  providers: createDefaultTerminadorProviders(),
});

function describeTask(task: TerminadorTask): string {
  if (task.state === "completed") {
    const output = task.output;
    if (typeof output === "object" && output !== null && "message" in output &&
        typeof output.message === "string") return output.message;
    if (task.operation.type === "memory.recall" && Array.isArray(output)) {
      return output.length
        ? (output as Array<{ key: string; value: string }>).map((entry) => `${entry.key}: ${entry.value}`).join(" · ")
        : "No hay recuerdos pertinentes guardados.";
    }
    if (Array.isArray(output)) return `Capacidades HBG Core registradas: ${output.join(", ") || "ninguna"}.`;
    if (typeof output === "object" && output !== null && "track" in output) {
      const current = output as { track?: { title?: string; artist?: string }; playing?: boolean };
      return `Estado real de VIBRA: ${current.track?.title ?? "canción seleccionada"}${current.track?.artist ? ` · ${current.track.artist}` : ""} · ${current.playing ? "reproduciendo" : "en pausa"}.`;
    }
    if (typeof output === "object" && output !== null && "success" in output) {
      return `${task.title}: confirmado por la capacidad conectada de HBG Core.`;
    }
    if (typeof output === "object" && output !== null && "key" in output) {
      return `Memoria local actualizada: ${task.title.toLowerCase()}.`;
    }
    return `${task.title}: completada.`;
  }
  if (task.state === "blocked") return `Bloqueada: ${task.reason ?? task.title}`;
  if (task.state === "failed") return `Falló: ${task.reason ?? task.title}`;
  if (task.state === "cancelled") return `Cancelada: ${task.title}`;
  return `${task.title}: ${task.state}.`;
}

const HISTORY_KEY = "hbg_terminador_history";
const TASKS_KEY = "hbg_terminador_tasks";
const CRONS_KEY = "hbg_terminador_crons";

function loadLocalArray<T>(key: string): T[] {
  if (typeof window === "undefined") return [];
  try {
    const parsed: unknown = JSON.parse(window.localStorage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch {
    return [];
  }
}

function persistLocalArray<T>(key: string, value: T[]): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(key, JSON.stringify(value));
  } catch {
    // Local history/configuration remains usable in memory if storage is unavailable.
  }
}

function loadHistory(): ActionHistory[] {
  return loadLocalArray<ActionHistory>(HISTORY_KEY);
}

const PRIORITY_COLORS: Record<Priority, string> = { alta: "var(--neon-pink)", media: "#ffd740", baja: "var(--neon-green)" };

function getHealth(metrics: Metric[]): HealthLevel {
  if (metrics.length === 0) return "unavailable";
  for (const metric of metrics) {
    if ((metric.value / metric.max) * 100 >= metric.critical) return "critical";
  }
  for (const metric of metrics) {
    if ((metric.value / metric.max) * 100 >= metric.warning) return "warning";
  }
  return "excellent";
}

const HEALTH_CONFIG: Record<HealthLevel, {
  label: string;
  color: string;
  score: number | null;
  desc: string;
}> = {
  unavailable: {
    label: "SIN TELEMETRÍA",
    color: "var(--text-muted)",
    score: null,
    desc: "No hay fuentes de telemetría conectadas; no se inventa una puntuación de salud.",
  },
  excellent: { label: "EXCELENTE", color: "var(--neon-green)", score: null, desc: "Estado calculado a partir de métricas conectadas." },
  warning: { label: "ATENCIÓN", color: "#ffd740", score: null, desc: "Estado calculado a partir de métricas conectadas." },
  critical: { label: "CRÍTICO", color: "var(--neon-pink)", score: null, desc: "Estado calculado a partir de métricas conectadas." },
};

function getMetricColor(m: Metric): string {
  const pct = (m.value / m.max) * 100;
  if (pct >= m.critical) return "var(--neon-pink)";
  if (pct >= m.warning) return "#ffd740";
  return m.color;
}

const levelColor: Record<string, string> = { INFO: "var(--neon-cyan)", WARN: "#ffd740", OK: "var(--neon-green)", SCAN: "var(--neon-purple)", OPTIM: "var(--neon-pink)", CRON: "#ff9100", ERR: "var(--neon-pink)" };

export function TerminadorModule() {
  const [view, setView] = useState<ViewMode>("dashboard");
  const [metrics] = useState<Metric[]>([]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [history, setHistory] = useState<ActionHistory[]>(loadHistory);
  const [tasks, setTasks] = useState<AutoTask[]>(() => loadLocalArray<AutoTask>(TASKS_KEY));
  const [crons, setCrons] = useState<CronJob[]>(() => loadLocalArray<CronJob>(CRONS_KEY));
  const [uptime, setUptime] = useState(0);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskTrigger, setNewTaskTrigger] = useState("");
  const [newTaskAction, setNewTaskAction] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>("media");
  const [cronFilter, setCronFilter] = useState<"todas" | "diaria" | "semanal" | "mensual">("todas");
  const [coreInput, setCoreInput] = useState("");
  const [coreBusy, setCoreBusy] = useState(false);
  const [pendingPlan, setPendingPlan] = useState<TerminadorPlan | null>(null);
  const [serverAuthorizations, setServerAuthorizations] = useState<TerminadorAuthorization[]>([]);
  const [authorizationBusy, setAuthorizationBusy] = useState<string | null>(null);
  const [authorizationNotice, setAuthorizationNotice] = useState("");
  const [memoryStatus, setMemoryStatus] = useState("");
  const [terminadorMemory] = useState(() => new TerminadorMemory());
  const memoryFileRef = useRef<HTMLInputElement>(null);
  const [coreMessages, setCoreMessages] = useState<CoreMessage[]>([
    { id: "welcome", role: "core", text: "Interpretación local sin llamadas externas. Los cambios en apps requieren confirmación y HBG Authority; las acciones de desarrollo permanecen separadas.", phase: "result" },
  ]);
  const logRef = useRef<HTMLDivElement>(null);

  const health = getHealth(metrics);
  const healthCfg = HEALTH_CONFIG[health];

  useEffect(() => {
    const id = setInterval(() => setUptime((u) => u + 1), 1000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    try {
      terminadorMemory.init();
      setMemoryStatus(
        terminadorMemory.persistenceAvailable
          ? `Memoria local lista · ${terminadorMemory.list().length} recuerdos persistentes`
          : "Almacenamiento persistente no disponible; no se guardarán recuerdos persistentes.",
      );
    } catch (error) {
      setMemoryStatus(error instanceof Error ? error.message : "No se pudo cargar la memoria local.");
    }
  }, [terminadorMemory]);

  useEffect(() => {
    let active = true;
    void listTerminadorAuthorizations().then((result) => {
      if (!active) return;
      if (result.ok) {
        setServerAuthorizations(result.data);
      } else if (result.status !== 401 && result.status !== 403) {
        setAuthorizationNotice(
          "No se pudo consultar el estado de las autorizaciones en HBG Authority.",
        );
      }
    });
    return () => {
      active = false;
    };
  }, []);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [logs]);

  useEffect(() => { persistLocalArray(TASKS_KEY, tasks); }, [tasks]);
  useEffect(() => { persistLocalArray(CRONS_KEY, crons); }, [crons]);
  useEffect(() => { persistLocalArray(HISTORY_KEY, history.slice(-50)); }, [history]);

  const addLog = (entry: Omit<LogEntry, "time">) => {
    const time = new Date().toLocaleTimeString("es-ES", { hour12: false });
    setLogs((prev) => [...prev.slice(-99), { ...entry, time }]);
  };

  const addHistory = (action: string, result: ActionHistory["result"], details: string) => {
    const entry: ActionHistory = { id: Date.now().toString(), action, result, time: new Date().toLocaleTimeString("es-ES", { hour12: false }), details };
    setHistory((prev) => [entry, ...prev.slice(0, 49)]);
  };

  const appendCoreMessage = (text: string, phase: CoreMessage["phase"] = "result") => {
    setCoreMessages((prev) => [
      ...prev,
      { id: `${Date.now()}-${Math.random().toString(36).slice(2, 7)}`, role: "core", text, phase },
    ]);
  };

  const executePlan = async (plan: TerminadorPlan) => {
    const result = await executeTerminadorPlanWithHBG(plan, {
      request: requestTerminadorApi,
      memory: terminadorMemory,
    });
    hbgCore.setContext("terminador.lastPlanResult", {
      planId: result.id,
      state: result.state,
      tasks: result.tasks.map(({ id, state, reason }) => ({ id, state, reason })),
      completedAt: new Date().toISOString(),
    });
    result.tasks.forEach((task) => {
      const detail = describeTask(task);
      appendCoreMessage(detail, task.state === "failed" ? "error" : "result");
      addHistory(
        task.title,
        task.state === "completed" ? "ok" : task.state === "failed" ? "error" : "warn",
        detail,
      );
    });
    setPendingPlan(null);
  };

  const proposePlanOperations = async (plan: TerminadorPlan) => {
    const tasks = plan.tasks.filter(
      (task) =>
        task.scope === "authority" &&
        task.requiredPermission === "terminador.manage",
    );
    const applicationsResult =
      await requestTerminadorApi<{ applications: Array<{ id: string; name: string }> }>(
        "/terminador/apps",
      );
    if (!applicationsResult.ok || !Array.isArray(applicationsResult.data.applications)) {
      appendCoreMessage(
        applicationsResult.ok
          ? "No se pudo determinar de forma segura la aplicación afectada."
          : applicationsResult.error ?? "HBG Authority no está disponible.",
        "error",
      );
      return;
    }

    for (const task of tasks) {
      if (task.operation.type !== "apps.set_status") {
        appendCoreMessage(
          "Esta operación todavía no tiene un tipo de propuesta soportado por HBG Authority.",
          "error",
        );
        continue;
      }
      const target = task.operation.target.trim().toLocaleLowerCase();
      const matches = applicationsResult.data.applications.filter(
        (application) =>
          application.id.toLocaleLowerCase() === target ||
          application.name.trim().toLocaleLowerCase() === target,
      );
      if (matches.length !== 1) {
        appendCoreMessage(
          matches.length
            ? `La aplicación "${task.operation.target}" no es inequívoca; no se creó propuesta.`
            : `No se encontró la aplicación exacta "${task.operation.target}"; no se creó propuesta.`,
          "error",
        );
        continue;
      }
      const result = await proposeTerminadorAuthorization(
        matches[0].id,
        task.operation.status,
        plan.interpretation.explanation,
      );
      if (!result.ok) {
        appendCoreMessage(
          result.error ?? `HBG Authority rechazó la propuesta (${result.code ?? result.status}).`,
          "error",
        );
        continue;
      }
      setServerAuthorizations((previous) => [
        ...previous.filter((authorization) => authorization.id !== result.data.id),
        result.data,
      ]);
      appendCoreMessage(
        `HBG Authority registró la propuesta ${result.data.id} como ${result.data.state}. No se ejecutó ningún cambio.`,
        "authorization",
      );
    }
  };

  const updateAuthorizationFromServer = async (
    authorization: TerminadorAuthorization,
    action: "approve" | "deny" | "revoke" | "refresh" | "execute",
  ) => {
    if (authorizationBusy) return;
    setAuthorizationBusy(authorization.id);
    setAuthorizationNotice("");
    try {
      const result = action === "approve"
        ? await approveTerminadorAuthorization(authorization.id)
        : action === "deny"
          ? await denyTerminadorAuthorization(authorization.id)
        : action === "revoke"
          ? await revokeTerminadorAuthorization(authorization.id)
          : action === "execute"
            ? await executeTerminadorAuthorization(authorization.id)
            : await refreshTerminadorAuthorization(authorization.id);
      if (!result.ok) {
        setAuthorizationNotice(
          `No se confirmó la acción en el servidor (${result.code ?? result.status}).`,
        );
        return;
      }
      setServerAuthorizations((previous) =>
        previous.map((entry) => entry.id === result.data.id ? result.data : entry),
      );
      if (result.data.state === "consumed") {
        const requestedStatus = result.data.parameters.requestedStatus;
        appendCoreMessage(
          `HBG Authority ejecutó el cambio del registro de ${result.data.applicationId} a ${String(requestedStatus)}. Esto no detiene el proceso ni el deployment de la aplicación.`,
          "result",
        );
        setPendingPlan(null);
      } else if (result.data.state === "approved") {
        appendCoreMessage(
          "Aprobación confirmada por HBG Authority. El cambio todavía no se ejecuta; requiere la acción explícita «EJECUTAR CAMBIO DE REGISTRO».",
          "authorization",
        );
      } else {
        appendCoreMessage(
          `Estado confirmado por HBG Authority: ${result.data.state}.`,
          "authorization",
        );
      }
    } finally {
      setAuthorizationBusy(null);
    }
  };

  const executeCoreCommand = async () => {
    const command = coreInput.trim();
    if (!command || coreBusy) return;
    setCoreInput("");
    setCoreMessages((prev) => [...prev, { id: `${Date.now()}-u`, role: "user", text: command }]);
    setCoreBusy(true);
    try {
      const interpretation = await terminadorEngine.interpret(command);
      hbgCore.setContext("terminador.lastRequest", {
        text: command,
        interpretation,
        module: hbgCore.getModule(),
        receivedAt: new Date().toISOString(),
      });
      appendCoreMessage(
        `Interpretación (${interpretation.providerId}, confianza ${Math.round(interpretation.confidence * 100)}%): ${interpretation.explanation}`,
        "interpretation",
      );
      if (interpretation.requiresClarification) {
        appendCoreMessage(interpretation.clarification ?? "Necesito más información antes de continuar.", "error");
        setPendingPlan(null);
        return;
      }

      const plan = createTerminadorPlan(interpretation);
      hbgCore.setContext("terminador.currentPlan", plan);
      appendCoreMessage(
        plan.tasks.length
          ? `Plan: ${plan.tasks.map((task, index) => `${index + 1}. ${task.title}${task.dependsOn.length ? ` (depende de ${task.dependsOn.join(", ")})` : ""}`).join(" → ")}`
          : "Plan vacío; no hay ninguna operación ejecutable.",
        "plan",
      );

      const needsAuthorization = plan.tasks.some(
        (task) => task.scope === "authority" && task.requiredPermission === "terminador.manage",
      );
      if (needsAuthorization) {
        setPendingPlan(plan);
        await proposePlanOperations(plan);
        return;
      }

      await executePlan(plan);
    } catch (error) {
      const message = error instanceof Error ? error.message : "Terminador no pudo procesar la solicitud.";
      appendCoreMessage(message, "error");
      addHistory("terminador.request", "error", message);
    } finally {
      setCoreBusy(false);
    }
  };

  const cancelPendingPlan = async () => {
    if (!pendingPlan) return;
    const openAuthorizations = serverAuthorizations.filter(
      (authorization) =>
        authorization.state === "pending" || authorization.state === "approved",
    );
    for (const authorization of openAuthorizations) {
      const result = await revokeTerminadorAuthorization(authorization.id);
      if (!result.ok) {
        setAuthorizationNotice(
          `No se pudo confirmar la revocación de ${authorization.id}; el estado permanece sin confirmar.`,
        );
        return;
      }
      setServerAuthorizations((previous) =>
        previous.map((entry) => entry.id === result.data.id ? result.data : entry),
      );
    }
    setPendingPlan(null);
    appendCoreMessage(
      openAuthorizations.length
        ? "Propuesta revocada por HBG Authority; no se ejecutó la operación."
        : "Plan descartado; no se ejecutó la operación.",
      "result",
    );
  };

  const exportMemory = () => {
    try {
      const blob = new Blob([terminadorMemory.exportBackup()], { type: "application/json" });
      const url = URL.createObjectURL(blob);
      const link = document.createElement("a");
      link.href = url;
      link.download = `terminador-memory-${new Date().toISOString().slice(0, 10)}.json`;
      link.click();
      URL.revokeObjectURL(url);
      setMemoryStatus(`Respaldo exportado · ${terminadorMemory.list().length} recuerdos`);
    } catch (error) {
      setMemoryStatus(error instanceof Error ? error.message : "No se pudo exportar la memoria.");
    }
  };

  const importMemory = async (file?: File) => {
    if (!file) return;
    try {
      terminadorMemory.importBackup(await file.text());
      setMemoryStatus(`Respaldo importado · ${terminadorMemory.list().length} recuerdos`);
    } catch (error) {
      setMemoryStatus(error instanceof Error ? error.message : "No se pudo importar el respaldo.");
    } finally {
      if (memoryFileRef.current) memoryFileRef.current.value = "";
    }
  };

  const exportLogs = () => {
    const data = {
      format: "terminador-session-logs-v1",
      exportedAt: new Date().toISOString(),
      logs,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `terminador-logs-${new Date().toISOString().slice(0, 10)}.json`;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const formatUptime = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const filteredCrons = crons.filter((c) => cronFilter === "todas" || c.frequency === cronFilter);

  const NAV_ITEMS: { id: ViewMode; label: string }[] = [
    { id: "dashboard", label: "DASHBOARD" }, { id: "recursos", label: "RECURSOS" },
    { id: "automatizaciones", label: "BORRADORES" }, { id: "cronjobs", label: "CRON BORRADORES" },
    { id: "logs", label: "LOGS" }, { id: "salud", label: "SALUD" }, { id: "universo", label: "UNIVERSO HBG" },
  ];

  return (
    <div>
      <div className="mod-header" style={{ "--mod-color": "var(--neon-green)" } as React.CSSProperties}>
        <span className="mod-icon" style={{ color: "var(--neon-green)", filter: "drop-shadow(0 0 12px var(--neon-green))" }}>⬢</span>
        <div className="mod-title-group">
          <div className="mod-title">TERMINADOR IA</div>
          <div className="mod-subtitle">// administrador autónomo del ecosistema</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 5 }}>
          <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 8, padding: "6px 8px" }} disabled title="No hay un servicio de escaneo conectado">◎ SCAN · NO DISPONIBLE</button>
          <button className="hbg-btn hbg-btn-success" style={{ fontSize: 8, padding: "6px 8px" }} disabled title="No hay un servicio de optimización conectado">⚙ OPTIM · NO DISPONIBLE</button>
          <span className="hbg-badge" style={{ background: `${healthCfg.color}15`, borderColor: `${healthCfg.color}40`, color: healthCfg.color }}>
            {healthCfg.label}
          </span>
        </div>
      </div>

      {/* Sub-nav */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20, background: "var(--bg-deep)", padding: 4, borderRadius: 4, border: "1px solid var(--border-dim)" }}>
        {NAV_ITEMS.map((n) => (
          <button key={n.id} onClick={() => setView(n.id)}
            style={{ flex: 1, padding: "7px 4px", fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.06em", background: view === n.id ? "rgba(105,255,71,0.12)" : "transparent", border: `1px solid ${view === n.id ? "var(--neon-green)" : "transparent"}`, borderRadius: 3, color: view === n.id ? "var(--neon-green)" : "var(--text-muted)", cursor: "pointer", transition: "all 0.15s" }}>
            {n.label}
          </button>
        ))}
      </div>

      {/* DASHBOARD */}
      {view === "dashboard" && (
        <div>
          <div className="hbg-card" style={{ marginBottom: 12, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
            No hay telemetría de CPU, memoria o disco conectada. Las acciones de mantenimiento no están disponibles y no se ejecutan.
          </div>
          <div className="hbg-card hbg-card-accent" style={{ "--card-color": healthCfg.color, marginBottom: 16, padding: "16px 20px" } as React.CSSProperties}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="card-label">ESTADO DEL ECOSISTEMA</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: healthCfg.color, textShadow: `0 0 16px ${healthCfg.color}` }}>{healthCfg.label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>{healthCfg.desc}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="card-label">HEALTH SCORE</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 24, fontWeight: 900, color: healthCfg.color }}>
                  {healthCfg.score === null ? "—" : healthCfg.score}
                  {healthCfg.score !== null && <span style={{ fontSize: 14 }}>/100</span>}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>SESIÓN: {formatUptime(uptime)}</div>
              </div>
            </div>
          </div>

          {metrics.length > 0 ? (
            <div className="hbg-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
              {metrics.slice(0, 3).map((m) => {
              const color = getMetricColor(m);
              const pct = Math.min((m.value / m.max) * 100, 100);
              return (
                <div key={m.label} className="hbg-card hbg-card-accent" style={{ "--card-color": color } as React.CSSProperties}>
                  <div className="card-label">{m.label}</div>
                  <div className="card-value" style={{ color, textShadow: `0 0 12px ${color}`, fontSize: 20 }}>
                    {m.label === "RAM" ? m.value.toFixed(1) : Math.round(m.value)}<span style={{ fontSize: 10, opacity: 0.7, marginLeft: 2 }}>{m.unit}</span>
                  </div>
                  <div className="hbg-progress"><div className="hbg-progress-bar" style={{ "--bar-color": color, width: `${pct}%` } as React.CSSProperties} /></div>
                </div>
              );
              })}
            </div>
          ) : (
            <div className="hbg-card" style={{ marginBottom: 16, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
              // Sin métricas disponibles. No se muestran valores simulados.
            </div>
          )}

          {/* HBG CORE command bridge */}
          <div className="hbg-card hbg-card-accent" style={{ "--card-color": "var(--neon-green)", marginBottom: 16 } as React.CSSProperties}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
              <div>
                <div className="card-label">TERMINADOR IA · HBG CORE</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 13, color: "var(--neon-green)", letterSpacing: "0.08em" }}>INTERPRETACIÓN Y CAPACIDADES CONECTADAS</div>
              </div>
              <span className="hbg-badge" style={{ color: "var(--neon-cyan)", borderColor: "rgba(0,229,255,0.35)" }}>
                {hbgCore.getRegisteredActions().length} CAPACIDADES
              </span>
            </div>
            <div style={{ background: "var(--bg-deep)", border: "1px solid var(--border-dim)", borderRadius: 3, padding: "8px 10px", minHeight: 74, maxHeight: 138, overflowY: "auto", marginBottom: 8 }}>
              {coreMessages.map((message) => (
                <div key={message.id} style={{ display: "flex", gap: 8, marginBottom: 5, fontFamily: "var(--font-mono)", fontSize: 10, lineHeight: 1.45 }}>
                  <span style={{ color: message.role === "user" ? "var(--neon-cyan)" : message.phase === "error" ? "var(--neon-pink)" : message.phase === "authorization" ? "#ffd740" : "var(--neon-green)", flexShrink: 0 }}>
                    {message.role === "user" ? ">" : `CORE${message.phase ? ` · ${message.phase.toUpperCase()}` : ""}:`}
                  </span>
                  <span style={{ color: message.role === "user" ? "var(--text-primary)" : "var(--text-secondary)" }}>{message.text}</span>
                </div>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input
                className="hbg-input"
                value={coreInput}
                onChange={(e) => setCoreInput(e.target.value)}
                onKeyDown={(e) => { if (e.key === "Enter") void executeCoreCommand(); }}
                placeholder='Ej: "lista las apps" · "apaga la app Demo" · "pausa"'
                aria-label="Solicitud para Terminador IA"
                disabled={coreBusy}
              />
              <button className="hbg-btn hbg-btn-success" onClick={() => void executeCoreCommand()} disabled={coreBusy || !coreInput.trim()}>
                {coreBusy ? "◎" : "EJECUTAR"}
              </button>
            </div>
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginTop: 8 }}>
              {["PON PLAY", "PAUSA", "SIGUIENTE", "VOLUMEN 50%"].map((quick) => (
                <button key={quick} className="hbg-badge" style={{ cursor: "pointer", color: "var(--text-muted)" }} onClick={() => { setCoreInput(quick); }}>
                  {quick}
                </button>
              ))}
            </div>
            {pendingPlan && (
              <div role="group" aria-label="Confirmación de plan de Terminador" style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 10, padding: 9, border: "1px solid rgba(255,215,64,0.4)", borderRadius: 3 }}>
                <span style={{ flex: 1, minWidth: 200, fontFamily: "var(--font-mono)", fontSize: 10, color: "#ffd740" }}>
                  PROPUESTA BLOQUEADA · {pendingPlan.tasks.map((task) => task.title).join(" · ")}
                  {" · "}
                  {pendingPlan.tasks.find((task) => task.state === "blocked")?.reason}
                </span>
                <button className="hbg-btn hbg-btn-ghost" disabled={coreBusy} onClick={cancelPendingPlan}>
                  REVOCAR / DESCARTAR
                </button>
              </div>
            )}
            {serverAuthorizations.length > 0 && (
              <div aria-label="Autorizaciones confirmadas por HBG Authority" style={{ display: "grid", gap: 8, marginTop: 10 }}>
                {serverAuthorizations.map((authorization) => {
                  const requestedStatus = authorization.parameters.requestedStatus;
                  const currentStatus = authorization.parameters.currentStatus;
                  return (
                    <section key={authorization.id} style={{ padding: 10, border: "1px solid rgba(255,215,64,0.4)", borderRadius: 3, background: "var(--bg-deep)" }}>
                      <div style={{ fontFamily: "var(--font-display)", fontSize: 10, color: "#ffd740", marginBottom: 6 }}>
                        HBG AUTHORITY · {authorization.state.toUpperCase()} · {authorization.operation}
                      </div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, lineHeight: 1.6, color: "var(--text-secondary)" }}>
                        <div>Recurso: {authorization.resource} · aplicación: {authorization.applicationId}</div>
                        <div>Cambio de registro propuesto: {String(currentStatus)} → {String(requestedStatus)}</div>
                        <div>Ámbito: {authorization.workspace} · permisos: {authorization.requestedPermissions.join(", ")}</div>
                        <div>Motivo: {authorization.reason}</div>
                        <div>Alcance: solo cambia el estado del registro; no detiene procesos ni deployments.</div>
                        <div>Hash de propuesta: {authorization.proposalHash}</div>
                        <div>Expira: {new Date(authorization.expiresAt).toLocaleString("es-ES")}</div>
                      </div>
                      <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap" }}>
                        {authorization.state === "pending" && (
                          <>
                            <button
                              className="hbg-btn hbg-btn-success"
                              disabled={authorizationBusy !== null}
                              onClick={() => void updateAuthorizationFromServer(authorization, "approve")}
                            >
                              {authorizationBusy === authorization.id ? "CONFIRMANDO…" : "APROBAR ESTA OPERACIÓN"}
                            </button>
                            <button
                              className="hbg-btn hbg-btn-ghost"
                              disabled={authorizationBusy !== null}
                              onClick={() => void updateAuthorizationFromServer(authorization, "deny")}
                            >
                              DENEGAR
                            </button>
                          </>
                        )}
                        {authorization.state === "approved" && (
                          <button
                            className="hbg-btn hbg-btn-success"
                            disabled={authorizationBusy !== null}
                            onClick={() => void updateAuthorizationFromServer(authorization, "execute")}
                          >
                            {authorizationBusy === authorization.id ? "EJECUTANDO…" : "EJECUTAR CAMBIO DE REGISTRO"}
                          </button>
                        )}
                        {(authorization.state === "pending" || authorization.state === "approved") && (
                          <button
                            className="hbg-btn hbg-btn-ghost"
                            disabled={authorizationBusy !== null}
                            onClick={() => void updateAuthorizationFromServer(authorization, "revoke")}
                          >
                            REVOCAR
                          </button>
                        )}
                        <button
                          className="hbg-btn hbg-btn-ghost"
                          disabled={authorizationBusy !== null}
                          onClick={() => void updateAuthorizationFromServer(authorization, "refresh")}
                        >
                          ACTUALIZAR ESTADO
                        </button>
                      </div>
                      {authorization.state === "approved" && (
                        <div role="status" style={{ marginTop: 7, color: "#ffd740", fontSize: 9 }}>
                          Aprobación server-side confirmada. El cambio del registro aún no se ejecuta. La ejecución no detiene procesos ni deployments; Code Tools siguen sujetos a sus guards y concesiones independientes.
                        </div>
                      )}
                    </section>
                  );
                })}
              </div>
            )}
            {authorizationNotice && (
              <div role="status" style={{ marginTop: 8, color: "var(--neon-pink)", fontSize: 9 }}>
                {authorizationNotice}
              </div>
            )}
            <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap", marginTop: 9 }}>
              <span style={{ flex: 1, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }} role="status">
                {memoryStatus}
              </span>
              <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 8, padding: "5px 7px" }} onClick={exportMemory}>
                RESPALDAR MEMORIA
              </button>
              <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 8, padding: "5px 7px" }} onClick={() => memoryFileRef.current?.click()}>
                IMPORTAR / MIGRAR
              </button>
              <input
                ref={memoryFileRef}
                type="file"
                accept="application/json,.json"
                aria-label="Importar respaldo de memoria"
                style={{ display: "none" }}
                onChange={(event) => void importMemory(event.target.files?.[0])}
              />
            </div>
          </div>

          {/* Action buttons */}
          <div className="section-title">// acciones rápidas</div>
          <div className="hbg-grid hbg-grid-2" style={{ gap: 8, marginBottom: 16 }}>
            {[
              { label: "REPARAR TODO · NO DISPONIBLE", color: "var(--neon-cyan)", icon: "⚙" },
              { label: "RESPALDO TOTAL · NO DISPONIBLE", color: "var(--neon-green)", icon: "↓" },
              { label: "LIMPIEZA PROFUNDA · NO DISPONIBLE", color: "#ff9100", icon: "◎" },
              { label: "REINICIAR SERVICIOS · NO DISPONIBLE", color: "var(--neon-purple)", icon: "↻" },
            ].map((btn) => (
              <button key={btn.label} className="hbg-card" disabled title="Servicio de mantenimiento no conectado" style={{ cursor: "not-allowed", opacity: 0.55, textAlign: "left", padding: "12px 16px", border: `1px solid ${btn.color}25`, display: "flex", alignItems: "center", gap: 10 }}>
                <span style={{ fontSize: 20, color: btn.color, filter: `drop-shadow(0 0 6px ${btn.color})` }}>{btn.icon}</span>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: btn.color }}>{btn.label}</span>
              </button>
            ))}
          </div>

          {/* History */}
          <div className="section-title">// historial local (no es auditoría del servidor)</div>
          {history.length === 0 ? (
            <div className="hbg-card" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>// sin historial — ejecuta una operación para comenzar</div>
          ) : (
            <div className="hbg-list" style={{ gap: 4 }}>
              {history.slice(0, 6).map((h) => (
                <div key={h.id} className="hbg-list-item" style={{ padding: "8px 12px" }}>
                  <div className="hbg-list-dot" style={{ color: h.result === "ok" ? "var(--neon-green)" : h.result === "warn" ? "#ffd740" : "var(--neon-pink)", background: h.result === "ok" ? "var(--neon-green)" : h.result === "warn" ? "#ffd740" : "var(--neon-pink)" }} />
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--text-primary)" }}>{h.action}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{h.details}</div>
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>{h.time}</span>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* RECURSOS */}
      {view === "recursos" && (
        <div>
          <TerminadorAppsSection />
        </div>
      )}

      {/* AUTOMATIZACIONES */}
      {view === "automatizaciones" && (
        <div>
          <div className="hbg-card" style={{ marginBottom: 12, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
            Borradores locales de automatización. No existe un scheduler conectado: marcar una tarea no la programa ni la ejecuta.
          </div>
          <div className="hbg-grid hbg-grid-2" style={{ gap: 12 }}>
            <div>
              <div className="section-title">// borradores de automatización</div>
              <div className="hbg-list" style={{ gap: 8, marginBottom: 12 }}>
                {tasks.map((task) => (
                  <div key={task.id} className="hbg-card" style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: task.active ? "var(--neon-green)" : "var(--text-muted)" }}>{task.name}</span>
                        <span className="hbg-badge" style={{ background: `${PRIORITY_COLORS[task.priority]}12`, borderColor: `${PRIORITY_COLORS[task.priority]}40`, color: PRIORITY_COLORS[task.priority], fontSize: 8 }}>{task.priority.toUpperCase()}</span>
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className={`hbg-btn ${task.active ? "hbg-btn-success" : "hbg-btn-ghost"}`} style={{ padding: "3px 8px", fontSize: 8 }} onClick={() => setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, active: !t.active } : t))}>{task.active ? "BORRADOR" : "ARCHIVADO"}</button>
                        <button className="hbg-btn hbg-btn-danger" style={{ padding: "3px 8px", fontSize: 8 }} onClick={() => setTasks((prev) => prev.filter((t) => t.id !== task.id))}>✕</button>
                      </div>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", lineHeight: 1.8 }}>
                      <div>⚡ {task.trigger}</div>
                      <div>▶ {task.action}</div>
                      <div style={{ color: "var(--neon-cyan)" }}>Ejecución real: no conectada · solo configuración local</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="hbg-card">
              <div className="section-title">// nuevo borrador</div>
              <input className="hbg-input" placeholder="Nombre de la tarea..." value={newTaskName} onChange={(e) => setNewTaskName(e.target.value)} style={{ marginBottom: 6 }} />
              <input className="hbg-input" placeholder="Disparador (ej: Todos los días 23:00)..." value={newTaskTrigger} onChange={(e) => setNewTaskTrigger(e.target.value)} style={{ marginBottom: 6 }} />
              <input className="hbg-input" placeholder="Acción prevista (no se ejecuta)..." value={newTaskAction} onChange={(e) => setNewTaskAction(e.target.value)} style={{ marginBottom: 8 }} />
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                {(["alta", "media", "baja"] as Priority[]).map((p) => (
                  <button key={p} className="hbg-badge" style={{ cursor: "pointer", background: newTaskPriority === p ? `${PRIORITY_COLORS[p]}18` : undefined, borderColor: newTaskPriority === p ? PRIORITY_COLORS[p] : "var(--border-dim)", color: newTaskPriority === p ? PRIORITY_COLORS[p] : "var(--text-muted)" }} onClick={() => setNewTaskPriority(p)}>{p.toUpperCase()}</button>
                ))}
              </div>
              <button className="hbg-btn hbg-btn-primary w-full" disabled={!newTaskName.trim()} onClick={() => { setTasks((prev) => [...prev, { id: Date.now().toString(), name: newTaskName, trigger: newTaskTrigger || "Manual", action: newTaskAction || "Ejecutar acción", active: false, priority: newTaskPriority, lastRun: "Nunca", runCount: 0 }]); setNewTaskName(""); setNewTaskTrigger(""); setNewTaskAction(""); }}>
                + GUARDAR BORRADOR
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CRON JOBS */}
      {view === "cronjobs" && (
        <div>
          <div className="hbg-card" style={{ marginBottom: 12, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
            No hay servicio cron conectado. Las entradas guardadas aquí no se ejecutan ni generan próximas ejecuciones.
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {(["todas", "diaria", "semanal", "mensual"] as const).map((f) => (
              <button key={f} className="hbg-badge" style={{ cursor: "pointer", background: cronFilter === f ? "rgba(105,255,71,0.12)" : undefined, borderColor: cronFilter === f ? "var(--neon-green)" : "var(--border-dim)", color: cronFilter === f ? "var(--neon-green)" : "var(--text-muted)" }} onClick={() => setCronFilter(f)}>
                {f.toUpperCase()}
              </button>
            ))}
          </div>
          <div className="hbg-list" style={{ gap: 8 }}>
            {filteredCrons.map((cron) => (
              <div key={cron.id} className="hbg-card" style={{ padding: "12px 14px", borderColor: cron.active ? "rgba(0,229,255,0.15)" : undefined }}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: cron.active ? "var(--neon-cyan)" : "var(--text-muted)" }}>{cron.name}</span>
                    <span className="hbg-badge" style={{ fontSize: 8, color: "var(--text-muted)" }}>{cron.frequency.toUpperCase()}</span>
                  </div>
                  <button className={`hbg-btn ${cron.active ? "hbg-btn-primary" : "hbg-btn-ghost"}`} style={{ padding: "3px 8px", fontSize: 8 }} onClick={() => setCrons((prev) => prev.map((c) => c.id === cron.id ? { ...c, active: !c.active } : c))}>
                    {cron.active ? "BORRADOR" : "ARCHIVADO"}
                  </button>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", lineHeight: 1.9 }}>
                  <div style={{ color: "var(--text-secondary)" }}>schedule: <span style={{ color: "var(--neon-cyan)" }}>{cron.schedule}</span></div>
                  <div>action: {cron.action}</div>
                  <div style={{ color: "var(--neon-green)" }}>Ejecución real: no conectada</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LOGS */}
      {view === "logs" && (
        <div>
          <div className="hbg-card" style={{ marginBottom: 12, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
            Estos logs son locales a esta sesión; las operaciones no disponibles se detienen sin ejecutarse.
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>// terminal de operaciones</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 9, padding: "5px 10px" }} onClick={() => setLogs([])}>LIMPIAR</button>
              <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 9, padding: "5px 10px" }} onClick={exportLogs} disabled={logs.length === 0}>↓ EXPORTAR LOGS</button>
            </div>
          </div>
          <div ref={logRef} className="hbg-card" style={{ background: "var(--bg-deep)", height: 300, overflowY: "auto", fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.9, borderColor: "var(--border-dim)" }}>
            {logs.length === 0 ? <span style={{ color: "var(--text-muted)" }}>// ejecuta una operación desde el DASHBOARD para ver logs</span> : logs.map((l, i) => (
              <div key={i} style={{ display: "flex", gap: 10 }}>
                <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>[{l.time}]</span>
                <span style={{ color: levelColor[l.level] ?? "var(--text-secondary)", flexShrink: 0, minWidth: 48 }}>{l.level}</span>
                <span style={{ color: "var(--text-primary)" }}>{l.message}</span>
              </div>
            ))}
          </div>
          <div className="hbg-grid-3 hbg-grid" style={{ gap: 8, marginTop: 10 }}>
            {[
              { label: "ERRORES", count: logs.filter((l) => l.level === "ERR").length, color: "var(--neon-pink)" },
              { label: "ADVERTENCIAS", count: logs.filter((l) => l.level === "WARN").length, color: "#ffd740" },
              { label: "OPERACIONES OK", count: logs.filter((l) => l.level === "OK").length, color: "var(--neon-green)" },
            ].map((s) => (
              <div key={s.label} className="hbg-card" style={{ padding: "12px 14px" }}>
                <div className="card-label">{s.label}</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: s.color, textShadow: `0 0 10px ${s.color}` }}>{s.count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* SALUD */}
      {view === "salud" && (
        <div>
          <div className="hbg-card" style={{ marginBottom: 12, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
            No hay conectores de salud activos. Los estados no verificados se muestran como no disponibles.
          </div>
          <div className="hbg-card hbg-card-accent" style={{ "--card-color": healthCfg.color, marginBottom: 16, padding: "20px 24px" } as React.CSSProperties}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div className="card-label">SALUD GLOBAL DEL ECOSISTEMA</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 900, color: healthCfg.color, textShadow: `0 0 20px ${healthCfg.color}`, letterSpacing: "0.1em" }}>{healthCfg.label}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 48, fontWeight: 900, color: healthCfg.color, textShadow: `0 0 24px ${healthCfg.color}`, lineHeight: 1 }}>{healthCfg.score ?? "—"}</div>
                {healthCfg.score !== null && <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>/ 100</div>}
              </div>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>{healthCfg.desc}</div>
          </div>

          <div className="section-title">// indicadores por módulo</div>
          <div className="hbg-list" style={{ gap: 8, marginBottom: 16 }}>
            {[
              { name: "HBG CORE", status: "unavailable" as HealthLevel, detail: "Sin comprobación de salud publicada." },
              { name: "VIBRA PRO", status: "unavailable" as HealthLevel, detail: "Sin telemetría de reproducción publicada." },
              { name: "INSTINTO", status: "unavailable" as HealthLevel, detail: "Datos locales no compartidos con el panel de salud." },
              { name: "TERMINADOR IA", status: health, detail: "Scheduler y telemetría del host no conectados." },
              { name: "SHARE ENGINE", status: "unavailable" as HealthLevel, detail: "Sin telemetría del bus de mensajes." },
            ].map((mod) => {
              const cfg = HEALTH_CONFIG[mod.status];
              return (
                <div key={mod.name} className="hbg-list-item">
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: cfg.color }}>{cfg.label.split(" ")[0]}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: "var(--text-primary)" }}>{mod.name}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{mod.detail}</div>
                  </div>
                  <span className="hbg-badge" style={{ background: `${cfg.color}12`, borderColor: `${cfg.color}40`, color: cfg.color }}>{cfg.label}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* UNIVERSO HBG */}
      {view === "universo" && (
        <UniversoScreen currentApp="terminador" appColor="var(--neon-green)" />
      )}
    </div>
  );
}
