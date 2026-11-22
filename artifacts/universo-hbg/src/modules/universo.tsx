import { useState, useEffect, useRef } from "react";
import { hbgCore, MODULES, type ModuleId } from "../core/hbgCore";
import { UniversoScreen } from "../components/UniversoScreen";
import { parseIntent } from "../voice/intentParser";
import { executeVoiceAction } from "../voice/actionExecutor";

type ViewMode = "core" | "memoria" | "mood" | "recomendaciones" | "nodos" | "sincronizacion" | "universo";

type MoodState = "relajado" | "feliz" | "nostalgico" | "triste" | "energia" | "enfocado" | "neutral";

interface ChatMessage {
  from: "user" | "core";
  text: string;
  time: string;
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

const MOOD_TO_MUSIC: Record<MoodState, string> = {
  relajado: "chill",
  feliz: "happy",
  nostalgico: "nostalgia",
  triste: "sad",
  energia: "party",
  enfocado: "focus",
  neutral: "normal",
};

const MEMORY_COLORS = [
  "var(--neon-purple)",
  "var(--neon-cyan)",
  "var(--neon-pink)",
  "var(--neon-green)",
  "#ff9100",
];

export function UniversoModule() {
  const [view, setView] = useState<ViewMode>("core");
  const [mood, setMood] = useState<MoodState>(() => {
    const saved = hbgCore.recall<MoodState>("core.mood");
    return typeof saved === "string" && saved in MOOD_PROFILES ? saved : "enfocado";
  });
  const [chatInput, setChatInput] = useState("");
  const [processing, setProcessing] = useState(false);
  const [messages, setMessages] = useState<ChatMessage[]>([
    { from: "core", text: "HBG CORE está conectado al enrutador local. Puedo navegar módulos y ejecutar las acciones que estén registradas. No hay un modelo generativo externo configurado.", time: new Date().toLocaleTimeString("es-ES", { hour12: false, hour: "2-digit", minute: "2-digit" }) },
  ]);
  const [memory, setMemory] = useState<Record<string, unknown>>(() => hbgCore.getMemorySnapshot());
  const [registeredActions, setRegisteredActions] = useState<string[]>(() => hbgCore.getRegisteredActions());
  const [activeNode, setActiveNode] = useState<ModuleId>(() => hbgCore.getModule());
  const [memoryKey, setMemoryKey] = useState("");
  const [memoryValue, setMemoryValue] = useState("");
  const [syncMsg, setSyncMsg] = useState("");
  const memoryFileRef = useRef<HTMLInputElement>(null);
  const chatRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLInputElement>(null);

  const moodProfile = MOOD_PROFILES[mood];
  const memoryEntries = Object.entries(memory);
  const recommendations = [
    { type: "CAPACIDADES", text: `${registeredActions.length} acciones locales están registradas en este momento.`, icon: "◎", color: "var(--neon-cyan)" },
    { type: "MEMORIA", text: `${memoryEntries.length} recuerdos están guardados en HBG CORE.`, icon: "◈", color: "var(--neon-purple)" },
    { type: "MÓDULO ACTIVO", text: `${hbgCore.getModuleConfig(activeNode).label} es el módulo seleccionado.`, icon: "⬡", color: "var(--neon-green)" },
  ];

  useEffect(() => {
    if (chatRef.current) chatRef.current.scrollTop = chatRef.current.scrollHeight;
  }, [messages]);

  useEffect(() => {
    hbgCore.init();
    const unsubscribeMemory = hbgCore.subscribeMemory(() => {
      setMemory(hbgCore.getMemorySnapshot());
    });
    const unsubscribeActions = hbgCore.subscribeActions(setRegisteredActions);
    const unsubscribeModule = hbgCore.subscribe(setActiveNode);
    setMemory(hbgCore.getMemorySnapshot());
    setRegisteredActions(hbgCore.getRegisteredActions());
    setActiveNode(hbgCore.getModule());
    return () => {
      unsubscribeMemory();
      unsubscribeActions();
      unsubscribeModule();
    };
  }, []);

  const sendMessage = (text?: string) => {
    const input = text ?? chatInput.trim();
    if (!input || processing) return;
    const time = new Date().toLocaleTimeString("es-ES", { hour12: false, hour: "2-digit", minute: "2-digit" });
    setMessages((prev) => [...prev, { from: "user", text: input, time }]);
    setChatInput("");
    setProcessing(true);

    void (async () => {
      let response = "";
      try {
        const action = parseIntent(input);
        switch (action.type) {
          case "GREETING":
            response = "Hola. Estoy listo para navegar el Universo HBG y ejecutar las capacidades locales conectadas.";
            break;
          case "CAPABILITIES":
            response = `Módulos públicos: ${MODULES.filter((module) => module.id !== "terminador").map((module) => module.label).join(", ")}. Acciones registradas ahora: ${registeredActions.length ? registeredActions.join(", ") : "ninguna"}.`;
            break;
          case "APP_INFO": {
            const module = hbgCore.getModuleConfig(action.module);
            response = `${module.label}: ${module.description}.`;
            break;
          }
          case "NAVIGATE":
            response = `Abriendo ${hbgCore.getModuleConfig(action.module).label}.`;
            break;
          case "CREATE_SONG":
            response = `Abriendo INSTINTO. La letra "${action.title}" no se ha creado todavía; entra en LETRAS para crearla y guardarla.`;
            break;
          case "BLOCKED_DEVELOPMENT":
            response = "Esa operación requiere una sesión de desarrollo autorizada. El chat de uso normal no puede modificar código, permisos ni despliegues.";
            break;
          case "UNKNOWN":
            response = "No tengo un modelo generativo conectado. Puedo interpretar comandos compatibles, mostrar capacidades y ejecutar acciones registradas; prueba «capacidades», «abre Instinto», «pausa» o «activa modo fiesta».";
            break;
          default:
            if (action.type === "SET_MOOD") {
              const matched = (Object.entries(MOOD_TO_MUSIC) as [MoodState, string][]).find(([, value]) => value === action.mood)?.[0];
              if (matched) {
                setMood(matched);
                hbgCore.remember("core.mood", matched);
              }
            }
            response = await executeVoiceAction(action);
        }
      } catch (cause) {
        response = cause instanceof Error ? cause.message : "No se pudo procesar la solicitud.";
      }

      const responseTime = new Date().toLocaleTimeString("es-ES", { hour12: false, hour: "2-digit", minute: "2-digit" });
      setMessages((prev) => [...prev, { from: "core", text: response, time: responseTime }]);
      setProcessing(false);

      const navigationAction = parseIntent(input);
      if (navigationAction.type === "NAVIGATE") hbgCore.setModule(navigationAction.module);
      if (navigationAction.type === "CREATE_SONG") hbgCore.setModule("instinto");
    })();
  };

  const saveMemory = () => {
    const key = memoryKey.trim();
    const value = memoryValue.trim();
    if (!key || !value || key.length > 100) return;
    hbgCore.remember(key, value);
    setMemoryKey("");
    setMemoryValue("");
  };

  const exportCoreBackup = () => {
    const data = {
      format: "hbg-core-memory-v1",
      exportedAt: new Date().toISOString(),
      activeModule: hbgCore.getModule(),
      memory: hbgCore.getMemorySnapshot(),
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = "hbg-core-memory.json";
    anchor.click();
    URL.revokeObjectURL(url);
    setSyncMsg("Respaldo de memoria HBG CORE exportado.");
  };

  const restoreCoreBackup = async (file?: File) => {
    if (!file) return;
    try {
      const parsed: unknown = JSON.parse(await file.text());
      if (
        typeof parsed !== "object" ||
        parsed === null ||
        Array.isArray(parsed) ||
        !("format" in parsed) ||
        parsed.format !== "hbg-core-memory-v1" ||
        !("memory" in parsed) ||
        typeof parsed.memory !== "object" ||
        parsed.memory === null ||
        Array.isArray(parsed.memory)
      ) {
        throw new Error("El archivo no es un respaldo válido de HBG CORE.");
      }
      const entries = Object.entries(parsed.memory);
      if (entries.length > 500 || entries.some(([key]) => !key.trim() || key.length > 100)) {
        throw new Error("El respaldo supera los límites permitidos.");
      }
      if (!window.confirm("¿Reemplazar la memoria local de HBG CORE con este respaldo?")) return;
      hbgCore.clearMemory();
      entries.forEach(([key, value]) => hbgCore.remember(key, value));
      setSyncMsg(`Memoria restaurada: ${entries.length} registros.`);
    } catch (cause) {
      setSyncMsg(cause instanceof Error ? cause.message : "No se pudo restaurar la memoria.");
    } finally {
      if (memoryFileRef.current) memoryFileRef.current.value = "";
    }
  };

  const applyMood = async (nextMood: MoodState) => {
    setMood(nextMood);
    hbgCore.remember("core.mood", nextMood);
    const result = await hbgCore.dispatchAction(
      "music.mood",
      { mode: MOOD_TO_MUSIC[nextMood] },
      { timeoutMs: 3000 },
    );
    setSyncMsg(
      result.success
        ? `Modo ${MOOD_PROFILES[nextMood].label} aplicado en VIBRA.`
        : `Modo guardado en CORE; VIBRA no confirmó el cambio: ${result.error ?? "sin respuesta"}.`,
    );
  };

  const QUICK_CMDS = ["reproduce música relajante", "abre Instinto", "capacidades", "activa modo fiesta"];

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
          <div className="mod-subtitle">// orquestación local — comandos, memoria y módulos conectados</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
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
            <button className="hbg-btn hbg-btn-primary" onClick={() => sendMessage()} disabled={!chatInput.trim() || processing}>{processing ? "PROCESANDO..." : "ENVIAR"}</button>
          </div>
        </div>
      )}

