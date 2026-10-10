import { useCallback, useEffect, useState } from "react";
import { useVoiceCapture } from "./useVoiceCapture";
import { parseIntent } from "./intentParser";
import { executeVoiceAction } from "./actionExecutor";

export function VoiceCommandBar({ accentColor }: { accentColor: string }) {
  const [processing, setProcessing] = useState(false);
  const [lastRecognizedText, setLastRecognizedText] = useState<string | null>(null);
  const [lastResponseText, setLastResponseText] = useState<string | null>(null);
  const [speechEnabled, setSpeechEnabled] = useState(() => {
    try {
      return localStorage.getItem("hbg_vibra_voice_speech_enabled") !== "false";
    } catch {
      return true;
    }
  });

  const speak = useCallback(
    (text: string) => {
      if (!speechEnabled) return;
      if (typeof window === "undefined" || !("speechSynthesis" in window)) return;
      try {
        const utterance = new SpeechSynthesisUtterance(text);
        utterance.lang = "es-ES";
        window.speechSynthesis.speak(utterance);
      } catch {
        /* unavailable */
      }
    },
    [speechEnabled]
  );

  const handleResult = useCallback(
    async (text: string) => {
      setLastRecognizedText(text);
      setProcessing(true);
      const action = parseIntent(text);
      const response = await executeVoiceAction(action);
      setLastResponseText(response);
      speak(response);
      setProcessing(false);
    },
    [speak]
  );

  const { supported, listening, error, start, stop } = useVoiceCapture(handleResult);

  useEffect(() => {
    try {
      localStorage.setItem("hbg_vibra_voice_speech_enabled", String(speechEnabled));
    } catch {
      /* unavailable */
    }
  }, [speechEnabled]);

  const handleMicClick = () => {
    if (!supported) return;
    if (listening) stop();
    else start();
  };

  const statusText = error ?? lastResponseText ?? lastRecognizedText;

  return (
    <div style={{ position: "fixed", right: 16, bottom: 90, zIndex: 50, display: "flex", flexDirection: "column", alignItems: "flex-end", gap: 8 }}>
      {statusText && (
        <div style={{ maxWidth: 220, background: "var(--bg-card)", border: `1px solid ${accentColor}40`, borderRadius: 4, padding: "8px 10px", fontFamily: "var(--font-mono)", fontSize: 10 }}>
          {lastRecognizedText && <div style={{ color: "var(--text-muted)", marginBottom: 4 }}>&ldquo;{lastRecognizedText}&rdquo;</div>}
          <div style={{ color: error ? "var(--neon-pink)" : "var(--text-primary)" }}>{statusText}</div>
        </div>
      )}
      {!supported && (
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", maxWidth: 150, textAlign: "right" }}>
          Voz no disponible en este navegador.
        </div>
      )}
      <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
        <button
          onClick={() => setSpeechEnabled((v) => !v)}
          style={{ width: 32, height: 32, borderRadius: "50%", border: "1px solid var(--border-dim)", background: "var(--bg-card)", color: "var(--text-muted)", cursor: "pointer", fontSize: 12 }}
          aria-label="Alternar respuesta hablada"
        >
          {speechEnabled ? "🔊" : "🔇"}
        </button>
        <button
          onClick={handleMicClick}
          disabled={!supported}
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