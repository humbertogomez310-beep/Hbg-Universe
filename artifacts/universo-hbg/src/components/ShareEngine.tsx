import { useState, type CSSProperties } from "react";

const CANONICAL_DISTRIBUTION_URL =
  "https://hbg-universe--humbertogomez31.replit.app";

interface ShareEngineProps {
  appName: string;
  appColor: string;
  mood?: string;
  projectData?: Record<string, unknown>;
}

function getInviteCode(): string {
  try {
    const saved = localStorage.getItem("hbg_invite_code");
    if (saved) return saved;
    const fresh =
      "HBG-" + Math.random().toString(36).substring(2, 8).toUpperCase();
    localStorage.setItem("hbg_invite_code", fresh);
    return fresh;
  } catch {
    return "HBG-UNIVERSO";
  }
}

function downloadJson(data: unknown, filename: string) {
  const blob = new Blob([JSON.stringify(data, null, 2)], {
    type: "application/json",
  });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename;
  a.click();
  URL.revokeObjectURL(url);
}

export function ShareEngine({
  appName,
  appColor,
  mood,
  projectData,
}: ShareEngineProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  const [inviteCode] = useState(getInviteCode);

  const shareLink = CANONICAL_DISTRIBUTION_URL;
  const invitationMessage =
    `Te invito a probar UNIVERSO HBG (${appName}).\n` +
    `Aplicación publicada: ${shareLink}\n` +
    `Identificador local (sin validación; no concede acceso, registro ni canje): ${inviteCode}`;
  const qrSrc =
    "https://api.qrserver.com/v1/create-qr-code/?size=240x240&margin=10&data=" +
    encodeURIComponent(shareLink);

  const copy = async (text: string, label: string) => {
    try {
      await navigator.clipboard.writeText(text);
      setCopied(label);
    } catch {
      setCopied("fail");
    }
    setTimeout(() => setCopied(null), 2000);
  };

  const nativeShare = async () => {
    if (navigator.share) {
      try {
        await navigator.share({
          title: "UNIVERSO HBG",
          text: invitationMessage,
        });
      } catch {
        // la persona canceló el menú de compartir
      }
    } else {
      copy(invitationMessage, "msg");
    }
  };

  const shareWhatsApp = () => {
    window.open(
      "https://wa.me/?text=" + encodeURIComponent(invitationMessage),
      "_blank",
      "noopener,noreferrer"
    );
  };

  const exportMoodState = () => {
    if (!mood) return;
    downloadJson(
      { app: appName, mood, timestamp: new Date().toISOString() },
      appName.toLowerCase() + "_mood.json"
    );
  };

  const shareProject = async () => {
    const text = JSON.stringify(projectData, null, 2);
    if (navigator.share) {
      try {
        await navigator.share({ title: "Proyecto " + appName, text });
      } catch {
        // la persona canceló el menú de compartir
      }
    } else {
      copy(text, "project");
    }
  };

  const exportProject = () => {
    downloadJson(
      projectData,
      appName.toLowerCase().replace(/ /g, "-") + "_proyecto.json"
    );
  };

  const exportUniverse = async () => {
    setExporting(true);
    await new Promise((r) => setTimeout(r, 600));
    downloadJson(
      {
        version: "1.0.0",
        exported_from: appName,
        timestamp: new Date().toISOString(),
        preferences: { mood: mood ?? "neutral", tema: "cyberpunk" },
        modulos_instalados: ["universo", "instinto", "vibra", "terminador"],
        ...projectData,
      },
      "universo_hbg_backup.json"
    );
    setExporting(false);
  };

  const mono: CSSProperties = { fontFamily: "var(--font-mono)" };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Compartir la app */}
      <div className="hbg-card">
        <div className="section-title">// compartir app</div>

        <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>
          ENLACE
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <div
            style={{
              ...mono,
              flex: 1,
              minWidth: 0,
              padding: "7px 10px",
              background: "var(--bg-deep)",
              border: "1px solid var(--border-dim)",
              borderRadius: 3,
              fontSize: 10,
              color: "var(--text-secondary)",
              overflow: "hidden",
              textOverflow: "ellipsis",
              whiteSpace: "nowrap",
            }}
          >
            {shareLink}
          </div>
          <button
            className="hbg-btn hbg-btn-ghost"
            style={{
              padding: "7px 12px",
              fontSize: 12,
              color:
                copied === "link"
                  ? "var(--neon-green)"
                  : copied === "fail"
                  ? "var(--neon-pink)"
                  : undefined,
            }}
            onClick={() => copy(shareLink, "link")}
          >
            {copied === "link" ? "✓" : copied === "fail" ? "✕" : "⧉"}
          </button>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <button className="hbg-btn hbg-btn-primary w-full" onClick={nativeShare}>
            ↗ COMPARTIR (OPCIONES DISPONIBLES DEL SISTEMA)
          </button>
          <button className="hbg-btn hbg-btn-success w-full" onClick={shareWhatsApp}>
            ✆ ENVIAR POR WHATSAPP
          </button>
          <button
            className="hbg-btn hbg-btn-ghost w-full"
            onClick={() => {
              setQrFailed(false);
              setShowQR((v) => !v);
            }}
          >
            ▦ {showQR ? "OCULTAR QR" : "MOSTRAR QR"}
          </button>
        </div>

        {showQR && (
          <div style={{ display: "flex", justifyContent: "center", padding: "14px 0 4px" }}>
            {qrFailed ? (
              <div style={{ ...mono, fontSize: 10, color: "var(--neon-pink)" }}>
                No se pudo cargar el QR. Revisa tu conexión a internet.
              </div>
            ) : (
              <img
                src={qrSrc}
                width={180}
                height={180}
                onError={() => setQrFailed(true)}
                style={{
                  background: "#fff",
                  border: "2px solid " + appColor,
                  borderRadius: 6,
                  boxShadow: "0 0 16px " + appColor + "40",
                }}
                alt="Código QR para abrir la app"
              />
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 12 }}>
          <span style={{ ...mono, fontSize: 10, color: "var(--text-muted)" }}>
            IDENTIFICADOR LOCAL:
          </span>
          <span
            style={{
              ...mono,
              fontSize: 10,
              color: appColor,
              cursor: "pointer",
              borderBottom: "1px dashed " + appColor,
            }}
            onClick={() => copy(inviteCode, "code")}
          >
            {copied === "code" ? "✓ COPIADO" : inviteCode}
          </span>
        </div>
        <div style={{ ...mono, fontSize: 9, color: "var(--text-muted)", marginTop: 6 }}>
          No se valida en servidor ni habilita acceso, registro o canje.
        </div>
      </div>

      {/* Compartir estado emocional */}
      {mood && (
        <div className="hbg-card">
          <div className="section-title">// compartir estado emocional</div>
          <div
            style={{
              ...mono,
              padding: "8px 12px",
              background: "var(--bg-deep)",
              border: "1px solid var(--border-dim)",
              borderRadius: 3,
              fontSize: 11,
              color: "var(--neon-cyan)",
              marginBottom: 10,
            }}
          >
            <div style={{ color: "var(--text-muted)" }}>{"{"}</div>
            <div style={{ paddingLeft: 16 }}>{'"app": "' + appName + '",'}</div>
            <div style={{ paddingLeft: 16 }}>{'"mood": "' + mood + '"'}</div>
            <div style={{ color: "var(--text-muted)" }}>{"}"}</div>
          </div>
          <button className="hbg-btn hbg-btn-ghost w-full" onClick={exportMoodState}>
            ↗ TRANSMITIR ESTADO EMOCIONAL
          </button>
        </div>
      )}

      {/* Compartir proyecto */}
      {projectData && (
        <div className="hbg-card">
          <div className="section-title">// compartir proyecto</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button className="hbg-btn hbg-btn-ghost w-full" onClick={shareProject}>
              ↗ COMPARTIR PROYECTO ACTIVO
            </button>
            <button className="hbg-btn hbg-btn-ghost w-full" onClick={exportProject}>
              ↓ EXPORTAR COMO JSON
            </button>
          </div>
        </div>
      )}

      {/* Exportar universo */}
      <div
        className="hbg-card hbg-card-accent"
        style={{ "--card-color": appColor } as CSSProperties}
      >
        <div className="section-title">// compartir universo completo</div>
        <div style={{ ...mono, fontSize: 10, color: "var(--text-muted)", marginBottom: 10 }}>
          Exporta preferencias, temas y configuraciones del ecosistema en un
          archivo universo_hbg_backup.json
        </div>
        <button
          className="hbg-btn hbg-btn-primary w-full"
          onClick={exportUniverse}
          disabled={exporting}
          style={{ opacity: exporting ? 0.6 : 1 }}
        >
          {exporting ? "◈ EMPAQUETANDO..." : "↓ EXPORTAR UNIVERSO COMPLETO"}
        </button>
      </div>
    </div>
  );
}