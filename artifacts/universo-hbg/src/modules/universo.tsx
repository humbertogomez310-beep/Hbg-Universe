import { useState, useEffect, useRef } from "react";
import { hbgCore, MODULES, type ModuleId } from "../core/hbgCore";
import { UniversoScreen } from "../components/UniversoScreen";

type ViewMode = "core" | "memoria" | "mood" | "recomendaciones" | "nodos" | "sincronizacion" | "universo";

type MoodState = "relajado" | "feliz" | "nostalgico" | "triste" | "energia" | "enfocado" | "neutral";

interface ChatMessage {
  from: "user" | "core";
  text: string;
  time: string;
}

interface MemoryEntry {
  key: string;
  value: string;
  color: string;
  updatedAt: string;
}

const MOOD_PROFILES: Record<MoodState, { label: string; color: string; icon: string; bpm: string; palette: string }> = {
  relajado: { label: "RELAJADO", color: "var(--neon-green)", icon: "◉", bpm: "50–75", palette: "verde frío" },
  feliz: { label: "FELIZ", color: "var(--neon-yellow, #ffd740)", icon: "◐", bpm: "100–140", palette: "amarillo cálido" },
  nostalgico: { label: "NOSTÁLGICO", color: "#b388ff", icon: "◇", bpm: "70–100", palette: "violeta suave" },
  triste: { label: "TRISTE", color: "#42a5f5", icon: "◑", bpm: "45–70", palette: "azul profundo" },
  energia: { label: "ENERGÍA", color: "var(--neon-pink)", icon: "⚡", bpm: "120–160", palette: "rosa eléctrico" },
  enfocado: { label: "ENFOCADO", color: "var(--neon-cyan)", icon: "◎", bpm: "60–90", palette: "cian frío" },
  neutral: { label: "NEUTRAL", color: "var(--neon-purple)", icon: "◆", bpm: "90–120", palette: "purpura equilibrado" },
};

const CORE_RESPONSES: Record<string, string[]> = {
  hola: ["Hola. Estoy aquí, siempre activo.", "Bienvenido de nuevo al universo HBG.", "Sistema en línea. ¿Cómo estás hoy?"],
  música: ["Puedo pedirle a Vibra Pro que cambie el modo de reproducción. ¿Qué ánimo tienes?", "¿Quieres que active el Mood Engine de Vibra Pro?", "Recuerdo que la última vez preferiste tracks de 85-90 BPM para este momento del día."],
  nota: ["Instinto está listo para recibir tus ideas. ¿Abrimos el bloc?", "Recuerdo 2 proyectos activos en Instinto. ¿Continuamos con La Voz del Lobo?", "¿Quieres que active el modo inspiración?"],
  sistema: ["El sistema está operando al 87% de salud. El sistema reporta todo estable.", "No hay errores críticos registrados en las últimas 24h.", "Todos los módulos están conectados y respondiendo."],
  modo: ["¿Qué modo prefieres? Puedo coordinar Vibra y cambiar el ambiente visual de Instinto.", "Activo modo enfoque: Vibra cambiará a 60–90 BPM y Instinto a tema azul.", "¿Modo fiesta o modo trabajo profundo?"],
  default: [
    "Entiendo. Procesa eso y dime qué necesitas.",
    "Memoria registrada. ¿Hay algo más en lo que pueda ayudarte?",
    "Interesante. Guardo eso en el historial del ecosistema.",
    "Recibido. Los módulos están atentos a tus cambios de estado.",
    "El universo HBG está escuchando.",
  ],
};

