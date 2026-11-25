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
    <div className="hbg-universe-landing">
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
            className={"hbg-landing-app hbg-landing-app-" + app.tone}
            onClick={() => onSelect(app.id)}
          >
            <span className={"hbg-landing-app-icon hbg-landing-app-icon-" + app.id} aria-hidden="true">
              {app.id === "vibra" ? (
                <span className="hbg-landing-waveform">{[10, 19, 29, 16, 36, 22, 31, 13, 25].map((height, index) => <i key={index} style={{ height: height + "px" }} />)}</span>
              ) : (
                <svg viewBox="0 0 64 64" role="presentation" className="hbg-landing-brain">
                  <path d="M31 12c-7-8-19-2-18 8-9 4-8 17-1 21-2 10 8 16 17 11 2 5 8 5 10 0 9 5 19-1 17-11 7-5 8-17-1-21 1-10-11-16-18-8-2-4-4-4-6 0Z" />
                  <path d="M31 13v38M17 23c7-1 10 4 10 9m-14 9c7-4 12-1 14 5m20-23c-7-1-10 4-10 9m14 9c-7-4-12-1-14 5M21 17l5 5m17-5-5 5" />
                  <circle cx="17" cy="23" r="2"/><circle cx="14" cy="41" r="2"/><circle cx="47" cy="23" r="2"/><circle cx="50" cy="41" r="2"/>
                </svg>
              )}
            </span>
            <strong>{app.title}</strong>
            <small>{app.subtitle}</small>
            <span className="hbg-landing-open">ABRIR APLICACIÓN ↗</span>
          </button>
        ))}

        <div className="hbg-landing-app hbg-landing-app-qr" aria-label="QR Restaurant próximamente">
          <span className="hbg-landing-app-icon hbg-landing-app-icon-qr" aria-hidden="true">
            <svg viewBox="0 0 64 64" role="presentation" className="hbg-landing-cutlery">
              <path d="M17 8v17m-6-17v11m12-11v11M11 19c0 8 12 8 12 0M17 27v29M43 8c-8 11-8 22 0 25v23m0-48v25" />
            </svg>
          </span>
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
    </div>
  );
}
