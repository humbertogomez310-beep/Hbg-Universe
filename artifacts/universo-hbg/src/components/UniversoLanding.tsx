import { useState } from "react";
import type { ModuleId } from "../core/hbgCore";
import { UniversoModule } from "../modules/universo";

interface UniversoLandingProps {
  onSelect: (module: ModuleId) => void;
}

const APPS = [
  {
    id: "vibra" as const,
    title: "VIBRA PRO",
    subtitle: "MÚSICA · DJ · EXPERIENCIAS",
    icon: "♫",
    tone: "cyan",
  },
  {
    id: "instinto" as const,
    title: "INSTINTO",
    subtitle: "INTELIGENCIA · PERSONALIZACIÓN",
    icon: "✧",
    tone: "purple",
  },
];

export function UniversoLanding({ onSelect }: UniversoLandingProps) {
  const [showCore, setShowCore] = useState(false);

  if (showCore) {
    return (
      <section className="hbg-landing-core">
        <button className="hbg-landing-back" onClick={() => setShowCore(false)}>
          ← VOLVER A UNIVERSO HBG
        </button>
        <UniversoModule />
      </section>
    );
  }

  return (
    <main className="hbg-universe-landing">
      <div className="hbg-landing-stars" aria-hidden="true" />
      <div className="hbg-landing-earth" aria-hidden="true">
        <div className="hbg-landing-earth-glow" />
        <div className="hbg-landing-earth-surface" />
      </div>
      <div className="hbg-landing-waves" aria-hidden="true" />

      <header className="hbg-landing-topline">
        <div className="hbg-landing-motto">
          <span>TU MUNDO.</span>
          <span>TUS APPS.</span>
          <span>TU UNIVERSO.</span>
          <i />
        </div>
        <div className="hbg-landing-infinity" aria-label="Logotipo Universo HBG">∞</div>
        <div className="hbg-landing-values">
          <span>CREA</span>
          <span>CONECTA</span>
          <span>DISFRUTA</span>
          <span>EVOLUCIONA</span>
          <i />
        </div>
      </header>

      <section className="hbg-landing-hero">
        <div className="hbg-landing-kicker">UN ECOSISTEMA · POSIBILIDADES SIN LÍMITE</div>
        <h1><span>UNIVERSO</span> <strong>HBG</strong></h1>
        <div className="hbg-landing-subtitle">APLICACIONES INDEPENDIENTES <b>•</b> UN ECOSISTEMA CONECTADO</div>
        <p>Más que aplicaciones, es un universo de posibilidades.</p>
      </section>

      <section className="hbg-landing-apps" aria-label="Aplicaciones del ecosistema">
        {APPS.map((app) => (
          <button
            key={app.id}
            type="button"
            className={\`hbg-landing-app hbg-landing-app-\${app.tone}\`}
            onClick={() => onSelect(app.id)}
          >
            <span className="hbg-landing-app-icon" aria-hidden="true">{app.icon}</span>
            <strong>{app.title}</strong>
            <small>{app.subtitle}</small>
            <span className="hbg-landing-open">ABRIR APLICACIÓN ↗</span>
          </button>
        ))}

        <div className="hbg-landing-app hbg-landing-app-qr" aria-label="QR Restaurant próximamente">
          <span className="hbg-landing-app-icon" aria-hidden="true">餐</span>
          <strong>QR RESTAURANT</strong>
          <small>GESTIÓN · FINANZAS · INSIGHTS</small>
          <span className="hbg-landing-coming">PRÓXIMAMENTE</span>
        </div>
      </section>

      <section className="hbg-landing-foundation" aria-label="Tecnología del ecosistema">
        <button type="button" onClick={() => setShowCore(true)}>
          <span className="hbg-foundation-icon">⬡</span>
          <strong>HBG CORE</strong>
          <small>SERVICIOS E INTEGRACIÓN</small>
        </button>
        <div>
          <span className="hbg-foundation-icon">⛨</span>
          <strong>HBG AUTHORITY</strong>
          <small>PERMISOS Y SEGURIDAD</small>
        </div>
        <div>
          <span className="hbg-foundation-icon">✺</span>
          <strong>IA HBG</strong>
          <small>INTELIGENCIA TRANSVERSAL</small>
        </div>
        <div>
          <span className="hbg-foundation-icon">↗</span>
          <strong>HBG INSIGHTS</strong>
          <small>DATOS · ALERTAS · OPORTUNIDADES</small>
        </div>
      </section>

      <footer className="hbg-landing-footer">
        <span />
        <strong>EL FUTURO YA ESTÁ AQUÍ</strong>
        <span />
      </footer>
    </main>
  );
}
