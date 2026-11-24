import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { useVoiceCapture } from "./useVoiceCapture";
import { interpretUtterance } from "./lingua";
import { executeVoiceAction } from "./actionExecutor";
import { beginVoiceAudioSession } from "../core/audioManager";
import { VOICE_COMMAND_CATALOG } from "./voiceCommandCatalog";
import {
  clampVoiceWidgetPosition,
  isPersistentVoiceError,
  readVoiceWidgetPosition,
  VOICE_RESPONSE_DISMISS_MS,
  VOICE_WIDGET_POSITION_STORAGE_KEY,
  type VoiceWidgetPosition,
} from "./voiceCommandUi";

const SPEECH_WATCHDOG_MS = 60_000;

function getInitialWidgetPosition(): VoiceWidgetPosition {
  const viewport = {
    width: typeof window === "undefined" ? 1024 : window.innerWidth,
    height: typeof window === "undefined" ? 768 : window.innerHeight,
  };
  let stored: string | null = null;
  try {
    stored = typeof window === "undefined"
      ? null
      : window.localStorage.getItem(VOICE_WIDGET_POSITION_STORAGE_KEY);
  } catch {
    // Position persistence is optional; use a safe visible default.
  }
  return readVoiceWidgetPosition(stored, viewport);
}

export function VoiceCommandBar({ accentColor }: { accentColor: string }) {
  const [processing, setProcessing] = useState(false);
  const processingRef = useRef(false);
  const [lastRecognizedText, setLastRecognizedText] = useState<string | null>(null);
  const [lastResponseText, setLastResponseText] = useState<string | null>(null);
  const [persistentError, setPersistentError] = useState<string | null>(null);
  const [dismissedError, setDismissedError] = useState(false);
  const [widgetPosition, setWidgetPosition] = useState<VoiceWidgetPosition>(getInitialWidgetPosition);
  const dragRef = useRef<{
    pointerId: number;
    startX: number;
    startY: number;
    originX: number;
    originY: number;
  } | null>(null);
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [speechEnabled, setSpeechEnabled] = useState(() => {
    try {
      return localStorage.getItem("hbg_vibra_voice_speech_enabled") !== "false";
    } catch {
      return true;
    }
  });

  const speak = useCallback(
    (text: string): Promise<void> => {
      if (!speechEnabled) return Promise.resolve();
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return Promise.resolve();
      return new Promise((resolve) => {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "es-ES";
        let settled = false;
        let watchdog: number | null = null;
        const finish = () => {
          if (settled) return;
          settled = true;
          if (watchdog !== null) window.clearTimeout(watchdog);
          resolve();
        };
        utterance.onend = finish;
        utterance.onerror = finish;
        watchdog = window.setTimeout(finish, SPEECH_WATCHDOG_MS);
        try {
          window.speechSynthesis.speak(utterance);
        } catch {
          finish();
        }
      });
    },
    [speechEnabled]
  );

  const handleResult = useCallback(
    async (text: string) => {
      if (processingRef.current) {
        setLastResponseText("Estoy procesando la orden anterior; espera un momento.");
        return;
      }
      processingRef.current = true;
      setLastRecognizedText(text);
      setLastResponseText(null);
      setPersistentError(null);
      setDismissedError(false);
      setProcessing(true);
      try {
        const interpretation = interpretUtterance(text);
        const response = await executeVoiceAction(interpretation.action);
        if (isPersistentVoiceError(response)) {
          setPersistentError(response);
        } else {
          setLastResponseText(response);
        }
        await speak(response);
      } catch (cause) {
        const message = cause instanceof Error ? cause.message : "Falló la ejecución de la orden.";
        setPersistentError(message);
      } finally {
        processingRef.current = false;
        setProcessing(false);
      }
    },
    [speak]
  );

  const { supported, listening, error, start, cancel } = useVoiceCapture(handleResult);

  // Keep app-owned audio ducked across capture, command execution and spoken response.
  // The manager restores the user's persistent volume when the complete voice session ends.
  const voiceSessionActive = listening || processing;
  useEffect(() => {
    if (!voiceSessionActive) return;
    return beginVoiceAudioSession();
  }, [voiceSessionActive]);

  useEffect(() => {
    try {
      localStorage.setItem("hbg_vibra_voice_speech_enabled", String(speechEnabled));
    } catch {
      /* unavailable */
    }
  }, [speechEnabled]);

  // Successful confirmations disappear only after the requested action has completed.
  // Recognition, permission and execution errors remain until explicitly dismissed.
  useEffect(() => {
    if (!lastResponseText || processing) return;
    const timeout = window.setTimeout(() => {
      setLastResponseText(null);
      setLastRecognizedText(null);
    }, VOICE_RESPONSE_DISMISS_MS);
    return () => window.clearTimeout(timeout);
  }, [lastResponseText, processing]);

  // Keep the floating voice controls visible after viewport changes and persist their position.
  useEffect(() => {
    const handleResize = () => {
      setWidgetPosition((current) => clampVoiceWidgetPosition(current, {
        width: window.innerWidth,
        height: window.innerHeight,
      }));
    };
    window.addEventListener("resize", handleResize);
    return () => window.removeEventListener("resize", handleResize);
  }, []);

  useEffect(() => {
    try {
      localStorage.setItem(VOICE_WIDGET_POSITION_STORAGE_KEY, JSON.stringify(widgetPosition));
    } catch {
      /* Position persistence is optional. */
    }
  }, [widgetPosition]);

  const handleMicClick = () => {
    if (!supported || processingRef.current) return;
    setPersistentError(null);
    setDismissedError(false);
    if (listening) cancel();
    else start();
  };

  const handleDragStart = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (event.button !== 0) return;
    event.preventDefault();
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture is an enhancement; pointer events still work without it.
    }
    dragRef.current = {
      pointerId: event.pointerId,
      startX: event.clientX,
      startY: event.clientY,
      originX: widgetPosition.x,
      originY: widgetPosition.y,
    };
  };

  const handleDragMove = (event: ReactPointerEvent<HTMLButtonElement>) => {
    const drag = dragRef.current;
    if (!drag || drag.pointerId !== event.pointerId) return;
    setWidgetPosition(clampVoiceWidgetPosition({
      x: drag.originX + event.clientX - drag.startX,
      y: drag.originY + event.clientY - drag.startY,
    }, {
      width: window.innerWidth,
      height: window.innerHeight,
    }));
  };

  const handleDragEnd = (event: ReactPointerEvent<HTMLButtonElement>) => {
    if (dragRef.current?.pointerId === event.pointerId) dragRef.current = null;
  };

  const visibleError = persistentError ?? error;
  const statusText = visibleError
    ? (dismissedError ? null : visibleError)
    : lastResponseText ?? lastRecognizedText;

  return (
    <div style={{
      position: "fixed",
      left: widgetPosition.x,
      top: widgetPosition.y,
      zIndex: 50,
      display: "flex",
      flexDirection: "column",
      alignItems: "flex-end",
      gap: 8,
    }}>
      {statusText && (
        <div style={{
          maxWidth: 240,
          display: "flex",
          alignItems: "flex-start",
          gap: 8,
          background: "var(--bg-card)",
          border: `1px solid ${accentColor}40`,
          borderRadius: 4,
          padding: "8px 10px",
          fontFamily: "var(--font-mono)",
          fontSize: 10,
          boxShadow: "0 8px 24px rgba(0,0,0,0.28)",
        }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            {lastRecognizedText && !visibleError && (
              <div style={{ color: "var(--text-muted)", marginBottom: 4 }}>
                &ldquo;{lastRecognizedText}&rdquo;
              </div>
            )}
            <div style={{ color: visibleError ? "var(--neon-pink)" : "var(--text-primary)" }}>
              {statusText}
            </div>
          </div>
          {visibleError && !dismissedError && (
            <button
              type="button"
              onClick={() => setDismissedError(true)}
              aria-label="Cerrar aviso de voz"
              style={{ border: 0, background: "transparent", color: "var(--text-muted)", cursor: "pointer", padding: "0 2px" }}
            >
              ✕
            </button>
          )}
        </div>
      )}
      {commandsOpen && (
        <div
          id="hbg-voice-command-catalog"
          role="dialog"
          aria-label="Catálogo de comandos de voz"
          style={{
            position: "absolute",
            right: 0,
            bottom: 64,
            width: "min(310px, calc(100vw - 24px))",
            maxHeight: "min(62vh, 480px)",
            overflowY: "auto",
            background: "var(--bg-card)",
            color: "var(--text-primary)",
            border: `1px solid ${accentColor}55`,
            borderRadius: 10,
            padding: 12,
            boxShadow: "0 12px 36px rgba(0,0,0,0.42)",
            fontFamily: "var(--font-mono)",
          }}
        >
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <strong style={{ fontSize: 12 }}>COMANDOS DE VOZ</strong>
            <button
              type="button"
              onClick={() => setCommandsOpen(false)}
              aria-label="Cerrar catálogo de comandos"
              style={{ border: 0, background: "transparent", color: "var(--text-muted)", cursor: "pointer", fontSize: 16 }}
            >
              ×
            </button>
          </div>
          <div style={{ fontSize: 10, color: "var(--text-muted)", marginBottom: 12 }}>
            Di cualquiera de estas frases después de activar el micrófono.
          </div>
          {VOICE_COMMAND_CATALOG.map((group) => (
            <section key={group.id} style={{ marginBottom: 14 }}>
              <div style={{ color: accentColor, fontSize: 11, fontWeight: 700, letterSpacing: 1 }}>
                {group.label}
              </div>
              <div style={{ color: "var(--text-muted)", fontSize: 9, margin: "3px 0 8px" }}>
                {group.description}
              </div>
              {group.commands.map((command) => (
                <div key={command.label} style={{ padding: "7px 0", borderTop: "1px solid var(--border-dim)" }}>
                  <div style={{ fontSize: 10, fontWeight: 700, marginBottom: 4 }}>{command.label}</div>
                  <div style={{ color: "var(--text-muted)", fontSize: 10, lineHeight: 1.6 }}>
                    {command.phrases.map((phrase, index) => (
                      <span key={phrase}>
                        {phrase}{index < command.phrases.length - 1 ? " · " : ""}
                      </span>
                    ))}
                  </div>
                </div>
              ))}
            </section>
          ))}
          <div style={{ color: "var(--text-muted)", fontSize: 9 }}>
            El catálogo se ampliará cuando cada nueva acción esté implementada y probada.
          </div>
        </div>
      )}
      {!supported && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", maxWidth: 150, textAlign: "right" }}>
          Voz no disponible en este navegador.
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          type="button"
          onPointerDown={handleDragStart}
          onPointerMove={handleDragMove}
          onPointerUp={handleDragEnd}
          onPointerCancel={handleDragEnd}
          aria-label="Mover controles de voz"
          title="Arrastrar para mover"
          style={{
            width: 24,
            height: 32,
            borderRadius: 16,
            border: "1px solid var(--border-dim)",
            background: "var(--bg-card)",
            color: "var(--text-muted)",
            cursor: "grab",
            touchAction: "none",
            fontSize: 14,
            padding: 0,
          }}
        >
          ⠿
        </button>
        <button
          onClick={() => setSpeechEnabled((v) => !v)}
          style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid var(--border-dim)", background: "var(--bg-card)", color: "var(--text-muted)", cursor: "pointer", fontSize: 12 }}
          aria-label="Alternar respuesta hablada"
        >
          {speechEnabled ? "🔊" : "🔇"}
        </button>
        <button
          type="button"
          onClick={() => setCommandsOpen((open) => !open)}
          aria-label="Mostrar comandos de voz"
          aria-expanded={commandsOpen}
          aria-controls="hbg-voice-command-catalog"
          title="Comandos disponibles"
          style={{
            width: 36,
            height: 36,
            borderRadius: "50%",
            border: `1px solid ${commandsOpen ? accentColor : "var(--border-dim)"}`,
            background: "var(--bg-card)",
            color: commandsOpen ? accentColor : "var(--text-muted)",
            cursor: "pointer",
            fontSize: 17,
          }}
        >
          ☷
        </button>
        <button
          onClick={handleMicClick}
          disabled={!supported || processing}
          style={{
            width: 52,
            height: 52,
            borderRadius: "50%",
            cursor: supported ? "pointer" : "default",
            border: `1px solid ${listening ? "var(--neon-pink)" : accentColor}`,
            background: listening ? "rgba(255,64,129,0.18)" : processing ? "rgba(255,209,64,0.18)" : `${accentColor}18`,
            boxShadow: listening ? `0 0 18px ${accentColor}50` : "none",
            opacity: supported ? 1 : 0.4,
            fontSize: 20,
          }}
          aria-label={listening ? "Detener escucha" : "Activar comando de voz"}
        >
          🎙
        </button>
      </div>
    </div>
  );
}
