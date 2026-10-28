import { useState } from "react";

interface ShareEngineProps {
  appName: string;
  appColor: string;
  mood?: string;
  projectData?: Record<string, unknown>;
}

// Dirección pública de la app. Los enlaces que se comparten siempre apuntan aquí
// (la dirección de vista previa de Replit pide iniciar sesión y no sirve para otras personas).
export const PUBLIC_APP_URL = "https://hbg-universe--humbertogomez31.replit.app";

function qrImageUrl(text: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=196x196&margin=8&data=${encodeURIComponent(text)}`;
}

export function ShareEngine({ appName, appColor, mood, projectData }: ShareEngineProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);
  // Identificador local de esta sesión. No se valida en el servidor.
  const [inviteCode] = useState(() => "HBG-" + Math.random().toString(36).substring(2, 8).toUpperCase());

  const shareLink = PUBLIC_APP_URL;
  const shareText = `Mira UNIVERSO HBG: ${shareLink}`;
  const whatsappHref = `https://wa.me/?text=${encodeURIComponent(shareText)}`;

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
  };

  const nativeShare = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({ title: "UNIVERSO HBG", text: "Mira UNIVERSO HBG", url: shareLink });
        return;
      } catch {
        // Si la persona cancela o falla, se copia el enlace como alternativa.
      }
    }
    copy(shareLink, "link");
  };

  const exportMoodState = () => {
    if (!mood) return;
    const payload = JSON.stringify({ app: appName, mood, timestamp: new Date().toISOString() }, null, 2);
    const blob = new Blob([payload], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${appName.toLowerCase()}_mood.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportUniverse = async () => {
    setExporting(true);
    await new Promise((r) => setTimeout(r, 600));
    const data = {
      version: "1.0.0",
      exported_from: appName,
      timestamp: new Date().toISOString(),
      preferences: { mood: mood ?? "neutral", tema: "cyberpunk" },
      modulos_instalados: ["universo", "instinto", "vibra"],
      ...projectData,
    };
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = "universo_hbg_backup.json"; a.click();
    URL.revokeObjectURL(url);
    setExporting(false);
  };

  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
      {/* Section 1: Share App */}
      <div className="hbg-card">
        <div className="section-title">// compartir aplicación</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>ENLACE</div>
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ flex: 1, minWidth: 0, padding: "7px 10px", background: "var(--bg-deep)", border: "1px solid var(--border-dim)", borderRadius: 3, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {shareLink}
              </div>
              <button className="hbg-btn hbg-btn-ghost" style={{ padding: "7px 10px", fontSize: 10, color: copied === "link" ? "var(--neon-green)" : undefined }} onClick={() => copy(shareLink, "link")} aria-label="Copiar enlace">
                {copied === "link" ? "✓" : "⧉"}
              </button>
            </div>
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 6, marginBottom: 10 }}>
          <button className="hbg-btn hbg-btn-primary w-full" onClick={() => void nativeShare()}>
            ↗ COMPARTIR (OPCIONES DISPONIBLES DEL SISTEMA)
          </button>
          <a className="hbg-btn hbg-btn-ghost w-full" href={whatsappHref} target="_blank" rel="noopener noreferrer" style={{ textDecoration: "none", textAlign: "center" }}>
            ✆ ENVIAR POR WHATSAPP
          </a>
          <button className="hbg-btn hbg-btn-ghost w-full" onClick={() => { setShowQR((v) => !v); setQrFailed(false); }}>
            ▦ {showQR ? "OCULTAR QR" : "MOSTRAR QR"}
          </button>
        </div>

        {showQR && (
          <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
            {qrFailed ? (
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", textAlign: "center" }}>
                No se pudo cargar el QR (requiere internet). Comparte el enlace de arriba.
              </div>
            ) : (
              <img
                src={qrImageUrl(shareLink)}
                width={196}
                height={196}
                style={{ border: `2px solid ${appColor}`, borderRadius: 4, boxShadow: `0 0 16px ${appColor}40`, background: "#fff" }}
                alt="Código QR del enlace de UNIVERSO HBG"
                onError={() => setQrFailed(true)}
              />
            )}
          </div>
        )}

        <div style={{ display: "flex", gap: 6, flexWrap: "wrap", alignItems: "baseline" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>IDENTIFICADOR LOCAL:</span>
          <span
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: appColor, cursor: "pointer", borderBottom: `1px dashed ${appColor}` }}
            onClick={() => copy(inviteCode, "code")}
          >
            {copied === "code" ? "✓ COPIADO" : inviteCode}
          </span>
        </div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 6 }}>
          No se valida en servidor ni habilita acceso, registro o canje.
        </div>
      </div>

      {/* Section 2: Share State */}
      {mood && (
        <div className="hbg-card">
          <div className="section-title">// compartir estado emocional</div>
          <div style={{ padding: "8px 12px", background: "var(--bg-deep)", border: "1px solid var(--border-dim)", borderRadius: 3, fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--neon-cyan)", marginBottom: 10 }}>
            <div style={{ color: "var(--text-muted)" }}>{`{`}</div>
            <div style={{ paddingLeft: 16 }}>{`"app": "${appName}",`}</div>
            <div style={{ paddingLeft: 16 }}>{`"mood": "${mood}"`}</div>
            <div style={{ color: "var(--text-muted)" }}>{`}`}</div>
          </div>
          <button className="hbg-btn hbg-btn-ghost w-full" onClick={exportMoodState}>
            ↗ TRANSMITIR ESTADO EMOCIONAL
          </button>
        </div>
      )}

      {/* Section 3: Share Project */}
      {projectData && (
        <div className="hbg-card">
          <div className="section-title">// compartir proyecto</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <button className="hbg-btn hbg-btn-ghost w-full">↗ COMPARTIR PROYECTO ACTIVO</button>
            <button className="hbg-btn hbg-btn-ghost w-full">↓ EXPORTAR COMO JSON</button>
          </div>
        </div>
      )}

      {/* Section 4: Export Universe */}
      <div className="hbg-card hbg-card-accent" style={{ "--card-color": appColor } as React.CSSProperties}>
        <div className="section-title">// compartir universo completo</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginBottom: 10 }}>
          Exporta preferencias, temas y configuraciones del ecosistema en un archivo universo_hbg_backup.json
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