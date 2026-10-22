import { useState } from "react";

interface ShareEngineProps {
  appName: string;
  appColor: string;
  mood?: string;
  projectData?: Record<string, unknown>;
}

function fakeQR(text: string): string {
  // Returns a simple SVG QR-like visual (decorative)
  const hash = text.split("").reduce((a, c) => (a * 31 + c.charCodeAt(0)) | 0, 0);
  const cells: boolean[] = [];
  for (let i = 0; i < 49; i++) {
    cells.push(((hash >> (i % 32)) & 1) === 1);
  }
  // Always show corner markers
  const corners = [0, 1, 2, 3, 4, 5, 6, 7, 14, 42, 43, 44, 45, 46, 47, 48];
  corners.forEach((i) => { cells[i] = true; });
  const size = 7;
  const cell = 4;
  const rects = cells
    .map((on, i) => {
      const x = (i % size) * cell;
      const y = Math.floor(i / size) * cell;
      return on ? `<rect x="${x}" y="${y}" width="${cell - 0.5}" height="${cell - 0.5}" rx="0.5"/>` : "";
    })
    .join("");
  return `data:image/svg+xml;utf8,<svg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 ${size * cell} ${size * cell}'><rect width='100%' height='100%' fill='%230a0f1a'/><g fill='%2300e5ff'>${rects}</g></svg>`;
}

export function ShareEngine({ appName, appColor, mood, projectData }: ShareEngineProps) {
  const [copied, setCopied] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [showQR, setShowQR] = useState(false);

  const shareLink = `https://universohbg.app/${appName.toLowerCase().replace(/ /g, "-")}`;
  const inviteCode = "HBG-" + Math.random().toString(36).substring(2, 8).toUpperCase();
  const qrSrc = fakeQR(shareLink + inviteCode);

  const copy = (text: string, label: string) => {
    navigator.clipboard.writeText(text).catch(() => {});
    setCopied(label);
    setTimeout(() => setCopied(null), 2000);
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
      modulos_instalados: ["universo", "instinto", "vibra", "terminador"],
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
        <div className="section-title">// compartir app</div>
        <div style={{ display: "flex", gap: 10, marginBottom: 10 }}>
          <div style={{ flex: 1 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginBottom: 6 }}>ENLACE</div>
            <div style={{ display: "flex", gap: 6 }}>
              <div style={{ flex: 1, padding: "7px 10px", background: "var(--bg-deep)", border: "1px solid var(--border-dim)", borderRadius: 3, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                {shareLink}
              </div>
              <button className="hbg-btn hbg-btn-ghost" style={{ padding: "7px 10px", fontSize: 10, color: copied === "link" ? "var(--neon-green)" : undefined }} onClick={() => copy(shareLink, "link")}>
                {copied === "link" ? "✓" : "⧉"}
              </button>
            </div>
          </div>
          <button className="hbg-btn hbg-btn-ghost" style={{ flexDirection: "column", gap: 3, padding: "8px 14px" }} onClick={() => setShowQR((v) => !v)}>
            <span style={{ fontSize: 18 }}>▦</span>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 8 }}>QR</span>
          </button>
        </div>
        {showQR && (
          <div style={{ display: "flex", justifyContent: "center", padding: "12px 0" }}>
            <img src={qrSrc} width={98} height={98} style={{ imageRendering: "pixelated", border: `2px solid ${appColor}`, borderRadius: 4, boxShadow: `0 0 16px ${appColor}40` }} alt="QR code" />
          </div>
        )}
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>CÓDIGO DE INVITACIÓN:</span>
          <span
            style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: appColor, cursor: "pointer", borderBottom: `1px dashed ${appColor}` }}
            onClick={() => copy(inviteCode, "code")}
          >
            {copied === "code" ? "✓ COPIADO" : inviteCode}
          </span>
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
          Exporta todas las preferencias, temas, historial y configuraciones del ecosistema en un archivo universo_hbg_backup.json
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
