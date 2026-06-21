import { useState, useEffect, useRef } from "react";
import { UniversoScreen } from "../components/UniversoScreen";

type ViewMode = "dashboard" | "recursos" | "automatizaciones" | "cronjobs" | "logs" | "salud" | "universo";
type HealthLevel = "excellent" | "warning" | "critical";
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

const HISTORY_KEY = "hbg_terminador_history";
const TASKS_KEY = "hbg_terminador_tasks";
const CRONS_KEY = "hbg_terminador_crons";

function loadHistory(): ActionHistory[] {
  try { return JSON.parse(localStorage.getItem(HISTORY_KEY) ?? "[]"); } catch { return []; }
}

const DEFAULT_TASKS: AutoTask[] = [
  { id: "1", name: "Respaldo diario", trigger: "Todos los días a las 23:00", action: "Exportar universo_hbg.json", active: true, priority: "alta", lastRun: "Hoy 23:00", runCount: 14 },
  { id: "2", name: "Limpieza semanal", trigger: "Domingos a las 08:00", action: "Eliminar archivos temporales", active: true, priority: "media", lastRun: "Domingo pasado", runCount: 3 },
  { id: "3", name: "Sync al iniciar", trigger: "Al abrir el sistema", action: "Sincronizar todos los nodos", active: false, priority: "baja", lastRun: "Hoy 17:33", runCount: 42 },
];

const DEFAULT_CRONS: CronJob[] = [
  { id: "c1", name: "Respaldo automático", schedule: "0 23 * * *", action: "backup_ecosystem()", nextRun: "Hoy 23:00", active: true, frequency: "diaria" },
  { id: "c2", name: "Compactar logs", schedule: "0 3 * * 1", action: "compact_logs()", nextRun: "Lunes 03:00", active: true, frequency: "semanal" },
  { id: "c3", name: "Optimizar caché", schedule: "0 4 * * *", action: "clear_cache()", nextRun: "Mañana 04:00", active: false, frequency: "diaria" },
  { id: "c4", name: "Informe mensual", schedule: "0 9 1 * *", action: "generate_report()", nextRun: "1 de Julio", active: true, frequency: "mensual" },
];

const PRIORITY_COLORS: Record<Priority, string> = { alta: "var(--neon-pink)", media: "#ffd740", baja: "var(--neon-green)" };

function getHealth(metrics: Metric[]): HealthLevel {
  for (const m of metrics) { if ((m.value / m.max) * 100 >= m.critical) return "critical"; }
  for (const m of metrics) { if ((m.value / m.max) * 100 >= m.warning) return "warning"; }
  return "excellent";
}

