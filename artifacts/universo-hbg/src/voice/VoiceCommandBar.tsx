import { useCallback, useEffect, useRef, useState, type PointerEvent as ReactPointerEvent } from "react";
import { interpretUtterance } from "./lingua";
import { executeVoiceAction } from "./actionExecutor";
import { beginVoiceAudioSession } from "../core/audioManager";
import { hbgCore } from "../core/hbgCore";
import { getAndroidBridge } from "../modules/androidMediaStoreBridge";
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
  const [speechEnabled, setSpeechEnabled] = useState(() => {
    try {
      return localStorage.getItem("hbg_vibra_voice_speech_enabled") !== "false";
    } catch {
      return true;
    }
  });
  const [commandsOpen, setCommandsOpen] = useState(false);
  const [handsFreeEnabled, setHandsFreeEnabled] = useState(false);
  const [wakePending, setWakePending] = useState(false);
  const voiceSessionReleaseRef = useRef<(() => void) | null>(null);

  const speak = useCallback(
    (text: string): Promise<void> => {
      if (!speechEnabled || typeof window === "undefined") return Promise.resolve();
      const bridge = getAndroidBridge();
      if (!bridge) return Promise.resolve();
      return new Promise((resolve) => {
        let settled = false;
        const finish = () => {
          if (settled) return;
          settled = true;
          window.clearTimeout(watchdog);
          window.removeEventListener("hbg:tts-complete", finish);
          resolve();
        };
        const watchdog = window.setTimeout(finish, SPEECH_WATCHDOG_MS);
        window.addEventListener("hbg:tts-complete", finish, { once: true });
        try {
          if (!bridge.speak(text)) finish();
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
        if (interpretation.wakeTarget === "vibra") hbgCore.setModule("vibra");
        if (interpretation.wakeTarget === "instinto") hbgCore.setModule("instinto");
        const response = interpretation.wakePhrasePresent && !interpretation.normalizedText
          ? interpretation.wakeTarget === "vibra"
            ? "VIBRA está lista. ¿Qué música quieres escuchar?"
            : interpretation.wakeTarget === "instinto"
              ? "INSTINTO está listo. ¿Qué quieres crear?"
              : "HBG está listo. ¿En qué te ayudo?"
          : await executeVoiceAction(interpretation.action);
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

  const androidBridge = getAndroidBridge();
  const supported = androidBridge?.isVoiceWakeAvailable() ?? false;
  const listening = handsFreeEnabled || wakePending;
  const error: string | null = null;

  useEffect(() => {
    const onNativeCommand = (event: Event) => {
      const text = (event as CustomEvent<{ text?: string }>).detail?.text;
      if (text) {
        setWakePending(false);
        void handleResult(text);
      }
    };
    const onNativeStatus = (event: Event) => {
      const status = (event as CustomEvent<{ status?: string }>).detail?.status ?? "";
      if (status === "listening-wake-word" || status === "listening-command") setHandsFreeEnabled(true);
      if (status === "stopped" || status === "offline-recognition-unavailable" || status === "microphone-permission-denied" || status === "permission-denied") {
        setHandsFreeEnabled(false);
        setWakePending(false);
      }
      if (status.startsWith("wake-") && status !== "wake-timeout") setWakePending(true);
      if (status === "wake-timeout" || status === "command-received") setWakePending(false);
      if (status === "offline-recognition-unavailable") {
        setPersistentError("Este dispositivo no tiene reconocimiento de voz sin conexión disponible. VIBRA no enviará tu audio a servicios externos.");
      }
      if (status === "microphone-permission-denied" || status === "permission-denied") {
        setPersistentError("Permiso de micrófono denegado. Manos Libres permanece apagado.");
      }
    };
    window.addEventListener("hbg:voice-command", onNativeCommand);
    window.addEventListener("hbg:voice-status", onNativeStatus);
    return () => {
      window.removeEventListener("hbg:voice-command", onNativeCommand);
      window.removeEventListener("hbg:voice-status", onNativeStatus);
    };
  }, [handleResult]);

  // Acquire audio ducking synchronously in the microphone click handler, before
  // SpeechRecognition starts and the browser can take microphone/audio focus.
  const ensureVoiceAudioSession = useCallback(() => {
    if (!voiceSessionReleaseRef.current) {
      voiceSessionReleaseRef.current = beginVoiceAudioSession();
    }
  }, []);
  const releaseVoiceAudioSession = useCallback(() => {
    const release = voiceSessionReleaseRef.current;
    voiceSessionReleaseRef.current = null;
    release?.();
  }, []);

  // Keep the same session alive across capture, command execution and spoken response.
  const voiceSessionActive = wakePending || processing;
  useEffect(() => {
    if (voiceSessionActive) ensureVoiceAudioSession();
    else releaseVoiceAudioSession();
  }, [voiceSessionActive, ensureVoiceAudioSession, releaseVoiceAudioSession]);

  useEffect(() => () => releaseVoiceAudioSession(), [releaseVoiceAudioSession]);

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
    if (!supported || processingRef.current || !androidBridge) return;
    setPersistentError(null);
    setDismissedError(false);
    if (handsFreeEnabled) {
      androidBridge.stopVoiceWake();
      setHandsFreeEnabled(false);
      setWakePending(false);
    } else {
      const started = androidBridge.startVoiceWake();
      if (!started) setLastResponseText("Solicité el permiso de micrófono. Cuando lo concedas, Manos Libres se activará.");
      else setHandsFreeEnabled(true);
    }
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
            Activa Manos Libres y di «Oye VIBRA», «Oye INSTINTO» u «Oye HBG».
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
          Manos Libres local requiere la aplicación Android de Universo HBG.
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
          aria-label={handsFreeEnabled ? "Desactivar Manos Libres" : "Activar Manos Libres local"}
        >
          {handsFreeEnabled ? "●" : "🎙"}
        </button>
      </div>
    </div>
  );
}