function getCoreResponse(input: string): string {
  const lower = input.toLowerCase();
  if (lower.includes("hola") || lower.includes("hey") || lower.includes("buenas")) {
    const arr = CORE_RESPONSES.hola;
    return arr[Math.floor(Math.random() * arr.length)];
  }
  if (lower.includes("músi") || lower.includes("vibra") || lower.includes("canción") || lower.includes("song")) {
    const arr = CORE_RESPONSES.música;
    return arr[Math.floor(Math.random() * arr.length)];
  }
  if (lower.includes("nota") || lower.includes("instinto") || lower.includes("letra") || lower.includes("idea")) {
    const arr = CORE_RESPONSES.nota;
    return arr[Math.floor(Math.random() * arr.length)];
  }
  if (lower.includes("sistema") || lower.includes("terminador") || lower.includes("salud")) {
    const arr = CORE_RESPONSES.sistema;
    return arr[Math.floor(Math.random() * arr.length)];
  }
  if (lower.includes("modo") || lower.includes("fiest") || lower.includes("enfoque") || lower.includes("relaj")) {
    const arr = CORE_RESPONSES.modo;
    return arr[Math.floor(Math.random() * arr.length)];
  }
  const arr = CORE_RESPONSES.default;
  return arr[Math.floor(Math.random() * arr.length)];
}

const RECOMMENDATIONS = [
  { type: "Canción", text: "Deep Neural Flow — coincide con tu mood actual (Enfocado, 85 BPM)", icon: "♫", color: "var(--neon-pink)" },
  { type: "Proyecto", text: "Continúa con 'La Voz del Lobo' — lleva 3 días sin actualización", icon: "⬡", color: "var(--neon-cyan)" },
  { type: "Modo", text: "Activa Modo Focus en Vibra — son las 17:39, hora de alta productividad", icon: "◎", color: "var(--neon-green)" },
  { type: "Memoria", text: "Tu patrón creativo es más alto los lunes y miércoles por la tarde", icon: "◈", color: "var(--neon-purple)" },
];

const DEFAULT_MEMORY: MemoryEntry[] = [
  { key: "estado_emocional", value: "Neutral", color: "var(--neon-purple)", updatedAt: "Hace 10min" },
  { key: "modo_favorito", value: "Enfocado", color: "var(--neon-cyan)", updatedAt: "Ayer" },
  { key: "cancion_favorita", value: "Deep Neural Flow", color: "var(--neon-pink)", updatedAt: "Hace 2h" },
  { key: "proyecto_activo", value: "La Voz del Lobo", color: "var(--neon-cyan)", updatedAt: "Hace 3 días" },
  { key: "hora_pico_creativo", value: "17:00–20:00", color: "#ff9100", updatedAt: "Esta semana" },
  { key: "genero_favorito", value: "Lofi / Indie", color: "var(--neon-green)", updatedAt: "Siempre" },
];

const NODE_STATES: Record<ModuleId, { connected: boolean; latency: number }> = {
  universo: { connected: true, latency: 0 },
  instinto: { connected: true, latency: 12 },
  vibra: { connected: true, latency: 8 },
  terminador: { connected: true, latency: 23 },
};

