import { useState, useEffect, useRef } from "react";

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
  level: "INFO" | "WARN" | "OK" | "SCAN" | "OPTIM";
  message: string;
}

interface FileItem {
  name: string;
  size: string;
  type: string;
  path: string;
}

const MOCK_FILES: FileItem[] = [
  { name: "session_cache.tmp", size: "14.2 MB", type: "temp", path: "~/.cache/hbg/" },
  { name: "__pycache__", size: "3.8 MB", type: "pycache", path: "~/projects/hbg/" },
  { name: "vibra_session.bak", size: "2.1 MB", type: "backup", path: "~/.hbg/" },
  { name: "instinto_draft.tmp", size: "0.8 MB", type: "temp", path: "~/.hbg/instinto/" },
  { name: "core_debug.log", size: "5.6 MB", type: "log", path: "~/.hbg/logs/" },
  { name: ".DS_Store", size: "12 KB", type: "system", path: "~/Documents/" },
];

const LOG_MESSAGES = [
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

function getMetricColor(value: number, metric: Metric): string {
  const pct = (value / metric.max) * 100;
  if (pct >= metric.critical) return "var(--neon-pink)";
  if (pct >= metric.warning) return "var(--neon-orange, #ff9100)";
  return metric.color;
}

export function TerminadorModule() {
  const [metrics, setMetrics] = useState<Metric[]>([
    { label: "CPU", value: 23, max: 100, unit: "%", color: "var(--neon-cyan)", critical: 90, warning: 70 },
    { label: "RAM", value: 4.2, max: 16, unit: "GB", color: "var(--neon-purple)", critical: 90, warning: 75 },
    { label: "DISCO", value: 78, max: 100, unit: "%", color: "var(--neon-green)", critical: 95, warning: 80 },
    { label: "TEMP", value: 52, max: 100, unit: "°C", color: "var(--neon-orange, #ff9100)", critical: 85, warning: 70 },
  ]);

  const [logs, setLogs] = useState<LogEntry[]>([]);
  const [scanning, setScanning] = useState(false);
  const [optimizing, setOptimizing] = useState(false);
  const [healthScore, setHealthScore] = useState<number | null>(null);
  const [selectedFiles, setSelectedFiles] = useState<Set<string>>(new Set());
  const [uptime, setUptime] = useState(0);
  const logRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const id = setInterval(() => {
      setMetrics((prev) =>
        prev.map((m) => ({
          ...m,
          value: Math.max(
            0,
            Math.min(m.max, m.value + (Math.random() - 0.45) * (m.max * 0.03))
          ),
        }))
      );
      setUptime((u) => u + 1);
    }, 2000);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    if (logRef.current) {
      logRef.current.scrollTop = logRef.current.scrollHeight;
    }
  }, [logs]);

  const addLog = (entry: Omit<LogEntry, "time">) => {
    const time = new Date().toLocaleTimeString("es-ES", { hour12: false });
    setLogs((prev) => [...prev.slice(-49), { ...entry, time }]);
  };

  const runScan = async () => {
    if (scanning) return;
    setScanning(true);
    setHealthScore(null);
    setLogs([]);

    for (let i = 0; i < LOG_MESSAGES.length; i++) {
      await new Promise((r) => setTimeout(r, 400 + Math.random() * 300));
      addLog(LOG_MESSAGES[i]);
    }

    setHealthScore(87);
    setScanning(false);
  };

  const runOptimize = async () => {
    if (optimizing) return;
    setOptimizing(true);
    const targets = selectedFiles.size > 0 ? selectedFiles.size : MOCK_FILES.length;
    addLog({ level: "OPTIM", message: `Iniciando optimización de ${targets} items...` });
    await new Promise((r) => setTimeout(r, 600));
    addLog({ level: "INFO", message: "Modo dry_run desactivado — eliminando archivos temporales" });
    await new Promise((r) => setTimeout(r, 500));
    addLog({ level: "OK", message: `Limpieza completada — ${(Math.random() * 30 + 10).toFixed(1)} MB recuperados` });
    addLog({ level: "OK", message: "Sistema optimizado correctamente" });
    setOptimizing(false);
    setSelectedFiles(new Set());
  };

  const formatUptime = (s: number) => {
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    return `${h.toString().padStart(2, "0")}:${m.toString().padStart(2, "0")}:${sec.toString().padStart(2, "0")}`;
  };

  const toggleFile = (name: string) => {
    setSelectedFiles((prev) => {
      const next = new Set(prev);
      next.has(name) ? next.delete(name) : next.add(name);
      return next;
    });
  };

  const levelColor: Record<string, string> = {
    INFO: "var(--neon-cyan)",
    WARN: "var(--neon-orange, #ff9100)",
    OK: "var(--neon-green)",
    SCAN: "var(--neon-purple)",
    OPTIM: "var(--neon-pink)",
  };

  return (
    <div>
      <div className="mod-header" style={{ "--mod-color": "var(--neon-green)" } as React.CSSProperties}>
        <span className="mod-icon" style={{ color: "var(--neon-green)", filter: "drop-shadow(0 0 12px var(--neon-green))" }}>
          ⬢
        </span>
        <div className="mod-title-group">
          <div className="mod-title">TERMINADOR IA</div>
          <div className="mod-subtitle">// agente autónomo de optimización del sistema</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            className="hbg-btn hbg-btn-ghost"
            onClick={runScan}
            disabled={scanning || optimizing}
            style={{ opacity: scanning ? 0.6 : 1 }}
          >
            {scanning ? "⬢ ESCANEANDO..." : "⬢ ESCANEAR"}
          </button>
          <button
            className="hbg-btn hbg-btn-success"
            onClick={runOptimize}
            disabled={scanning || optimizing}
            style={{ opacity: optimizing ? 0.6 : 1 }}
          >
            {optimizing ? "⚙ OPTIMIZANDO..." : "⚙ OPTIMIZAR"}
          </button>
        </div>
      </div>

      {/* Metrics */}
      <div className="hbg-grid hbg-grid-4" style={{ marginBottom: 20 }}>
        {metrics.map((m) => {
          const color = getMetricColor(m.value, m);
          const pct = Math.min((m.value / m.max) * 100, 100);
          return (
            <div
              key={m.label}
              className="hbg-card hbg-card-accent"
              style={{ "--card-color": color } as React.CSSProperties}
            >
              <div className="card-label">{m.label}</div>
              <div className="card-value" style={{ color, textShadow: `0 0 12px ${color}`, fontSize: 22 }}>
                {m.label === "RAM"
                  ? m.value.toFixed(1)
                  : Math.round(m.value)}{" "}
                <span style={{ fontSize: 12, opacity: 0.7 }}>{m.unit}</span>
              </div>
              <div className="hbg-progress">
                <div
                  className="hbg-progress-bar"
                  style={{ "--bar-color": color, width: `${pct}%` } as React.CSSProperties}
                />
              </div>
            </div>
          );
        })}
      </div>

      {/* Health + Uptime */}
      <div className="hbg-grid hbg-grid-2" style={{ gap: 12, marginBottom: 20 }}>
        <div className="hbg-card hbg-card-accent" style={{ "--card-color": healthScore !== null && healthScore >= 80 ? "var(--neon-green)" : "var(--neon-orange, #ff9100)" } as React.CSSProperties}>
          <div className="card-label">HEALTH SCORE</div>
          {healthScore !== null ? (
            <div
              className="card-value"
              style={{
                color: healthScore >= 80 ? "var(--neon-green)" : "var(--neon-orange, #ff9100)",
                textShadow: `0 0 16px ${healthScore >= 80 ? "var(--neon-green)" : "var(--neon-orange, #ff9100)"}`,
              }}
            >
              {healthScore}<span style={{ fontSize: 14 }}>/100</span>
            </div>
          ) : (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", marginTop: 8 }}>
              // ejecuta ESCANEAR para calcular
            </div>
          )}
        </div>
        <div className="hbg-card">
          <div className="card-label">UPTIME DEL MONITOR</div>
          <div
            className="card-value"
            style={{ color: "var(--neon-cyan)", textShadow: "0 0 12px var(--neon-cyan)", fontSize: 22 }}
          >
            {formatUptime(uptime)}
          </div>
          <div className="card-unit">horas : minutos : segundos</div>
        </div>
      </div>

      {/* File Scanner */}
      <div className="section-title">// archivos temporales detectados</div>
      <div className="hbg-list" style={{ marginBottom: 20 }}>
        {MOCK_FILES.map((f) => (
          <div
            key={f.name}
            className="hbg-list-item"
            style={{
              cursor: "pointer",
              borderColor: selectedFiles.has(f.name) ? "var(--neon-pink)" : undefined,
              background: selectedFiles.has(f.name) ? "rgba(255,64,129,0.06)" : undefined,
            }}
            onClick={() => toggleFile(f.name)}
          >
            <div
              style={{
                width: 14,
                height: 14,
                borderRadius: 2,
                border: `1px solid ${selectedFiles.has(f.name) ? "var(--neon-pink)" : "var(--border-dim)"}`,
                background: selectedFiles.has(f.name) ? "var(--neon-pink)" : "transparent",
                flexShrink: 0,
                display: "flex",
                alignItems: "center",
                justifyContent: "center",
                fontSize: 9,
                color: "var(--bg-void)",
              }}
            >
              {selectedFiles.has(f.name) ? "✓" : ""}
            </div>
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-primary)" }}>
                {f.name}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                {f.path}
              </div>
            </div>
            <span
              className="hbg-badge"
              style={{
                background: "rgba(255,64,129,0.08)",
                borderColor: "rgba(255,64,129,0.3)",
                color: "var(--neon-pink)",
              }}
            >
              {f.type}
            </span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", minWidth: 60, textAlign: "right" }}>
              {f.size}
            </span>
          </div>
        ))}
      </div>

      {selectedFiles.size > 0 && (
        <div style={{ display: "flex", justifyContent: "flex-end", marginBottom: 20, gap: 10, alignItems: "center" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
            {selectedFiles.size} archivo(s) seleccionados
          </span>
          <button className="hbg-btn hbg-btn-danger" onClick={runOptimize}>
            ✕ ELIMINAR SELECCIONADOS
          </button>
        </div>
      )}

      {/* Log Terminal */}
      <div className="section-title">// terminal de operaciones</div>
      <div
        ref={logRef}
        className="hbg-card"
        style={{
          background: "var(--bg-deep)",
          height: 220,
          overflowY: "auto",
          fontFamily: "var(--font-mono)",
          fontSize: 11,
          lineHeight: 1.8,
          borderColor: "var(--border-dim)",
        }}
      >
        {logs.length === 0 ? (
          <span style={{ color: "var(--text-muted)" }}>
            // haz clic en ESCANEAR para iniciar el análisis del sistema
          </span>
        ) : (
          logs.map((l, i) => (
            <div key={i} style={{ display: "flex", gap: 10 }}>
              <span style={{ color: "var(--text-muted)", flexShrink: 0 }}>[{l.time}]</span>
              <span
                style={{
                  color: levelColor[l.level] || "var(--text-secondary)",
                  flexShrink: 0,
                  minWidth: 50,
                }}
              >
                {l.level}
              </span>
              <span style={{ color: "var(--text-primary)" }}>{l.message}</span>
            </div>
          ))
        )}
        {(scanning || optimizing) && (
          <span style={{ color: "var(--neon-cyan)" }}>▌</span>
        )}
      </div>
    </div>
  );
}
