import { useEffect, useRef, useState } from "react";
import { ownerSession } from "../core/ownerSession";

interface OwnerGateProps {
  onClose: () => void;
  onSuccess: () => void;
}

// Pantalla de verificación. No menciona qué hay detrás. El código entre paréntesis y el botón
// "Mostrar" son ayudas temporales de diagnóstico y se pueden quitar.
export function OwnerGate({ onClose, onSuccess }: OwnerGateProps) {
  const [credential, setCredential] = useState("");
  const [visible, setVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");
  const [detail, setDetail] = useState("");
  const mounted = useRef(true);

  useEffect(() => {
    mounted.current = true;
    return () => {
      mounted.current = false;
    };
  }, []);

  const submit = async () => {
    if (submitting || credential.length === 0) return;
    setSubmitting(true);
    setMessage("");
    setDetail("");
    const attempt = credential;
    const result = await ownerSession.login(attempt);
    if (!mounted.current) return;
    setCredential("");
    setVisible(false);
    setSubmitting(false);
    if (result.ok) {
      onSuccess();
      return;
    }
    setMessage(result.reason === "limited" ? "Intenta más tarde." : "No se pudo verificar.");
    setDetail(result.detail);
  };

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label="Verificación"
      style={{
        position: "fixed",
        inset: 0,
        zIndex: 1000,
        display: "flex",
        alignItems: "center",
        justifyContent: "center",
        padding: 16,
        background: "rgba(2, 6, 14, 0.94)",
      }}
    >
      <div className="hbg-card" style={{ width: "100%", maxWidth: 380, padding: 20 }}>
        <div
          style={{
            fontFamily: "var(--font-display)",
            fontSize: 16,
            letterSpacing: "0.06em",
            color: "var(--neon-cyan)",
            marginBottom: 6,
          }}
        >
          Verificación necesaria
        </div>
        <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--text-secondary)", marginBottom: 14 }}>
          Introduce tu contraseña para continuar.
        </div>
        <label
          htmlFor="owner-gate-input"
          style={{ display: "block", fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", marginBottom: 6 }}
        >
          Contraseña
        </label>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            id="owner-gate-input"
            type={visible ? "text" : "password"}
            value={credential}
            onChange={(event) => setCredential(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void submit();
            }}
            autoComplete="off"
            autoCapitalize="off"
            autoCorrect="off"
            spellCheck={false}
            autoFocus
            style={{
              flex: 1,
              minWidth: 0,
              fontSize: 16,
              padding: "10px 12px",
              borderRadius: 8,
              border: "1px solid var(--border-color, #1f3a52)",
              background: "rgba(0,0,0,0.35)",
              color: "var(--text-primary)",
            }}
          />
          <button
            type="button"
            className="hbg-btn hbg-btn-ghost"
            style={{ padding: "6px 10px", fontSize: 10 }}
            onClick={() => setVisible((current) => !current)}
          >
            {visible ? "Ocultar" : "Mostrar"}
          </button>
        </div>
        {message && (
          <div role="alert" style={{ marginBottom: 10 }}>
            <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "#ff4d6d" }}>{message}</div>
            {detail && (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                ({detail})
              </div>
            )}
          </div>
        )}
        <div style={{ display: "flex", gap: 8 }}>
          <button
            type="button"
            className="hbg-btn hbg-btn-primary"
            style={{ flex: 1 }}
            disabled={submitting || credential.length === 0}
            onClick={() => void submit()}
          >
            {submitting ? "Verificando…" : "Entrar"}
          </button>
          <button
            type="button"
            className="hbg-btn hbg-btn-ghost"
            disabled={submitting}
            onClick={() => {
              setCredential("");
              setVisible(false);
              onClose();
            }}
          >
            Cancelar
          </button>
        </div>
      </div>
    </div>
  );
}