const HEALTH_CONFIG = {
  excellent: { label: "🟢 EXCELENTE", color: "var(--neon-green)", score: 87, desc: "Todos los sistemas operando correctamente. Sin errores críticos." },
  warning: { label: "🟡 ATENCIÓN", color: "#ffd740", score: 62, desc: "Algunos recursos en niveles altos. Se recomienda optimización." },
  critical: { label: "🔴 CRÍTICO", color: "var(--neon-pink)", score: 31, desc: "Recursos críticos detectados. Acción inmediata requerida." },
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
  const [metrics, setMetrics] = useState<Metric[]>([
    { label: "CPU", value: 23, max: 100, unit: "%", color: "var(--neon-cyan)", critical: 90, warning: 70 },
    { label: "RAM", value: 4.2, max: 16, unit: "GB", color: "var(--neon-purple)", critical: 90, warning: 75 },
    { label: "DISCO", value: 62, max: 100, unit: "%", color: "var(--neon-green)", critical: 95, warning: 80 },
    { label: "RED", value: 12, max: 100, unit: "MB/s", color: "#ff9100", critical: 90, warning: 70 },
    { label: "TEMP", value: 52, max: 100, unit: "°C", color: "var(--neon-pink)", critical: 85, warning: 70 },
    { label: "PROCESOS", value: 124, max: 500, unit: "", color: "#b388ff", critical: 90, warning: 70 },
  ]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [history, setHistory] = useState<ActionHistory[]>(loadHistory);
  const [tasks, setTasks] = useState<AutoTask[]>(() => { try { return JSON.parse(localStorage.getItem(TASKS_KEY) ?? "null") ?? DEFAULT_TASKS; } catch { return DEFAULT_TASKS; } });
  const [crons, setCrons] = useState<CronJob[]>(() => { try { return JSON.parse(localStorage.getItem(CRONS_KEY) ?? "null") ?? DEFAULT_CRONS; } catch { return DEFAULT_CRONS; } });
  const [scanning, setScanning] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [uptime, setUptime] = useState(0);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskTrigger, setNewTaskTrigger] = useState("");
  const [newTaskAction, setNewTaskAction] = useState("");
  const [newTaskPriority, setNewTaskPriority] = useState<Priority>("media");
  const [cronFilter, setCronFilter] = useState<"todas" | "diaria" | "semanal" | "mensual">("todas");
  const [selectedRes, setSelectedRes] = useState<Set<string>>(new Set());
  const logRef = useRef<HTMLDivElement>(null);

  const health = getHealth(metrics);
  const healthCfg = HEALTH_CONFIG[health];

  useEffect(() => {
    const id = setInterval(() => {
      setMetrics((prev) => prev.map((m) => ({ ...m, value: Math.max(0, Math.min(m.max, m.value + (Math.random() - 0.45) * (m.max * 0.025))) })));
      setUptime((u) => u + 1);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [logs]);

  useEffect(() => { localStorage.setItem(TASKS_KEY, JSON.stringify(tasks)); }, [tasks]);
  useEffect(() => { localStorage.setItem(CRONS_KEY, JSON.stringify(crons)); }, [crons]);
  useEffect(() => { localStorage.setItem(HISTORY_KEY, JSON.stringify(history.slice(-50))); }, [history]);

  const addLog = (entry: Omit<LogEntry, "time">) => {
    const time = new Date().toLocaleTimeString("es-ES", { hour12: false });
    setLogs((prev) => [...prev.slice(-99), { ...entry, time }]);
  };

  const addHistory = (action: string, result: ActionHistory["result"], details: string) => {
    const entry: ActionHistory = { id: Date.now().toString(), action, result, time: new Date().toLocaleTimeString("es-ES", { hour12: false }), details };
    setHistory((prev) => [entry, ...prev.slice(0, 49)]);
  };

  const runOperation = async (name: string, steps: Array<{ level: LogEntry["level"]; msg: string }>, onDone?: () => void) => {
    setView("logs");
    for (const step of steps) {
      await new Promise((r) => setTimeout(r, 300 + Math.random() * 200));
      addLog({ level: step.level, message: step.msg });
    }
    addHistory(name, "ok", `${steps.length} operaciones ejecutadas`);
    onDone?.();
  };

  const runOptimize = () => {
    if (optimizing || scanning) return;
    setOptimizing(true);
    runOperation("OPTIMIZACIÓN MASIVA", [
      { level: "OPTIM", msg: "Iniciando optimización masiva del sistema..." },
      { level: "INFO", msg: "Limpiando archivos temporales..." },
      { level: "INFO", msg: "Compactando registros de sistema..." },
      { level: "INFO", msg: "Eliminando caché del ecosistema..." },
      { level: "OPTIM", msg: "Defragmentando índices de memoria..." },
      { level: "OK", msg: `Optimización completada — ${(Math.random() * 30 + 15).toFixed(1)} MB recuperados` },
    ], () => setOptimizing(false));
  };

  const runScan = () => {
    if (optimizing || scanning) return;
    setScanning(true);
    runOperation("ESCANEO DEL SISTEMA", [
      { level: "SCAN", msg: "Iniciando escaneo completo del sistema..." },
      { level: "SCAN", msg: `Analizando /tmp — ${Math.floor(Math.random() * 500 + 500)} archivos encontrados` },
      { level: "SCAN", msg: `Analizando ~/.cache — ${(Math.random() * 2 + 1).toFixed(1)} GB detectados` },
      { level: "WARN", msg: `Disco al ${Math.floor(metrics.find(m => m.label === "DISCO")?.value ?? 62)}% — monitoreo activo` },
      { level: "INFO", msg: "Procesos zombie: 0 — limpio" },
      { level: "OK", msg: `Escaneo completado — health score: ${healthCfg.score}/100` },
    ], () => setScanning(false));
  };

  const runRepairAll = () => runOperation("REPARAR TODO", [
    { level: "INFO", msg: "Verificando integridad de todos los módulos..." },
    { level: "INFO", msg: "VIBRA PRO → integridad verificada ✓" },
    { level: "INFO", msg: "INSTINTO → integridad verificada ✓" },
    { level: "INFO", msg: "HBG CORE → integridad verificada ✓" },
    { level: "OPTIM", msg: "Reparando índices corruptos..." },
    { level: "OK", msg: "Reparación completada — todos los módulos íntegros" },
  ]);

  const runFullBackup = () => runOperation("RESPALDO TOTAL", [
    { level: "INFO", msg: "Iniciando respaldo total del ecosistema..." },
    { level: "INFO", msg: "Serializando notas de Instinto..." },
    { level: "INFO", msg: "Exportando playlists de Vibra Pro..." },
    { level: "INFO", msg: "Guardando memoria del HBG Core..." },
    { level: "INFO", msg: "Empaquetando configuraciones..." },
    { level: "OK", msg: "universo_hbg_backup.json generado correctamente" },
  ]);

  const runDeepClean = () => runOperation("LIMPIEZA PROFUNDA", [
    { level: "OPTIM", msg: "Iniciando limpieza profunda..." },
    { level: "INFO", msg: "Eliminando logs obsoletos (>30 días)..." },
    { level: "INFO", msg: "Limpiando caché del sistema..." },
    { level: "INFO", msg: "Eliminando archivos .tmp y .bak..." },
    { level: "INFO", msg: "Comprimiendo backups antiguos..." },
    { level: "OK", msg: `Limpieza profunda completada — ${(Math.random() * 50 + 20).toFixed(1)} MB liberados` },
  ]);

  const runRestartServices = () => runOperation("REINICIAR SERVICIOS", [
    { level: "INFO", msg: "Deteniendo Share Engine..." },
    { level: "INFO", msg: "Deteniendo Node Manager..." },
    { level: "INFO", msg: "Esperando cierre limpio..." },
    { level: "INFO", msg: "Reiniciando Share Engine..." },
    { level: "INFO", msg: "Reiniciando Node Manager..." },
    { level: "OK", msg: "Todos los servicios reiniciados correctamente" },
  ]);

  const formatUptime = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const MOCK_RESOURCES = [
    { name: "session_cache.tmp", size: "14.2 MB", type: "temp" },
    { name: "__pycache__", size: "3.8 MB", type: "pycache" },
    { name: "vibra_session.bak", size: "2.1 MB", type: "backup" },
    { name: "core_debug.log", size: "5.6 MB", type: "log" },
    { name: "instinto_draft.tmp", size: "0.8 MB", type: "temp" },
  ];

  const filteredCrons = crons.filter((c) => cronFilter === "todas" || c.frequency === cronFilter);

  const NAV_ITEMS: { id: ViewMode; label: string }[] = [
    { id: "dashboard", label: "DASHBOARD" }, { id: "recursos", label: "RECURSOS" },
    { id: "automatizaciones", label: "AUTOMATIZACIONES" }, { id: "cronjobs", label: "CRON JOBS" },
    { id: "logs", label: "LOGS" }, { id: "salud", label: "SALUD" }, { id: "universo", label: "UNIVERSO HBG" },
  ];

  const anyBusy = scanning || optimizing;

  return (
    <div>
      <div className="mod-header" style={{ "--mod-color": "var(--neon-green)" } as React.CSSProperties}>
        <span className="mod-icon" style={{ color: "var(--neon-green)", filter: "drop-shadow(0 0 12px var(--neon-green))" }}>⬢</span>
        <div className="mod-title-group">
          <div className="mod-title">TERMINADOR IA</div>
          <div className="mod-subtitle">// administrador autónomo del ecosistema</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 5 }}>
          <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 8, padding: "6px 8px" }} onClick={runScan} disabled={anyBusy}>{scanning ? "◎ SCAN..." : "◎ SCAN"}</button>
          <button className="hbg-btn hbg-btn-success" style={{ fontSize: 8, padding: "6px 8px" }} onClick={runOptimize} disabled={anyBusy}>{optimizing ? "⚙ OPTIM..." : "⚙ OPTIM"}</button>
          <span className="hbg-badge" style={{ background: `${healthCfg.color}15`, borderColor: `${healthCfg.color}40`, color: healthCfg.color }}>
            {healthCfg.label.split(" ")[0]} {healthCfg.score}/100
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
          <div className="hbg-card hbg-card-accent" style={{ "--card-color": healthCfg.color, marginBottom: 16, padding: "16px 20px" } as React.CSSProperties}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <div>
                <div className="card-label">ESTADO DEL ECOSISTEMA</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 700, color: healthCfg.color, textShadow: `0 0 16px ${healthCfg.color}` }}>{healthCfg.label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>{healthCfg.desc}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div className="card-label">HEALTH SCORE</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 30, fontWeight: 900, color: healthCfg.color, textShadow: `0 0 16px ${healthCfg.color}` }}>{healthCfg.score}<span style={{ fontSize: 14 }}>/100</span></div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>UPTIME: {formatUptime(uptime)}</div>
              </div>
            </div>
          </div>

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

          {/* Action buttons */}
          <div className="section-title">// acciones rápidas</div>
          <div className="hbg-grid hbg-grid-2" style={{ gap: 8, marginBottom: 16 }}>
            {[
              { label: "REPARAR TODO", fn: runRepairAll, color: "var(--neon-cyan)", icon: "⚙" },
              { label: "RESPALDO TOTAL", fn: runFullBackup, color: "var(--neon-green)", icon: "↓" },
              { label: "LIMPIEZA PROFUNDA", fn: runDeepClean, color: "#ff9100", icon: "◎" },
              { label: "REINICIAR SERVICIOS", fn: runRestartServices, color: "var(--neon-purple)", icon: "↻" },
            ].map((btn) => (
              <button key={btn.label} className="hbg-card" style={{ cursor: "pointer", textAlign: "left", padding: "12px 16px", border: `1px solid ${btn.color}25`, display: "flex", alignItems: "center", gap: 10 }} onClick={btn.fn} disabled={anyBusy}>
                <span style={{ fontSize: 20, color: btn.color, filter: `drop-shadow(0 0 6px ${btn.color})` }}>{btn.icon}</span>
                <span style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 700, letterSpacing: "0.1em", color: btn.color }}>{btn.label}</span>
              </button>
            ))}
          </div>

          {/* History */}
          <div className="section-title">// historial de acciones</div>
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
          <div className="hbg-grid" style={{ gridTemplateColumns: "repeat(3, 1fr)", gap: 8, marginBottom: 16 }}>
            {metrics.map((m) => {
              const color = getMetricColor(m);
              const pct = Math.min((m.value / m.max) * 100, 100);
              return (
                <div key={m.label} className="hbg-card hbg-card-accent" style={{ "--card-color": color } as React.CSSProperties}>
                  <div className="card-label">{m.label}</div>
                  <div className="card-value" style={{ color, textShadow: `0 0 12px ${color}`, fontSize: 20 }}>
                    {m.label === "RAM" ? m.value.toFixed(1) : Math.round(m.value)}<span style={{ fontSize: 10, opacity: 0.7, marginLeft: 2 }}>{m.unit}</span>
                  </div>
                  <div className="hbg-progress"><div className="hbg-progress-bar" style={{ "--bar-color": color, width: `${pct}%` } as React.CSSProperties} /></div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 4 }}>{pct.toFixed(0)}% de {m.max}{m.unit}</div>
                </div>
              );
            })}
          </div>

          <div className="section-title">// archivos temporales detectados</div>
          <div className="hbg-list" style={{ marginBottom: 12 }}>
            {MOCK_RESOURCES.map((f) => (
              <div key={f.name} className="hbg-list-item" style={{ cursor: "pointer", borderColor: selectedRes.has(f.name) ? "var(--neon-pink)" : undefined, background: selectedRes.has(f.name) ? "rgba(255,64,129,0.06)" : undefined }}
                onClick={() => setSelectedRes((prev) => { const n = new Set(prev); n.has(f.name) ? n.delete(f.name) : n.add(f.name); return n; })}>
                <div style={{ width: 14, height: 14, borderRadius: 2, border: `1px solid ${selectedRes.has(f.name) ? "var(--neon-pink)" : "var(--border-dim)"}`, background: selectedRes.has(f.name) ? "var(--neon-pink)" : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "var(--bg-void)" }}>
                  {selectedRes.has(f.name) ? "✓" : ""}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-primary)" }}>{f.name}</div>
                  <span className="hbg-badge hbg-badge-pink" style={{ marginTop: 2 }}>{f.type}</span>
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>{f.size}</span>
              </div>
            ))}
          </div>
          {selectedRes.size > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "center" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>{selectedRes.size} seleccionados</span>
              <button className="hbg-btn hbg-btn-danger" onClick={() => { setSelectedRes(new Set()); addHistory("LIMPIAR ARCHIVOS", "ok", `${selectedRes.size} archivos eliminados`); }}>✕ ELIMINAR</button>
            </div>
          )}
        </div>
      )}

      {/* AUTOMATIZACIONES */}
      {view === "automatizaciones" && (
        <div>
          <div className="hbg-grid hbg-grid-2" style={{ gap: 12 }}>
            <div>
              <div className="section-title">// tareas automatizadas</div>
              <div className="hbg-list" style={{ gap: 8, marginBottom: 12 }}>
                {tasks.map((task) => (
                  <div key={task.id} className="hbg-card" style={{ padding: "12px 14px" }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <div style={{ display: "flex", gap: 6, alignItems: "center" }}>
                        <span style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: task.active ? "var(--neon-green)" : "var(--text-muted)" }}>{task.name}</span>
                        <span className="hbg-badge" style={{ background: `${PRIORITY_COLORS[task.priority]}12`, borderColor: `${PRIORITY_COLORS[task.priority]}40`, color: PRIORITY_COLORS[task.priority], fontSize: 8 }}>{task.priority.toUpperCase()}</span>
                      </div>
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className={`hbg-btn ${task.active ? "hbg-btn-success" : "hbg-btn-ghost"}`} style={{ padding: "3px 8px", fontSize: 8 }} onClick={() => setTasks((prev) => prev.map((t) => t.id === task.id ? { ...t, active: !t.active } : t))}>{task.active ? "ON" : "OFF"}</button>
                        <button className="hbg-btn hbg-btn-danger" style={{ padding: "3px 8px", fontSize: 8 }} onClick={() => setTasks((prev) => prev.filter((t) => t.id !== task.id))}>✕</button>
                      </div>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", lineHeight: 1.8 }}>
                      <div>⚡ {task.trigger}</div>
                      <div>▶ {task.action}</div>
                      <div style={{ color: "var(--neon-cyan)" }}>Ejecutada {task.runCount}x · Última: {task.lastRun}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
            <div className="hbg-card">
              <div className="section-title">// nueva tarea</div>
              <input className="hbg-input" placeholder="Nombre de la tarea..." value={newTaskName} onChange={(e) => setNewTaskName(e.target.value)} style={{ marginBottom: 6 }} />
              <input className="hbg-input" placeholder="Disparador (ej: Todos los días 23:00)..." value={newTaskTrigger} onChange={(e) => setNewTaskTrigger(e.target.value)} style={{ marginBottom: 6 }} />
              <input className="hbg-input" placeholder="Acción a ejecutar..." value={newTaskAction} onChange={(e) => setNewTaskAction(e.target.value)} style={{ marginBottom: 8 }} />
              <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                {(["alta", "media", "baja"] as Priority[]).map((p) => (
                  <button key={p} className="hbg-badge" style={{ cursor: "pointer", background: newTaskPriority === p ? `${PRIORITY_COLORS[p]}18` : undefined, borderColor: newTaskPriority === p ? PRIORITY_COLORS[p] : "var(--border-dim)", color: newTaskPriority === p ? PRIORITY_COLORS[p] : "var(--text-muted)" }} onClick={() => setNewTaskPriority(p)}>{p.toUpperCase()}</button>
                ))}
              </div>
              <button className="hbg-btn hbg-btn-primary w-full" disabled={!newTaskName.trim()} onClick={() => { setTasks((prev) => [...prev, { id: Date.now().toString(), name: newTaskName, trigger: newTaskTrigger || "Manual", action: newTaskAction || "Ejecutar acción", active: true, priority: newTaskPriority, lastRun: "Nunca", runCount: 0 }]); setNewTaskName(""); setNewTaskTrigger(""); setNewTaskAction(""); }}>
                + PROGRAMAR TAREA
              </button>
            </div>
          </div>
        </div>
      )}

      {/* CRON JOBS */}
      {view === "cronjobs" && (
        <div>
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
                    {cron.active ? "ACTIVO" : "PAUSADO"}
                  </button>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", lineHeight: 1.9 }}>
                  <div style={{ color: "var(--text-secondary)" }}>schedule: <span style={{ color: "var(--neon-cyan)" }}>{cron.schedule}</span></div>
                  <div>action: {cron.action}</div>
                  <div style={{ color: "var(--neon-green)" }}>Próxima ejecución: {cron.nextRun}</div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* LOGS */}
      {view === "logs" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>// terminal de operaciones</div>
            <div style={{ display: "flex", gap: 6 }}>
              <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 9, padding: "5px 10px" }} onClick={() => setLogs([])}>LIMPIAR</button>
              <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 9, padding: "5px 10px" }}>↓ EXPORTAR LOGS</button>
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
            {anyBusy && <span style={{ color: "var(--neon-cyan)" }}>▌</span>}
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
          <div className="hbg-card hbg-card-accent" style={{ "--card-color": healthCfg.color, marginBottom: 16, padding: "20px 24px" } as React.CSSProperties}>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
              <div>
                <div className="card-label">SALUD GLOBAL DEL ECOSISTEMA</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 900, color: healthCfg.color, textShadow: `0 0 20px ${healthCfg.color}`, letterSpacing: "0.1em" }}>{healthCfg.label}</div>
              </div>
              <div style={{ textAlign: "right" }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 48, fontWeight: 900, color: healthCfg.color, textShadow: `0 0 24px ${healthCfg.color}`, lineHeight: 1 }}>{healthCfg.score}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>/ 100</div>
              </div>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>{healthCfg.desc}</div>
          </div>

          <div className="section-title">// indicadores por módulo</div>
          <div className="hbg-list" style={{ gap: 8, marginBottom: 16 }}>
            {[
              { name: "HBG CORE", status: "excellent" as HealthLevel, detail: "Memoria activa · 5 registros · latencia 0ms" },
              { name: "VIBRA PRO", status: "excellent" as HealthLevel, detail: "PlayerEngine activo · 8ms latencia · 6 favs" },
              { name: "INSTINTO", status: "excellent" as HealthLevel, detail: "2 notas · 1 letra · autosave activo" },
              { name: "TERMINADOR IA", status: health, detail: `Health score ${healthCfg.score}/100 · ${tasks.filter(t => t.active).length} tareas activas` },
              { name: "SHARE ENGINE", status: "excellent" as HealthLevel, detail: "Bus de mensajes activo · 4 nodos conectados" },
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
