import { useState, type CSSProperties, type FormEvent } from "react";
import { ownerSession } from "../core/ownerSession";

interface OwnerGateProps {
  onCancel: () => void;
  onSuccess: () => void;
}

const overlayStyle: CSSProperties = {
  position: "fixed",
  inset: 0,
  zIndex: 10000,
  display: "grid",
  placeItems: "center",
  padding:
    "max(20px, env(safe-area-inset-top)) max(20px, env(safe-area-inset-right)) max(20px, env(safe-area-inset-bottom)) max(20px, env(safe-area-inset-left))",
  background: "rgba(3, 8, 18, 0.96)",
  backdropFilter: "blur(10px)",
};

const cardStyle: CSSProperties = {
  width: "min(100%, 420px)",
  padding: 24,
  color: "var(--text-primary, #e8f1ff)",
  background: "var(--bg-deep, #07111f)",
  border: "1px solid var(--border-dim, rgba(0, 229, 255, 0.25))",
  borderRadius: 14,
  boxShadow: "0 20px 80px rgba(0, 0, 0, 0.5)",
};

export function OwnerGate({ onCancel, onSuccess }: OwnerGateProps) {
  const [credential, setCredential] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState("");

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (submitting || !credential) return;

    const submittedCredential = credential;
    setSubmitting(true);
    setMessage("");
    let succeeded = false;
    try {
      const result = await ownerSession.login(submittedCredential);
      if (result.ok) {
        setMessage("");
        succeeded = true;
      } else {
        setMessage(
          result.reason === "limited"
            ? "Intenta más tarde."
            : "No se pudo verificar.",
        );
      }
    } catch {
      setMessage("No se pudo verificar.");
    } finally {
      setCredential("");
      setSubmitting(false);
    }
    if (succeeded) onSuccess();
  }

  function handleCancel() {
    setCredential("");
    setMessage("");
    onCancel();
  }

  return (
    <div style={overlayStyle}>
      <section
        aria-labelledby="owner-gate-title"
        aria-modal="true"
        role="dialog"
        style={cardStyle}
      >
        <h2
          id="owner-gate-title"
          style={{
            margin: "0 0 8px",
            color: "var(--neon-cyan, #00e5ff)",
            fontFamily: "var(--font-display, sans-serif)",
            fontSize: 18,
          }}
        >
          Verificación necesaria
        </h2>
        <p
          style={{
            margin: "0 0 20px",
            color: "var(--text-secondary, #a7b2c3)",
            fontSize: 14,
          }}
        >
          Introduce tu contraseña para continuar.
        </p>
        <form onSubmit={handleSubmit}>
          <label
            htmlFor="owner-gate-credential"
            style={{
              display: "block",
              marginBottom: 8,
              color: "var(--text-secondary, #a7b2c3)",
              fontSize: 12,
            }}
          >
            Contraseña
          </label>
          <input
            id="owner-gate-credential"
            type="password"
            autoComplete="off"
            value={credential}
            onChange={(event) => setCredential(event.target.value)}
            disabled={submitting}
            style={{
              boxSizing: "border-box",
              width: "100%",
              minHeight: 48,
              padding: "12px 14px",
              color: "var(--text-primary, #e8f1ff)",
              background: "rgba(5, 12, 24, 0.9)",
              border: "1px solid var(--border-dim, rgba(0, 229, 255, 0.25))",
              borderRadius: 8,
              fontSize: 16,
              outlineColor: "var(--neon-cyan, #00e5ff)",
            }}
          />
          <div
            aria-live="polite"
            role={message ? "alert" : undefined}
            style={{
              minHeight: 22,
              marginTop: 8,
              color: "var(--neon-red, #ff5577)",
              fontSize: 13,
            }}
          >
            {message}
          </div>
          <div style={{ display: "flex", gap: 10, marginTop: 12 }}>
            <button
              className="hbg-btn hbg-btn-primary"
              type="submit"
              disabled={submitting || !credential}
              style={{ flex: 1, minHeight: 44 }}
            >
              {submitting ? "Verificando…" : "Entrar"}
            </button>
            <button
              className="hbg-btn hbg-btn-ghost"
              type="button"
              onClick={handleCancel}
              disabled={submitting}
              style={{ minHeight: 44 }}
            >
              Cancelar
            </button>
          </div>
        </form>
      </section>
    </div>
  );
}
