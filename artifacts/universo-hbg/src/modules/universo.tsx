import { useState, useEffect } from "react";
import { hbgCore, MODULES, type ModuleId } from "../core/hbgCore";

const NODE_STATES: Record<ModuleId, { connected: boolean; latency: number }> = {
  universo: { connected: true, latency: 0 },
  instinto: { connected: true, latency: 12 },
  vibra: { connected: true, latency: 8 },
  terminador: { connected: true, latency: 23 },
};

const MEMORY_ITEMS = [
  { key: "estado_emocional", value: "Neutral", color: "var(--neon-purple)" },
  { key: "ultimo_modulo", value: "UNIVERSO", color: "var(--neon-cyan)" },
  { key: "canciones_favoritas", value: "6 guardadas", color: "var(--neon-pink)" },
  { key: "proyectos_activos", value: "2 en progreso", color: "var(--neon-orange, #ff9100)" },
  { key: "historial_creativo", value: "3 entradas", color: "var(--neon-green)" },
];

const BOOT_LOG = [
  { time: "BOOT", msg: "HBG CORE inicializado correctamente", color: "var(--neon-green)" },
  { time: "NET", msg: "Share Engine: bus de mensajes activo", color: "var(--neon-cyan)" },
  { time: "LINK", msg: "VIBRA PRO → latencia 8ms → ONLINE", color: "var(--neon-pink)" },
  { time: "LINK", msg: "INSTINTO → latencia 12ms → ONLINE", color: "var(--neon-cyan)" },
  { time: "LINK", msg: "TERMINADOR IA → latencia 23ms → ONLINE", color: "var(--neon-green)" },
  { time: "MEM", msg: "MemoryEngine: 5 registros restaurados", color: "var(--neon-purple)" },
  { time: "SYNC", msg: "SyncEngine: token de sesión generado", color: "var(--neon-orange, #ff9100)" },
  { time: "READY", msg: "Sistema listo — todos los nodos operativos", color: "#ffd740" },
];