export function UniversoModule() {
  const [view, setView] = useState<ViewMode>("core");
  const [mood, setMood] = useState<MoodState>("enfocado");
  const [chatInput, setChatInput] = useState("");
  const [messages, setMessages] = useState<ChatMessage[]>([
    { from: "core", text: "Sistema HBG CORE activo. Todos los módulos conectados. ¿En qué puedo ayudarte hoy?", time: new Date().toLocaleTimeString("es-ES", { hour12: false, hour: "2-digit", minute: "2-digit" }) },
  ]);
  const [nodes, setNodes] = useState(NODE_STATES);
  const [token, setToken] = useState<string | null>(null);
  const [syncMsg, setSyncMsg] = useState("");
  const [memory] = useState<MemoryEntry[]>(DEFAULT_MEMORY);
  const [voiceActive, setVoiceActive] = useState(false);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const moodProfile = MOOD_PROFILES[mood];

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    const id = setInterval(() => {
      setNodes((prev) => {
        const next = { ...prev };
        (Object.keys(next) as ModuleId[]).forEach((k) => {
          if (k !== "universo") next[k] = { ...next[k], latency: Math.max(1, next[k].latency + Math.round((Math.random() - 0.45) * 4)) };
        });
        return next;
      });
    }, 2500);
    return () => clearInterval(id);
  }, []);

  const sendMessage = (text?: string) => {
    const input = text ?? chatInput.trim();
    if (!input) return;
    const t = new Date().toLocaleTimeString("es-ES", { hour12: false, hour: "2-digit", minute: "2-digit" });
    setMessages((prev) => [...prev, { from: "user", text: input, time: t }]);
    setChatInput("");
    setTimeout(() => {
      const resp = getCoreResponse(input);
      setMessages((prev) => [...prev, { from: "core", text: resp, time: new Date().toLocaleTimeString("es-ES", { hour12: false, hour: "2-digit", minute: "2-digit" }) }]);
    }, 700 + Math.random() * 400);
  };

  const generateToken = () => {
    const t = "HBG-" + Math.random().toString(36).substring(2, 10).toUpperCase();
    setToken(t); setSyncMsg("Token generado — comparte para vincular dispositivo");
    setTimeout(() => setSyncMsg(""), 4000);
  };

  const exportUniverse = () => {
    const data = { version: "1.0.0", timestamp: new Date().toISOString(), preferences: { estado_emocional: mood, tema: "cyberpunk" }, modulos_instalados: ["universo", "instinto", "vibra"], historial: { notas: 3, canciones: 6, proyectos: 2 } };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "universo_hbg.json"; a.click();
    URL.revokeObjectURL(url);
    setSyncMsg("universo_hbg.json exportado");
    setTimeout(() => setSyncMsg(""), 4000);
  };

  const QUICK_CMDS = ["reproduce música relajante", "abre Instinto", "¿cómo está el sistema?", "activa modo fiesta"];

  const NAV_ITEMS: { id: ViewMode; label: string; icon: string }[] = [
    { id: "core", label: "CORE IA", icon: "◈" },
    { id: "memoria", label: "MEMORIA", icon: "▣" },
    { id: "mood", label: "MOOD", icon: "◆" },
    { id: "recomendaciones", label: "RECOMENDACIONES", icon: "◎" },
    { id: "nodos", label: "NODOS", icon: "⬡" },
    { id: "sincronizacion", label: "SINCRONIZACIÓN", icon: "⟳" },
    { id: "universo", label: "UNIVERSO HBG", icon: "⬢" },
  ];

  return (
    <div>
      <div className="mod-header" style={{ "--mod-color": "var(--neon-purple)" } as React.CSSProperties}>
        <span className="mod-icon">◈</span>
        <div className="mod-title-group">
          <div className="mod-title">HBG CORE</div>
          <div className="mod-subtitle">// conciencia del ecosistema — personalidad activa</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button
            className="hbg-btn"
            style={{ background: voiceActive ? "rgba(255,64,129,0.2)" : "rgba(124,77,255,0.08)", borderColor: voiceActive ? "var(--neon-pink)" : "rgba(124,77,255,0.3)", color: voiceActive ? "var(--neon-pink)" : "var(--neon-purple)", boxShadow: voiceActive ? "0 0 20px rgba(255,64,129,0.4)" : "none" }}
            onClick={() => setVoiceActive((v) => !v)}
          >
            {voiceActive ? "🎙 ESCUCHANDO..." : "🎙 VOZ"}
          </button>
          <span className="hbg-badge" style={{ background: `${moodProfile.color}15`, borderColor: `${moodProfile.color}50`, color: moodProfile.color }}>
            {moodProfile.icon} {moodProfile.label}
          </span>
        </div>
      </div>

      {/* Sub-nav */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20, background: "var(--bg-deep)", padding: 4, borderRadius: 4, border: "1px solid var(--border-dim)", flexWrap: "wrap" }}>
        {NAV_ITEMS.map((n) => (
          <button key={n.id} onClick={() => setView(n.id)}
            style={{ flex: 1, minWidth: 70, padding: "7px 4px", fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.06em", background: view === n.id ? "rgba(124,77,255,0.15)" : "transparent", border: `1px solid ${view === n.id ? "var(--neon-purple)" : "transparent"}`, borderRadius: 3, color: view === n.id ? "var(--neon-purple)" : "var(--text-muted)", cursor: "pointer", boxShadow: view === n.id ? "0 0 10px rgba(124,77,255,0.2)" : "none", transition: "all 0.15s" }}>
            {n.label}
          </button>
        ))}
      </div>

      {/* CORE IA — Chat */}
      {view === "core" && (
        <div>
          <div
            ref={chatRef}
            style={{ height: 300, overflowY: "auto", display: "flex", flexDirection: "column", gap: 12, padding: "12px 0", marginBottom: 14 }}
          >
            {messages.map((msg, i) => (
              <div key={i} style={{ display: "flex", flexDirection: msg.from === "user" ? "row-reverse" : "row", gap: 10, alignItems: "flex-end" }}>
                {msg.from === "core" && (
                  <div style={{ width: 28, height: 28, borderRadius: "50%", background: "rgba(124,77,255,0.2)", border: "1px solid var(--neon-purple)", display: "flex", alignItems: "center", justifyContent: "center", fontSize: 12, flexShrink: 0 }}>◈</div>
                )}
                <div
                  style={{
                    maxWidth: "70%", padding: "9px 14px", borderRadius: msg.from === "user" ? "10px 10px 2px 10px" : "2px 10px 10px 10px",
                    background: msg.from === "user" ? "rgba(0,229,255,0.1)" : "rgba(124,77,255,0.12)",
                    border: `1px solid ${msg.from === "user" ? "rgba(0,229,255,0.25)" : "rgba(124,77,255,0.25)"}`,
                    fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--text-primary)", lineHeight: 1.6,
                  }}
                >
                  {msg.from === "core" && (
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--neon-purple)", marginBottom: 4, letterSpacing: "0.1em" }}>HBG CORE</div>
                  )}
                  {msg.text}
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)", marginTop: 4, textAlign: "right" }}>{msg.time}</div>
                </div>
              </div>
            ))}
          </div>

          {/* Quick commands */}
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
            {QUICK_CMDS.map((cmd) => (
              <button key={cmd} className="hbg-badge" style={{ cursor: "pointer", fontFamily: "var(--font-mono)", fontSize: 9, padding: "5px 10px" }} onClick={() => sendMessage(cmd)}>
                {cmd}
              </button>
            ))}
          </div>

          <div style={{ display: "flex", gap: 8 }}>
            <input
              ref={inputRef}
              className="hbg-input"
              placeholder="Habla con HBG Core..."
              value={chatInput}
              onChange={(e) => setChatInput(e.target.value)}
              onKeyDown={(e) => e.key === "Enter" && sendMessage()}
              style={{ flex: 1 }}
            />
            <button className="hbg-btn hbg-btn-primary" onClick={() => sendMessage()} disabled={!chatInput.trim()}>ENVIAR</button>
          </div>
        </div>
      )}

      {/* MEMORIA */}
      {view === "memoria" && (
        <div>
          <div className="section-title">// memory core — historial del ecosistema</div>
          <div className="hbg-list" style={{ gap: 8 }}>
            {memory.map((entry) => (
              <div key={entry.key} className="hbg-card" style={{ padding: "12px 16px", borderColor: `${entry.color}20` }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>{entry.key}</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{entry.updatedAt}</span>
                </div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, color: entry.color, marginTop: 4, letterSpacing: "0.06em" }}>{entry.value}</div>
              </div>
            ))}
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
            <button className="hbg-btn hbg-btn-ghost" style={{ flex: 1, justifyContent: "center" }}>↓ EXPORTAR MEMORIA</button>
            <button className="hbg-btn hbg-btn-ghost" style={{ flex: 1, justifyContent: "center" }}>♻ RESTAURAR BACKUP</button>
          </div>
        </div>
      )}

      {/* MOOD CORE */}
      {view === "mood" && (
        <div>
          <div className="section-title">// mood core — estado emocional activo</div>
          <div className="hbg-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
            {(Object.entries(MOOD_PROFILES) as [MoodState, typeof MOOD_PROFILES[MoodState]][]).map(([key, p]) => (
              <button
                key={key}
                className="hbg-card"
                style={{ cursor: "pointer", textAlign: "left", padding: "12px 14px", border: `1px solid ${mood === key ? p.color : "var(--border-dim)"}`, background: mood === key ? `${p.color}10` : "var(--bg-card)", boxShadow: mood === key ? `0 0 16px ${p.color}25` : "none" }}
                onClick={() => setMood(key)}
              >
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 16, color: p.color, filter: mood === key ? `drop-shadow(0 0 6px ${p.color})` : "none" }}>{p.icon}</span>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: mood === key ? p.color : "var(--text-secondary)" }}>{p.label}</span>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{p.bpm} BPM</div>
              </button>
            ))}
          </div>
          <div className="hbg-card hbg-card-accent" style={{ "--card-color": moodProfile.color } as React.CSSProperties}>
            <div style={{ display: "flex", gap: 20, alignItems: "center" }}>
              <span style={{ fontSize: 40, color: moodProfile.color, filter: `drop-shadow(0 0 12px ${moodProfile.color})` }}>{moodProfile.icon}</span>
              <div>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 18, fontWeight: 900, color: moodProfile.color, letterSpacing: "0.1em" }}>{moodProfile.label}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", marginTop: 4 }}>BPM sugerido: {moodProfile.bpm}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>Paleta visual: {moodProfile.palette}</div>
              </div>
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
              <button className="hbg-btn hbg-btn-ghost" onClick={() => hbgCore.setModule("vibra")}>◉ APLICAR EN VIBRA</button>
              <button className="hbg-btn hbg-btn-ghost" onClick={() => hbgCore.setModule("instinto")}>⬡ APLICAR EN INSTINTO</button>
            </div>
          </div>
        </div>
      )}

      {/* RECOMENDACIONES */}
      {view === "recomendaciones" && (
        <div>
          <div className="section-title">// recommendation core — basado en tu historial</div>
          <div className="hbg-list" style={{ gap: 10 }}>
            {RECOMMENDATIONS.map((rec, i) => (
              <div key={i} className="hbg-card hbg-card-accent" style={{ "--card-color": rec.color } as React.CSSProperties}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 22, color: rec.color, filter: `drop-shadow(0 0 8px ${rec.color})`, flexShrink: 0 }}>{rec.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: rec.color, marginBottom: 4, letterSpacing: "0.1em" }}>{rec.type.toUpperCase()}</div>
                    <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}>{rec.text}</div>
                  </div>
                  <button className="hbg-btn hbg-btn-ghost" style={{ padding: "5px 10px", fontSize: 9, flexShrink: 0 }}>APLICAR</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* NODOS */}
      {view === "nodos" && (
        <div>
          <div className="section-title">// node manager — red en tiempo real</div>
          <div className="hbg-grid hbg-grid-4" style={{ gap: 10, marginBottom: 20 }}>
            {MODULES.filter((mod) => mod.id !== "terminador").map((mod) => {
              const node = nodes[mod.id];
              return (
                <div key={mod.id} className="hbg-card hbg-card-accent" style={{ "--card-color": node.connected ? mod.color : "var(--text-muted)", cursor: mod.id !== "universo" ? "pointer" : "default" } as React.CSSProperties} onClick={() => mod.id !== "universo" && hbgCore.setModule(mod.id)}>
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: node.connected ? mod.color : "var(--text-muted)", boxShadow: node.connected ? `0 0 8px ${mod.color}` : "none", animation: node.connected ? "pulse-dot 2s infinite" : "none" }} />
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: node.connected ? mod.color : "var(--text-muted)" }}>{mod.label}</span>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                    {node.connected ? (mod.id === "universo" ? "LOCAL • HOST" : `${node.latency}ms • ONLINE`) : "⚫ OFFLINE"}
                  </div>
                  <span className="hbg-badge" style={{ marginTop: 8, display: "inline-flex", background: node.connected ? `${mod.color}12` : "rgba(255,255,255,0.04)", borderColor: node.connected ? `${mod.color}40` : "var(--border-dim)", color: node.connected ? mod.color : "var(--text-muted)" }}>
                    {node.connected ? "🟢 ONLINE" : "⚫ OFFLINE"}
                  </span>
                </div>
              );
            })}
          </div>
          <div className="hbg-card" style={{ fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 2 }}>
            <div style={{ display: "flex", gap: 12 }}><span style={{ color: "var(--text-muted)", minWidth: 44 }}>[NET]</span><span style={{ color: "var(--neon-green)" }}>Share Engine: bus de mensajes activo</span></div>
            <div style={{ display: "flex", gap: 12 }}><span style={{ color: "var(--text-muted)", minWidth: 44 }}>[NODE]</span><span style={{ color: "var(--neon-pink)" }}>VIBRA PRO → {nodes.vibra.latency}ms → ONLINE</span></div>
            <div style={{ display: "flex", gap: 12 }}><span style={{ color: "var(--text-muted)", minWidth: 44 }}>[NODE]</span><span style={{ color: "var(--neon-cyan)" }}>INSTINTO → {nodes.instinto.latency}ms → ONLINE</span></div>
            <div style={{ display: "flex", gap: 12 }}><span style={{ color: "var(--text-muted)", minWidth: 44 }}>[NODE]</span><span style={{ color: "var(--neon-green)" }}>HBG CORE → LOCAL → ONLINE</span></div>
          </div>
        </div>
      )}

      {/* SINCRONIZACIÓN */}
      {view === "sincronizacion" && (
        <div>
          <div className="section-title">// sync core — conexión y respaldo</div>
          <div className="hbg-grid hbg-grid-2" style={{ gap: 12 }}>
            <div className="hbg-card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="hbg-btn hbg-btn-primary w-full" onClick={generateToken}>⬡ GENERAR TOKEN</button>
              <button className="hbg-btn hbg-btn-ghost w-full">🔗 VINCULAR DISPOSITIVO</button>
              <button className="hbg-btn hbg-btn-ghost w-full">♻ RESTAURAR ECOSISTEMA</button>
              <button className="hbg-btn hbg-btn-success w-full" onClick={exportUniverse}>↓ EXPORTAR UNIVERSO</button>
            </div>
            <div className="hbg-card">
              {token && (
                <div>
                  <div className="section-title">// token generado</div>
                  <div style={{ padding: "10px", background: "var(--bg-deep)", border: "1px solid var(--neon-purple)", borderRadius: 3, fontFamily: "var(--font-mono)", fontSize: 14, color: "var(--neon-purple)", letterSpacing: "0.1em", textAlign: "center" }}>{token}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 8 }}>Válido por 24 horas</div>
                </div>
              )}
              {syncMsg && <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--neon-green)", marginTop: 8 }}>✓ {syncMsg}</div>}
              {!token && !syncMsg && <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>// genera un token para vincular dispositivos</div>}
            </div>
          </div>
        </div>
      )}

      {/* UNIVERSO HBG */}
      {view === "universo" && (
        <UniversoScreen currentApp="universo" appColor="var(--neon-purple)" mood={mood} />
      )}
    </div>
  );
}