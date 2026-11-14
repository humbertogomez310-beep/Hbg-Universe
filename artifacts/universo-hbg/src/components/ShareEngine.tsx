
import { useState } from "react";

interface ShareEngineProps {
  appName: string;
  appColor: string;
  mood?: string;
  projectData?: Record<string, unknown>;
}

// Enlace público oficial de Universo HBG.
export const PUBLIC_APP_URL =
  "https://hbg-universe--humbertogomez31.replit.app";

function qrImageUrl(text: string): string {
  return `https://api.qrserver.com/v1/create-qr-code/?size=196x196&margin=8&data=${encodeURIComponent(text)}`;
}

export function ShareEngine({
  appColor,
}: ShareEngineProps) {
  const [copied, setCopied] = useState(false);
  const [showQR, setShowQR] = useState(false);
  const [qrFailed, setQrFailed] = useState(false);

  const shareLink = PUBLIC_APP_URL;
  const shareText = "Conoce UNIVERSO HBG";

  const copyLink = async () => {
    try {
      await navigator.clipboard.writeText(shareLink);
      setCopied(true);
      window.setTimeout(() => setCopied(false), 2000);
    } catch {
      setCopied(false);
    }
  };

  const nativeShare = async () => {
    if (typeof navigator.share === "function") {
      try {
        await navigator.share({
          title: "UNIVERSO HBG",
          text: shareText,
          url: shareLink,
        });
        return;
      } catch (error) {
        if (
          error instanceof Error &&
          error.name === "AbortError"
        ) {
          return;
        }
      }
    }

    await copyLink();
  };

  const whatsappHref =
    `https://wa.me/?text=${encodeURIComponent(
      `${shareText}: ${shareLink}`
    )}`;

  return (
    <div
      style={{
        display: "flex",
        flexDirection: "column",
        gap: 16,
      }}
    >
      <div className="hbg-card">
        <div className="section-title">
          // compartir UNIVERSO HBG
        </div>

        <div
          style={{
            fontFamily: "var(--font-mono)",
            fontSize: 10,
            color: "var(--text-muted)",
            marginBottom: 6,
          }}
        >
          ENLACE OFICIAL
        </div>

        <div
          style={{
            display: "flex",
            gap: 6,
            marginBottom: 12,
          }}
        >
          <div
            style={{
              flex: 1,
              minWidth: 0,
              padding: "9px 10px",
              background: "var(--bg-deep)",
              border: "1px solid var(--border-dim)",
              borderRadius: 3,
              fontFamily: "var(--font-mono)",
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
            onClick={() => void copyLink()}
            aria-label="Copiar enlace de Universo HBG"
          >
            {copied ? "✓" : "⧉"}
          </button>
        </div>

        <div
          style={{
            display: "flex",
            flexDirection: "column",
            gap: 8,
          }}
        >
          <button
            className="hbg-btn hbg-btn-primary w-full"
            onClick={() => void nativeShare()}
          >
            ↗ COMPARTIR APLICACIÓN
          </button>

          <a
            className="hbg-btn hbg-btn-ghost w-full"
            href={whatsappHref}
            target="_blank"
            rel="noopener noreferrer"
            style={{
              textDecoration: "none",
              textAlign: "center",
            }}
          >
            ✆ COMPARTIR POR WHATSAPP
          </a>

          <button
            className="hbg-btn hbg-btn-ghost w-full"
            onClick={() => {
              setShowQR((value) => !value);
              setQrFailed(false);
            }}
          >
            ▦ {showQR ? "OCULTAR QR" : "MOSTRAR QR"}
          </button>
        </div>

        {showQR && (
          <div
            style={{
              display: "flex",
              justifyContent: "center",
              padding: 12,
            }}
          >
            {qrFailed ? (
              <div
                style={{
                  fontFamily: "var(--font-mono)",
                  fontSize: 10,
                  color: "var(--text-muted)",
                  textAlign: "center",
                }}
              >
                No se pudo cargar el código QR.
                Puedes compartir el enlace directamente.
              </div>
            ) : (
              <img
                src={qrImageUrl(shareLink)}
                width={196}
                height={196}
                alt="Código QR de Universo HBG"
                onError={() => setQrFailed(true)}
                style={{
                  border: `2px solid ${appColor}`,
                  borderRadius: 4,
                  background: "#fff",
                }}
              />
            )}
          </div>
        )}

        {copied && (
          <div
            style={{
              fontFamily: "var(--font-mono)",
              fontSize: 10,
              color: "var(--neon-green)",
              marginTop: 8,
            }}
          >
            ✓ ENLACE COPIADO
          </div>
        )}
      </div>
    </div>
  );
}