export function UniversoModule() {
  const [logLines, setLogLines] = useState(0);
  const [voiceActive, setVoiceActive] = useState(false);
  const [nodes, setNodes] = useState(NODE_STATES);
  const [token, setToken] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState("");

  useEffect(() => {
    let i = 0;
    const id = setInterval(() => {
      i++;
      setLogLines(i);
      if (i >= BOOT_LOG.length) clearInterval(id);
    }, 150);
    return () => clearInterval(id);
  }, []);

  useEffect(() => {
    const id = setInterval(() => {
      setNodes((prev) => {
        const next = { ...prev };
        (Object.keys(next) as ModuleId[]).forEach((k) => {
          if (k !== "universo") {
            next[k] = {
              ...next[k],
              latency: Math.max(1, next[k].latency + Math.round((Math.random() - 0.45) * 4)),
            };
          }
        });
        return next;
      });
    }, 2500);
    return () => clearInterval(id);
  }, []);

  const generateToken = () => {
    const t = "HBG-" + Math.random().toString(36).substring(2, 10).toUpperCase();
    setToken(t);
    setSyncMsg("Token generado — comparte para vincular dispositivo");
    setTimeout(() => setSyncMsg(""), 4000);
  };

  const exportUniverse = () => {
    const data = {
      version: "1.0.0",
      timestamp: new Date().toISOString(),
      preferences: { estado_emocional: "Neutral", tema: "cyberpunk" },
      modulos_instalados: ["universo", "instinto", "vibra", "terminador"],
      historial: { notas: 3, canciones: 6, proyectos: 2 },
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = "universo_hbg.json";
    a.click();
    URL.revokeObjectURL(url);
    setSyncMsg("universo_hbg.json exportado correctamente");
    setTimeout(() => setSyncMsg(""), 4000);
  };

  return (
    <div>
      <div className="mod-header" style={{ "--mod-color": "var(--neon-cyan)" } as React.CSSProperties}>
        <span className="mod-icon">◈</span>
        <div className="mod-title-group">
          <div className="mod-title">HBG CORE</div>
          <div className="mod-subtitle">// conciencia del ecosistema — v1.0.0</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button
            className="hbg-btn"
            style={{
              background: voiceActive ? "rgba(255,64,129,0.2)" : "rgba(0,229,255,0.08)",
              borderColor: voiceActive ? "var(--neon-pink)" : "rgba(0,229,255,0.3)",
              color: voiceActive ? "var(--neon-pink)" : "var(--neon-cyan)",
              boxShadow: voiceActive ? "0 0 20px rgba(255,64,129,0.4)" : "none",
              animation: voiceActive ? "pulse-dot 1s infinite" : "none",
            }}
            onClick={() => setVoiceActive((v) => !v)}
          >
            {voiceActive ? "🎙 ESCUCHANDO..." : "🎙 ESCUCHA ACTIVA"}
          </button>
        </div>
      </div>

      {/* Node Network */}
      <div className="section-title">// red de nodos — estado en tiempo real</div>
      <div className="hbg-grid hbg-grid-4" style={{ gap: 10, marginBottom: 20 }}>
        {(MODULES as typeof MODULES).map((mod) => {
          const node = nodes[mod.id];
          return (
            <div
              key={mod.id}
              className="hbg-card hbg-card-accent"
              style={{
                "--card-color": node.connected ? mod.color : "var(--text-muted)",
                cursor: mod.id !== "universo" ? "pointer" : "default",
              } as React.CSSProperties}
              onClick={() => mod.id !== "universo" && hbgCore.setModule(mod.id)}
            >
              <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                <div
                  style={{
                    width: 8,
                    height: 8,
                    borderRadius: "50%",
                    background: node.connected ? mod.color : "var(--text-muted)",
                    boxShadow: node.connected ? `0 0 8px ${mod.color}` : "none",
                    animation: node.connected ? "pulse-dot 2s infinite" : "none",
                  }}
                />
                <span
                  style={{
                    fontFamily: "var(--font-display)",
                    fontSize: 9,
                    fontWeight: 700,
                    letterSpacing: "0.12em",
                    color: node.connected ? mod.color : "var(--text-muted)",
                  }}
                >
                  {mod.label}
                </span>
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                {node.connected
                  ? mod.id === "universo"
                    ? "LOCAL • HOST"
                    : `${node.latency}ms • ONLINE`
                  : "⚫ DESCONECTADO"}
              </div>
              <span
                className="hbg-badge"
                style={{
                  marginTop: 8,
                  display: "inline-flex",
                  background: node.connected ? `${mod.color}12` : "rgba(255,255,255,0.04)",
                  borderColor: node.connected ? `${mod.color}40` : "var(--border-dim)",
                  color: node.connected ? mod.color : "var(--text-muted)",
                }}
              >
                {node.connected ? "🟢 ONLINE" : "⚫ OFFLINE"}
              </span>
            </div>
          );
        })}
      </div>

      {/* Memory */}
      <div className="hbg-grid hbg-grid-2" style={{ gap: 12, marginBottom: 20 }}>
        <div className="hbg-card">
          <div className="section-title">// memoria del ecosistema</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {MEMORY_ITEMS.map((item) => (
              <div
                key={item.key}
                style={{
                  display: "flex",
                  justifyContent: "space-between",
                  alignItems: "center",
                  padding: "6px 0",
                  borderBottom: "1px solid var(--border-dim)",
                }}
              >
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                  {item.key}
                </span>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: item.color }}>
                  {item.value}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Sync */}
        <div className="hbg-card">
          <div className="section-title">// sincronización</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button className="hbg-btn hbg-btn-primary w-full" onClick={generateToken}>
              ⬡ GENERAR TOKEN
            </button>
            <button className="hbg-btn hbg-btn-ghost w-full">
              🔗 VINCULAR DISPOSITIVO
            </button>
            <button className="hbg-btn hbg-btn-ghost w-full">
              ♻ RESTAURAR ECOSISTEMA
            </button>
            <button className="hbg-btn hbg-btn-success w-full" onClick={exportUniverse}>
              ↓ EXPORTAR UNIVERSO
            </button>
          </div>
          {token && (
            <div
              style={{
                marginTop: 10,
                padding: "8px 10px",
                background: "var(--bg-deep)",
                border: "1px solid var(--neon-cyan)",
                borderRadius: 3,
                fontFamily: "var(--font-mono)",
                fontSize: 12,
                color: "var(--neon-cyan)",
                letterSpacing: "0.1em",
                textAlign: "center",
              }}
            >
              {token}
            </div>
          )}
          {syncMsg && (
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--neon-green)", marginTop: 8 }}>
              ✓ {syncMsg}
            </div>
          )}
        </div>
      </div>

      {/* Module quick links */}
      <div className="section-title">// módulos del ecosistema</div>
      <div className="hbg-grid hbg-grid-2" style={{ gap: 10, marginBottom: 20 }}>
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
            <div style={{ flex: 1 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, letterSpacing: "0.12em", color: mod.color }}>
                {mod.label}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                {mod.description}
              </div>
            </div>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--neon-green)" }}>
              ABRIR →
            </span>
          </div>
        ))}
      </div>

      {/* Boot log */}
      <div className="section-title">// log de arranque</div>
      <div
        className="hbg-card"
        style={{ fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 1.9, background: "var(--bg-deep)" }}
      >
        {BOOT_LOG.slice(0, logLines).map((e, i) => (
          <div key={i} style={{ display: "flex", gap: 12 }}>
            <span style={{ color: "var(--text-muted)", minWidth: 44 }}>[{e.time}]</span>
            <span style={{ color: e.color }}>{e.msg}</span>
          </div>
        ))}
        {logLines < BOOT_LOG.length && (
          <span style={{ color: "var(--neon-cyan)" }}>▌</span>
        )}
      </div>
    </div>
  );
}
