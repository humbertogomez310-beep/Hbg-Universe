import { useState, useEffect } from "react";
import { hbgCore, MODULES, type ModuleId } from "../core/hbgCore";

const SYSTEM_STATS = [
  { label: "MÓDULOS ACTIVOS", value: "4", unit: "de 4 cargados", color: "var(--neon-cyan)" },
  { label: "MEMORIA HBG", value: "128", unit: "KB en localStorage", color: "var(--neon-purple)" },
  { label: "UPTIME", value: "∞", unit: "sesión activa", color: "var(--neon-green)" },
  { label: "VERSIÓN CORE", value: "1.0", unit: "build estable", color: "var(--neon-orange)" },
];

const ACTIVITY_LOG = [
  { time: "BOOT", msg: "HBG CORE inicializado correctamente", color: "var(--neon-green)" },
  { time: "INIT", msg: "MemoryEngine: localStorage conectado", color: "var(--neon-cyan)" },
  { time: "INIT", msg: "MoodEngine: estado neutral cargado", color: "var(--neon-cyan)" },
  { time: "INIT", msg: "SyncEngine: bus de mensajes activo", color: "var(--neon-purple)" },
  { time: "INIT", msg: "DJEngine: procesador de voz en espera", color: "var(--neon-purple)" },
  { time: "LINK", msg: "VIBRA PRO: módulo enlazado", color: "var(--neon-pink)" },
  { time: "LINK", msg: "INSTINTO: módulo enlazado", color: "var(--neon-cyan)" },
  { time: "LINK", msg: "TERMINADOR IA: módulo enlazado", color: "var(--neon-green)" },
  { time: "READY", msg: "Sistema listo — todos los módulos operativos", color: "var(--neon-yellow, #ffd740)" },
];

const MOOD_STATES = [
  { id: "energized", label: "ENERGIZADO", icon: "⚡", color: "var(--neon-pink)", bpm: "120–160" },
  { id: "focused", label: "ENFOCADO", icon: "◎", color: "var(--neon-cyan)", bpm: "60–90" },
  { id: "creative", label: "CREATIVO", icon: "◈", color: "var(--neon-orange, #ff9100)", bpm: "80–110" },
  { id: "relaxed", label: "RELAJADO", icon: "◉", color: "var(--neon-green)", bpm: "50–75" },
  { id: "neutral", label: "NEUTRAL", icon: "◇", color: "var(--neon-purple)", bpm: "90–120" },
];

export function UniversoModule() {
  const [activeMood, setActiveMood] = useState("neutral");
  const [logLines, setLogLines] = useState(0);

  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i++;
      setLogLines(i);
      if (i >= ACTIVITY_LOG.length) clearInterval(id);
    }, 120);
    return () => clearInterval(id);
  }, []);

  return (
    <div>
      <div className="mod-header" style={{ "--mod-color": "var(--neon-cyan)" } as React.CSSProperties}>
        <span className="mod-icon">◈</span>
        <div className="mod-title-group">
          <div className="mod-title">UNIVERSO HBG</div>
          <div className="mod-subtitle">// centro de control del ecosistema</div>
        </div>
      </div>

      {/* Stats Grid */}
      <div className="hbg-grid hbg-grid-4">
        {SYSTEM_STATS.map((s) => (
          <div
            key={s.label}
            className="hbg-card hbg-card-accent"
            style={{ "--card-color": s.color } as React.CSSProperties}
          >
            <div className="card-label">{s.label}</div>
            <div className="card-value" style={{ color: s.color, textShadow: `0 0 16px ${s.color}` }}>
              {s.value}
            </div>
            <div className="card-unit">{s.unit}</div>
          </div>
        ))}
      </div>

      {/* Mood Engine */}
      <div className="mt-6">
        <div className="section-title">// mood engine — estado de ánimo activo</div>
        <div className="hbg-grid hbg-grid-3" style={{ gap: 10 }}>
          {MOOD_STATES.map((mood) => (
            <button
              key={mood.id}
              className={`hbg-card ${activeMood === mood.id ? "hbg-card-accent" : ""}`}
              style={{
                "--card-color": mood.color,
                cursor: "pointer",
                textAlign: "left",
                border: activeMood === mood.id
                  ? `1px solid ${mood.color}`
                  : undefined,
                boxShadow: activeMood === mood.id
                  ? `0 0 20px ${mood.color}20`
                  : undefined,
              } as React.CSSProperties}
              onClick={() => setActiveMood(mood.id)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                <span style={{ fontSize: 20, color: mood.color, filter: activeMood === mood.id ? `drop-shadow(0 0 8px ${mood.color})` : "none" }}>
                  {mood.icon}
                </span>
                <span
                  className="card-title"
                  style={{
                    color: activeMood === mood.id ? mood.color : "var(--text-primary)",
                    fontSize: 10,
                    letterSpacing: "0.14em",
                  }}
                >
                  {mood.label}
                </span>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                BPM: {mood.bpm}
              </div>
            </button>
          ))}
        </div>
      </div>

      {/* Module Links */}
      <div className="mt-6">
        <div className="section-title">// módulos del ecosistema</div>
        <div className="hbg-grid hbg-grid-2" style={{ gap: 10 }}>
          {MODULES.filter((m) => m.id !== "universo").map((mod) => (
            <div
              key={mod.id}
              className="hbg-list-item"
              style={{ cursor: "pointer" }}
              onClick={() => hbgCore.setModule(mod.id as ModuleId)}
            >
              <span style={{ fontSize: 20, color: mod.color, filter: `drop-shadow(0 0 6px ${mod.color})` }}>
                {mod.icon}
              </span>
              <div>
                <div
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 11,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    color: mod.color,
                  }}
                >
                  {mod.label}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                  {mod.description}
                </div>
              </div>
              <span style={{ marginLeft: "auto", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--neon-green)" }}>
                ONLINE
              </span>
            </div>
          ))}
        </div>
      </div>

      {/* Boot Log */}
      <div className="mt-6">
        <div className="section-title">// log de arranque del sistema</div>
        <div
          className="hbg-card"
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 11,
            lineHeight: 1.8,
            background: "var(--bg-deep)",
            borderColor: "var(--border-dim)",
          }}
        >
          {ACTIVITY_LOG.slice(0, logLines).map((entry, i) => (
            <div key={i} style={{ display: "flex", gap: 12 }}>
              <span style={{ color: "var(--text-muted)", minWidth: 44 }}>[{entry.time}]</span>
              <span style={{ color: entry.color }}>{entry.msg}</span>
            </div>
          ))}
          {logLines < ACTIVITY_LOG.length && (
            <span style={{ color: "var(--neon-cyan)", animation: "pulse-dot 0.8s infinite" }}>▌</span>
          )}
        </div>
      </div>
    </div>
  );
}
