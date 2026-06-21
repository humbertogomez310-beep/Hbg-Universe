import { useState, useEffect, useRef } from "react";
import { hbgCore, type ModuleId } from "../core/hbgCore";

type ViewMode = "dashboard" | "optimizacion" | "automatizaciones" | "logs" | "universo";
type HealthLevel = "excellent" | "warning" | "critical";

interface AutoTask {
  id: string;
  name: string;
  trigger: string;
  action: string;
  active: boolean;
  lastRun: string;
}

interface CronJob {
  id: string;
  name: string;
  schedule: string;
  action: string;
  nextRun: string;
  active: boolean;
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

const MOCK_FILES = [
  { name: "session_cache.tmp", size: "14.2 MB", type: "temp", path: "~/.cache/hbg/" },
  { name: "__pycache__", size: "3.8 MB", type: "pycache", path: "~/projects/hbg/" },
  { name: "vibra_session.bak", size: "2.1 MB", type: "backup", path: "~/.hbg/" },
  { name: "instinto_draft.tmp", size: "0.8 MB", type: "temp", path: "~/.hbg/instinto/" },
  { name: "core_debug.log", size: "5.6 MB", type: "log", path: "~/.hbg/logs/" },
  { name: ".DS_Store", size: "12 KB", type: "system", path: "~/Documents/" },
];

const DEFAULT_TASKS: AutoTask[] = [
  { id: "1", name: "Respaldo diario", trigger: "Todos los días a las 23:00", action: "Exportar universo_hbg.json", active: true, lastRun: "Hoy 23:00" },
  { id: "2", name: "Limpieza semanal", trigger: "Domingos a las 08:00", action: "Eliminar archivos temporales", active: true, lastRun: "Domingo pasado" },
  { id: "3", name: "Sync al iniciar", trigger: "Al abrir el sistema", action: "Sincronizar todos los nodos", active: false, lastRun: "Hoy 17:33" },
];

const DEFAULT_CRONS: CronJob[] = [
  { id: "c1", name: "Respaldo automático", schedule: "0 23 * * *", action: "backup_ecosystem()", nextRun: "Hoy 23:00", active: true },
  { id: "c2", name: "Compactar logs", schedule: "0 3 * * 1", action: "compact_logs()", nextRun: "Lunes 03:00", active: true },
  { id: "c3", name: "Optimizar caché", schedule: "0 4 * * *", action: "clear_cache()", nextRun: "Mañana 04:00", active: false },
];

const SCAN_LOG = [
  { level: "INFO" as const, message: "Iniciando escaneo del sistema de archivos..." },
  { level: "SCAN" as const, message: "Analizando /tmp — 847 archivos encontrados" },
  { level: "SCAN" as const, message: "Analizando ~/.cache — 2.3 GB detectados" },
  { level: "WARN" as const, message: "Disco al 78% — se recomienda limpieza" },
  { level: "SCAN" as const, message: "Buscando duplicados MD5 en ~/projects..." },
  { level: "INFO" as const, message: "3 grupos de duplicados detectados (140 MB)" },
  { level: "OPTIM" as const, message: "Limpiando archivos temporales..." },
  { level: "OK" as const, message: "26.5 MB recuperados correctamente" },
  { level: "INFO" as const, message: "Procesos zombie: 0 — sistema limpio" },
  { level: "OK" as const, message: "Optimización completada — health score: 87/100" },
];

function getHealth(metrics: Metric[]): HealthLevel {
  for (const m of metrics) {
    const pct = (m.value / m.max) * 100;
    if (pct >= m.critical) return "critical";
  }
  for (const m of metrics) {
    const pct = (m.value / m.max) * 100;
    if (pct >= m.warning) return "warning";
  }
  return "excellent";
}

const HEALTH_CONFIG = {
  excellent: { label: "🟢 EXCELENTE", color: "var(--neon-green)", score: 87 },
  warning: { label: "🟡 ADVERTENCIA", color: "#ffd740", score: 62 },
  critical: { label: "🔴 CRÍTICO", color: "var(--neon-pink)", score: 31 },
};

function getMetricColor(value: number, m: Metric): string {
  const pct = (value / m.max) * 100;
  if (pct >= m.critical) return "var(--neon-pink)";
  if (pct >= m.warning) return "#ffd740";
  return m.color;
}

export function TerminadorModule() {
  const [view, setView] = useState<ViewMode>("dashboard");
  const [metrics, setMetrics] = useState<Metric[]>([
    { label: "CPU", value: 23, max: 100, unit: "%", color: "var(--neon-cyan)", critical: 90, warning: 70 },
    { label: "RAM", value: 4.2, max: 16, unit: "GB", color: "var(--neon-purple)", critical: 90, warning: 75 },
    { label: "DISCO", value: 78, max: 100, unit: "%", color: "var(--neon-green)", critical: 95, warning: 80 },
    { label: "TEMP", value: 52, max: 100, unit: "°C", color: "#ff9100", critical: 85, warning: 70 },
  ]);
  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [scanning, setScanning] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [uptime, setUptime] = useState(0);
  const [tasks, setTasks] = useState<AutoTask[]>(DEFAULT_TASKS);
  const [crons, setCrons] = useState<CronJob[]>(DEFAULT_CRONS);
  const [newTaskName, setNewTaskName] = useState("");
  const [newTaskTrigger, setNewTaskTrigger] = useState("");
  const [newTaskAction, setNewTaskAction] = useState("");
  const logRef = useRef<HTMLDivElement>(null);

  const health = getHealth(metrics);
  const healthCfg = HEALTH_CONFIG[health];

  useEffect(() => {
    const id = setInterval(() => {
      setMetrics((prev) => prev.map((m) => ({ ...m, value: Math.max(0, Math.min(m.max, m.value + (Math.random() - 0.45) * (m.max * 0.03))) })));
      setUptime((u) => u + 1);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => { if (logRef.current) logRef.current.scrollTop = logRef.current.scrollHeight; }, [logs]);

  const addLog = (entry: Omit<LogEntry, "time">) => {
    const time = new Date().toLocaleTimeString("es-ES", { hour12: false });
    setLogs((prev) => [...prev.slice(-49), { ...entry, time }]);
  };

  const runScan = async () => {
    if (scanning) return;
    setScanning(true);
    setView("logs");
    for (const msg of SCAN_LOG) {
      await new Promise((r) => setTimeout(r, 350 + Math.random() * 250));
      addLog(msg);
    }
    setScanning(false);
  };

  const runOptimize = async () => {
    if (optimizing) return;
    setOptimizing(true);
    setView("logs");
    addLog({ level: "OPTIM", message: `Iniciando optimización masiva del sistema...` });
    await new Promise((r) => setTimeout(r, 500));
    addLog({ level: "INFO", message: "Limpiando caché del sistema..." });
    await new Promise((r) => setTimeout(r, 400));
    addLog({ level: "INFO", message: "Compactando registros..." });
    await new Promise((r) => setTimeout(r, 400));
    addLog({ level: "INFO", message: "Eliminando basura temporal..." });
    await new Promise((r) => setTimeout(r, 500));
    addLog({ level: "OK", message: `Optimización masiva completada — ${(Math.random() * 30 + 10).toFixed(1)} MB recuperados` });
    setOptimizing(false);
    setSelectedFiles(new Set());
  };

  const toggleTask = (id: string) => setTasks((prev) => prev.map((t) => t.id === id ? { ...t, active: !t.active } : t));
  const toggleCron = (id: string) => setCrons((prev) => prev.map((c) => c.id === id ? { ...c, active: !c.active } : c));
  const deleteTask = (id: string) => setTasks((prev) => prev.filter((t) => t.id !== id));
  const addTask = () => {
    if (!newTaskName.trim()) return;
    setTasks((prev) => [...prev, { id: Date.now().toString(), name: newTaskName, trigger: newTaskTrigger || "Manual", action: newTaskAction || "Ejecutar acción", active: true, lastRun: "Nunca" }]);
    setNewTaskName(""); setNewTaskTrigger(""); setNewTaskAction("");
  };

  const formatUptime = (s: number) => `${String(Math.floor(s / 3600)).padStart(2, "0")}:${String(Math.floor((s % 3600) / 60)).padStart(2, "0")}:${String(s % 60).padStart(2, "0")}`;

  const levelColor: Record<string, string> = { INFO: "var(--neon-cyan)", WARN: "#ffd740", OK: "var(--neon-green)", SCAN: "var(--neon-purple)", OPTIM: "var(--neon-pink)", CRON: "#ff9100", ERR: "var(--neon-pink)" };

  const NAV_ITEMS: { id: ViewMode; label: string }[] = [
    { id: "dashboard", label: "DASHBOARD" },
    { id: "optimizacion", label: "OPTIMIZACIÓN" },
    { id: "automatizaciones", label: "AUTOMATIZACIONES" },
    { id: "logs", label: "LOGS" },
    { id: "universo", label: "UNIVERSO HBG" },
  ];

  return (
    <div>
      <div className="mod-header" style={{ "--mod-color": "var(--neon-green)" } as React.CSSProperties}>
        <span className="mod-icon" style={{ color: "var(--neon-green)", filter: "drop-shadow(0 0 12px var(--neon-green))" }}>⬢</span>
        <div className="mod-title-group">
          <div className="mod-title">TERMINADOR IA</div>
          <div className="mod-subtitle">// agente autónomo de productividad y mantenimiento</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 9 }} onClick={runScan} disabled={scanning || optimizing}>
            {scanning ? "◎ ESCANEANDO..." : "◎ ESCANEAR"}
          </button>
          <button className="hbg-btn hbg-btn-success" style={{ fontSize: 9 }} onClick={runOptimize} disabled={scanning || optimizing}>
            {optimizing ? "⚙ OPTIMIZANDO..." : "⚙ OPTIMIZAR"}
          </button>
        </div>
      </div>

      {/* Sub-nav */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20, background: "var(--bg-deep)", padding: 4, borderRadius: 4, border: "1px solid var(--border-dim)" }}>
        {NAV_ITEMS.map((n) => (
          <button key={n.id} onClick={() => setView(n.id)}
            style={{ flex: 1, padding: "7px 4px", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", background: view === n.id ? "rgba(105,255,71,0.12)" : "transparent", border: `1px solid ${view === n.id ? "var(--neon-green)" : "transparent"}`, borderRadius: 3, color: view === n.id ? "var(--neon-green)" : "var(--text-muted)", cursor: "pointer", transition: "all 0.15s" }}>
            {n.label}
          </button>
        ))}
      </div>

      {/* DASHBOARD */}
      {view === "dashboard" && (
        <div>
          {/* Health indicator */}
          <div className="hbg-card hbg-card-accent" style={{ "--card-color": healthCfg.color, marginBottom: 16, display: "flex", alignItems: "center", gap: 20, padding: "16px 20px" } as React.CSSProperties}>
            <div>
              <div className="card-label">SALUD DEL ECOSISTEMA</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 700, color: healthCfg.color, textShadow: `0 0 16px ${healthCfg.color}`, letterSpacing: "0.08em" }}>
                {healthCfg.label}
              </div>
            </div>
            <div style={{ marginLeft: "auto", textAlign: "right" }}>
              <div className="card-label">HEALTH SCORE</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 28, fontWeight: 900, color: healthCfg.color, textShadow: `0 0 16px ${healthCfg.color}` }}>{healthCfg.score}<span style={{ fontSize: 14 }}>/100</span></div>
            </div>
            <div style={{ textAlign: "right" }}>
              <div className="card-label">UPTIME</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 16, color: "var(--neon-cyan)" }}>{formatUptime(uptime)}</div>
            </div>
          </div>

          {/* Metrics */}
          <div className="hbg-grid hbg-grid-4" style={{ gap: 10, marginBottom: 16 }}>
            {metrics.map((m) => {
              const color = getMetricColor(m.value, m);
              const pct = Math.min((m.value / m.max) * 100, 100);
              return (
                <div key={m.label} className="hbg-card hbg-card-accent" style={{ "--card-color": color } as React.CSSProperties}>
                  <div className="card-label">{m.label}</div>
                  <div className="card-value" style={{ color, textShadow: `0 0 12px ${color}`, fontSize: 22 }}>
                    {m.label === "RAM" ? m.value.toFixed(1) : Math.round(m.value)}<span style={{ fontSize: 11, opacity: 0.7, marginLeft: 2 }}>{m.unit}</span>
                  </div>
                  <div className="hbg-progress">
                    <div className="hbg-progress-bar" style={{ "--bar-color": color, width: `${pct}%` } as React.CSSProperties} />
                  </div>
                </div>
              );
            })}
          </div>

          {/* Active crons summary */}
          <div className="section-title">// cron jobs activos</div>
          <div className="hbg-list" style={{ gap: 6 }}>
            {crons.filter((c) => c.active).map((c) => (
              <div key={c.id} className="hbg-list-item">
                <div className="hbg-list-dot" style={{ color: "var(--neon-green)", background: "var(--neon-green)" }} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--text-primary)" }}>{c.name}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{c.schedule} → {c.action}</div>
                </div>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--neon-cyan)" }}>{c.nextRun}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* OPTIMIZACIÓN */}
      {view === "optimizacion" && (
        <div>
          <div className="hbg-grid hbg-grid-2" style={{ gap: 12, marginBottom: 20 }}>
            <button className="hbg-card hbg-card-accent" style={{ "--card-color": "var(--neon-green)", cursor: "pointer", textAlign: "left" } as React.CSSProperties} onClick={runOptimize}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>⚙</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "var(--neon-green)", marginBottom: 4 }}>OPTIMIZACIÓN MASIVA</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>Limpia caché · compacta registros · elimina basura</div>
            </button>
            <button className="hbg-card hbg-card-accent" style={{ "--card-color": "var(--neon-cyan)", cursor: "pointer", textAlign: "left" } as React.CSSProperties} onClick={runScan}>
              <div style={{ fontSize: 24, marginBottom: 8 }}>◎</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: "var(--neon-cyan)", marginBottom: 4 }}>ESCANEAR SISTEMA</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>Detecta duplicados · archivos tmp · procesos zombie</div>
            </button>
          </div>

          <div className="section-title">// archivos temporales detectados</div>
          <div className="hbg-list" style={{ marginBottom: 16 }}>
            {MOCK_FILES.map((f) => (
              <div key={f.name} className="hbg-list-item" style={{ cursor: "pointer", borderColor: selectedFiles.has(f.name) ? "var(--neon-pink)" : undefined, background: selectedFiles.has(f.name) ? "rgba(255,64,129,0.06)" : undefined }}
                onClick={() => setSelectedFiles((prev) => { const n = new Set(prev); n.has(f.name) ? n.delete(f.name) : n.add(f.name); return n; })}>
                <div style={{ width: 14, height: 14, borderRadius: 2, border: `1px solid ${selectedFiles.has(f.name) ? "var(--neon-pink)" : "var(--border-dim)"}`, background: selectedFiles.has(f.name) ? "var(--neon-pink)" : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center", fontSize: 9, color: "var(--bg-void)" }}>
                  {selectedFiles.has(f.name) ? "✓" : ""}
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-primary)" }}>{f.name}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{f.path}</div>
                </div>
                <span className="hbg-badge hbg-badge-pink">{f.type}</span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", minWidth: 60, textAlign: "right" }}>{f.size}</span>
              </div>
            ))}
          </div>
          {selectedFiles.size > 0 && (
            <div style={{ display: "flex", justifyContent: "flex-end", gap: 10, alignItems: "center" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>{selectedFiles.size} seleccionados</span>
              <button className="hbg-btn hbg-btn-danger" onClick={runOptimize}>✕ ELIMINAR</button>
            </div>
          )}
        </div>
      )}

      {/* AUTOMATIZACIONES */}
      {view === "automatizaciones" && (
        <div>
          <div className="hbg-grid hbg-grid-2" style={{ gap: 12, marginBottom: 20 }}>
            {/* Tasks */}
            <div>
              <div className="section-title">// tareas automatizadas</div>
              <div className="hbg-list" style={{ gap: 8, marginBottom: 12 }}>
                {tasks.map((task) => (
                  <div key={task.id} className="hbg-card" style={{ padding: "12px 14px", borderColor: task.active ? "rgba(105,255,71,0.2)" : undefined }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: task.active ? "var(--neon-green)" : "var(--text-muted)" }}>{task.name}</span>
                      <div style={{ display: "flex", gap: 6 }}>
                        <button className={`hbg-btn ${task.active ? "hbg-btn-success" : "hbg-btn-ghost"}`} style={{ padding: "3px 8px", fontSize: 9 }} onClick={() => toggleTask(task.id)}>
                          {task.active ? "ON" : "OFF"}
                        </button>
                        <button className="hbg-btn hbg-btn-danger" style={{ padding: "3px 8px", fontSize: 9 }} onClick={() => deleteTask(task.id)}>✕</button>
                      </div>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                      <div>⚡ {task.trigger}</div>
                      <div>▶ {task.action}</div>
                      <div style={{ marginTop: 4, color: "var(--neon-cyan)" }}>Última ejecución: {task.lastRun}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* New task */}
              <div className="hbg-card">
                <div className="section-title">// nueva tarea</div>
                <input className="hbg-input" placeholder="Nombre de la tarea..." value={newTaskName} onChange={(e) => setNewTaskName(e.target.value)} style={{ marginBottom: 6 }} />
                <input className="hbg-input" placeholder="Disparador (ej: Todos los días 23:00)..." value={newTaskTrigger} onChange={(e) => setNewTaskTrigger(e.target.value)} style={{ marginBottom: 6 }} />
                <input className="hbg-input" placeholder="Acción a ejecutar..." value={newTaskAction} onChange={(e) => setNewTaskAction(e.target.value)} style={{ marginBottom: 8 }} />
                <button className="hbg-btn hbg-btn-primary w-full" onClick={addTask} disabled={!newTaskName.trim()}>+ CREAR TAREA</button>
              </div>
            </div>

            {/* Cron Jobs */}
            <div>
              <div className="section-title">// cron jobs del sistema</div>
              <div className="hbg-list" style={{ gap: 8 }}>
                {crons.map((cron) => (
                  <div key={cron.id} className="hbg-card" style={{ padding: "12px 14px", borderColor: cron.active ? "rgba(0,229,255,0.2)" : undefined }}>
                    <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                      <span style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, letterSpacing: "0.08em", color: cron.active ? "var(--neon-cyan)" : "var(--text-muted)" }}>{cron.name}</span>
                      <button className={`hbg-btn ${cron.active ? "hbg-btn-primary" : "hbg-btn-ghost"}`} style={{ padding: "3px 8px", fontSize: 9 }} onClick={() => toggleCron(cron.id)}>
                        {cron.active ? "ACTIVO" : "PAUSADO"}
                      </button>
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                      <div style={{ color: "var(--text-secondary)" }}>schedule: {cron.schedule}</div>
                      <div>action: {cron.action}</div>
                      <div style={{ marginTop: 4, color: "var(--neon-green)" }}>Próxima: {cron.nextRun}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* LOGS */}
      {view === "logs" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>// terminal de operaciones</div>
            <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 9 }} onClick={() => setLogs([])}>LIMPIAR</button>
          </div>
          <div ref={logRef} className="hbg-card" style={{ background: "var(--bg-deep)", height: 320, overflowY: "auto", fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.9, borderColor: "var(--border-dim)" }}>
            {logs.length === 0 ? (
              <span style={{ color: "var(--text-muted)" }}>// haz clic en ESCANEAR o OPTIMIZAR para iniciar operaciones</span>
            ) : (
              logs.map((l, i) => (
                <div key={i} style={{ display: "flex", gap: 10 }}>
                  <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>[{l.time}]</span>
                  <span style={{ color: levelColor[l.level] || "var(--text-secondary)", flexShrink: 0, minWidth: 48 }}>{l.level}</span>
                  <span style={{ color: "var(--text-primary)" }}>{l.message}</span>
                </div>
              ))
            )}
            {(scanning || optimizing) && <span style={{ color: "var(--neon-cyan)" }}>▌</span>}
          </div>

          {/* Error/warning counts */}
          <div className="hbg-grid hbg-grid-3" style={{ gap: 10, marginTop: 12 }}>
            {[
              { label: "ERRORES", count: logs.filter((l) => l.level === "ERR").length, color: "var(--neon-pink)" },
              { label: "ADVERTENCIAS", count: logs.filter((l) => l.level === "WARN").length, color: "#ffd740" },
              { label: "OPERACIONES OK", count: logs.filter((l) => l.level === "OK").length, color: "var(--neon-green)" },
            ].map((stat) => (
              <div key={stat.label} className="hbg-card" style={{ padding: "12px 14px" }}>
                <div className="card-label">{stat.label}</div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: stat.color, textShadow: `0 0 10px ${stat.color}` }}>{stat.count}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* UNIVERSO HBG */}
      {view === "universo" && (
        <div>
          <div className="section-title">// universo hbg — ecosistema conectado</div>
          <div className="hbg-grid hbg-grid-2" style={{ gap: 12 }}>
            {[
              { id: "vibra" as ModuleId, label: "VIBRA PRO", icon: "◉", color: "var(--neon-pink)", desc: "Motor de audio y mood engine" },
              { id: "instinto" as ModuleId, label: "INSTINTO", icon: "⬡", color: "var(--neon-cyan)", desc: "Módulo de creatividad y notas" },
              { id: "universo" as ModuleId, label: "HBG CORE", icon: "◈", color: "var(--neon-purple)", desc: "Cerebro del ecosistema" },
            ].map((app) => (
              <div key={app.id} className="hbg-card hbg-card-accent" style={{ "--card-color": app.color, cursor: "pointer" } as React.CSSProperties} onClick={() => hbgCore.setModule(app.id)}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 22, color: app.color, filter: `drop-shadow(0 0 8px ${app.color})` }}>{app.icon}</span>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: app.color }}>{app.label}</span>
                </div>
                <div className="card-body">{app.desc}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--neon-green)", marginTop: 8 }}>🟢 ONLINE → ABRIR</div>
              </div>
            ))}
            <div className="hbg-card">
              <div className="section-title">// share engine</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button className="hbg-btn hbg-btn-primary w-full">↗ COMPARTIR REPORTE</button>
                <button className="hbg-btn hbg-btn-ghost w-full">↓ EXPORTAR LOGS</button>
                <button className="hbg-btn hbg-btn-ghost w-full">⬡ SINCRONIZAR ESTADO</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