      {/* MEMORIA */}
      {view === "memoria" && (
        <div>
          <div className="section-title">// memory core — recuerdos locales reales</div>
          <div className="hbg-card" style={{ marginBottom: 12 }}>
            <input
              className="hbg-input"
              placeholder="Clave del recuerdo..."
              value={memoryKey}
              maxLength={100}
              onChange={(event) => setMemoryKey(event.target.value)}
              style={{ marginBottom: 8 }}
            />
            <textarea
              className="hbg-input hbg-textarea"
              placeholder="Contenido del recuerdo..."
              value={memoryValue}
              maxLength={4000}
              rows={3}
              onChange={(event) => setMemoryValue(event.target.value)}
              style={{ marginBottom: 8 }}
            />
            <button className="hbg-btn hbg-btn-primary" disabled={!memoryKey.trim() || !memoryValue.trim()} onClick={saveMemory}>
              + GUARDAR RECUERDO
            </button>
          </div>
          {memoryEntries.length === 0 ? (
            <div className="hbg-card" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
              // La memoria está vacía. Los datos aparecerán aquí cuando los guardes.
            </div>
          ) : (
            <div className="hbg-list" style={{ gap: 8 }}>
              {memoryEntries.map(([key, value], index) => (
                <div key={key} className="hbg-card" style={{ padding: "12px 16px", borderColor: `${MEMORY_COLORS[index % MEMORY_COLORS.length]}20` }}>
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>{key}</span>
                    <button className="hbg-btn hbg-btn-danger" style={{ padding: "3px 7px", fontSize: 8 }} onClick={() => hbgCore.forget(key)}>OLVIDAR</button>
                  </div>
                  <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: MEMORY_COLORS[index % MEMORY_COLORS.length], marginTop: 4, overflowWrap: "anywhere" }}>
                    {typeof value === "string" ? value : JSON.stringify(value)}
                  </div>
                </div>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 8, marginTop: 14, flexWrap: "wrap" }}>
            <button className="hbg-btn hbg-btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={exportCoreBackup}>↓ EXPORTAR MEMORIA</button>
            <button className="hbg-btn hbg-btn-ghost" style={{ flex: 1, justifyContent: "center" }} onClick={() => memoryFileRef.current?.click()}>♻ RESTAURAR BACKUP</button>
            <input ref={memoryFileRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={(event) => void restoreCoreBackup(event.target.files?.[0])} />
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
                onClick={() => void applyMood(key)}
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
              <button className="hbg-btn hbg-btn-ghost" onClick={() => void applyMood(mood)}>◉ APLICAR EN VIBRA</button>
              <button className="hbg-btn hbg-btn-ghost" onClick={() => hbgCore.setModule("instinto")}>⬡ ABRIR INSTINTO</button>
            </div>
          </div>
        </div>
      )}

      {/* RECOMENDACIONES */}
      {view === "recomendaciones" && (
        <div>
          <div className="section-title">// estado real de capacidades y memoria</div>
          <div className="hbg-list" style={{ gap: 10 }}>
            {recommendations.map((rec, i) => (
              <div key={i} className="hbg-card hbg-card-accent" style={{ "--card-color": rec.color } as React.CSSProperties}>
                <div style={{ display: "flex", gap: 12, alignItems: "flex-start" }}>
                  <span style={{ fontSize: 22, color: rec.color, filter: `drop-shadow(0 0 8px ${rec.color})`, flexShrink: 0 }}>{rec.icon}</span>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: rec.color, marginBottom: 4, letterSpacing: "0.1em" }}>{rec.type.toUpperCase()}</div>
                    <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--text-primary)", lineHeight: 1.5 }}>{rec.text}</div>
                  </div>
                  <button className="hbg-btn hbg-btn-ghost" style={{ padding: "5px 10px", fontSize: 9, flexShrink: 0 }} onClick={() => setView(rec.type === "MEMORIA" ? "memoria" : "nodos")}>VER</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* NODOS */}
      {view === "nodos" && (
        <div>
          <div className="section-title">// estado de módulos — bus local</div>
          <div className="hbg-grid hbg-grid-4" style={{ gap: 10, marginBottom: 20 }}>
            {MODULES.filter((module) => module.id !== "terminador").map((module) => {
              const active = activeNode === module.id;
              const actionCount = module.id === "vibra"
                ? registeredActions.filter((name) => name.startsWith("music.")).length
                : 0;
              const detail = module.id === "vibra"
                ? `${actionCount} acciones musicales registradas`
                : active
                  ? "Módulo seleccionado"
                  : "Disponible; sin telemetría propia";
              return (
                <button
                  key={module.id}
                  className="hbg-card hbg-card-accent"
                  style={{ "--card-color": active ? module.color : "var(--text-muted)", textAlign: "left", cursor: "pointer" } as React.CSSProperties}
                  onClick={() => hbgCore.setModule(module.id)}
                >
                  <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 8 }}>
                    <div style={{ width: 8, height: 8, borderRadius: "50%", background: active ? module.color : "var(--text-muted)" }} />
                    <span style={{ fontFamily: "var(--font-display)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: active ? module.color : "var(--text-muted)" }}>{module.label}</span>
                  </div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>{detail}</div>
                  <span className="hbg-badge" style={{ marginTop: 8, display: "inline-flex", background: active ? `${module.color}12` : "rgba(255,255,255,0.04)", borderColor: active ? `${module.color}40` : "var(--border-dim)", color: active ? module.color : "var(--text-muted)" }}>
                    {active ? "SELECCIONADO" : "DISPONIBLE"}
                  </span>
                </button>
              );
            })}
          </div>
          <div className="hbg-card" style={{ fontFamily: "var(--font-mono)", fontSize: 10, lineHeight: 1.9, overflowWrap: "anywhere" }}>
            <div style={{ color: "var(--text-muted)", marginBottom: 4 }}>ACCIONES REGISTRADAS EN HBG CORE</div>
            {registeredActions.length ? registeredActions.join(" · ") : "Ninguna acción registrada en este momento."}
          </div>
        </div>
      )}

      {/* SINCRONIZACIÓN */}
      {view === "sincronizacion" && (
        <div>
          <div className="section-title">// respaldo de memoria HBG CORE</div>
          <div className="hbg-grid hbg-grid-2" style={{ gap: 12 }}>
            <div className="hbg-card" style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="hbg-btn hbg-btn-success w-full" onClick={exportCoreBackup}>↓ EXPORTAR MEMORIA CORE</button>
              <button className="hbg-btn hbg-btn-ghost w-full" onClick={() => memoryFileRef.current?.click()}>♻ RESTAURAR MEMORIA CORE</button>
              <input ref={memoryFileRef} type="file" accept=".json,application/json" style={{ display: "none" }} onChange={(event) => void restoreCoreBackup(event.target.files?.[0])} />
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                La sincronización remota y la vinculación entre dispositivos aún no están conectadas. Este respaldo contiene solo la memoria local de HBG CORE.
              </div>
            </div>
            <div className="hbg-card">
              <div className="section-title">// estado del respaldo</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>
                Registros de memoria: {memoryEntries.length}
                {"\n"}Módulo activo: {hbgCore.getModuleConfig(activeNode).label}
                {"\n"}Acciones registradas: {registeredActions.length}
              </div>
              {syncMsg && <div role="status" style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: syncMsg.startsWith("No se pudo") || syncMsg.startsWith("El archivo") ? "var(--neon-pink)" : "var(--neon-green)", marginTop: 8 }}>{syncMsg}</div>}
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