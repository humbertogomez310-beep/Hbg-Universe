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
    eyebrow: "01 / EXPERIENCIA MUSICAL",
    subtitle: "MÚSICA INTELIGENTE · AUTO DJ · PLAYLISTS",
    description: "El sonido de tu universo. Música que se adapta a ti y toma vida con cada momento.",
    tone: "vibra",
  },
  {
    id: "instinto" as const,
    title: "INSTINTO",
    eyebrow: "02 / INTELIGENCIA CREATIVA",
    subtitle: "PERSONALIZACIÓN · IDEAS · EVOLUCIÓN",
    description: "Una inteligencia que conecta tus ideas, aprende tu forma de crear y evoluciona contigo.",
    tone: "instinto",
  },
];

function VibraMark() {
  return (
    <svg viewBox="0 0 96 96" className="hbg-cover-vibra-mark" aria-hidden="true">
      <path d="M8 49h9l7-20 10 42 10-55 11 63 10-45 8 27 7-12h8" />
      <path d="M10 75c18 12 56 12 76-1" className="hbg-cover-mark-secondary" />
    </svg>
  );
}

function InstintoMark() {
  return (
    <svg viewBox="0 0 96 96" className="hbg-cover-instinto-mark" aria-hidden="true">
      <path d="M47 17c-10-12-28-5-27 10-13 6-12 24-1 30-3 15 12 24 25 16 3 8 10 8 13 0 13 8 28-1 25-16 11-6 12-24-1-30 1-15-17-22-27-10-3-6-5-6-7 0Z" />
      <path d="M47 18v55M27 34l15 11-11 15m38-26L54 45l11 15M21 57l20 8m34-8-20 8M33 24l9 9m22-9-9 9" />
      <g><circle cx="27" cy="34" r="3"/><circle cx="21" cy="57" r="3"/><circle cx="69" cy="34" r="3"/><circle cx="75" cy="57" r="3"/><circle cx="42" cy="65" r="3"/><circle cx="54" cy="65" r="3"/></g>
    </svg>
  );
}

function RestaurantMark() {
  return (
    <svg viewBox="0 0 96 96" className="hbg-cover-restaurant-mark" aria-hidden="true">
      <path d="M25 13v27m-10-27v17m20-17v17M15 30c0 13 20 13 20 0M25 42v42M66 13c-14 18-14 34 0 39v32m0-71v39" />
      <path d="M47 17h3m-3 11h3m-3 11h3" className="hbg-cover-mark-highlight" />
    </svg>
  );
}

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
    <main className="hbg-universe-landing hbg-cover-v2">
      <div className="hbg-cover-nebula hbg-cover-nebula-one" aria-hidden="true" />
      <div className="hbg-cover-nebula hbg-cover-nebula-two" aria-hidden="true" />
      <div className="hbg-cover-starfield" aria-hidden="true" />
      <div className="hbg-cover-orbit hbg-cover-orbit-one" aria-hidden="true" />
      <div className="hbg-cover-orbit hbg-cover-orbit-two" aria-hidden="true" />
      <div className="hbg-cover-horizon" aria-hidden="true">
        <div className="hbg-cover-horizon-glow" />
        <div className="hbg-cover-city-lights" />
      </div>

      <header className="hbg-cover-header">
        <div className="hbg-cover-manifesto">
          <span>TU MUNDO</span>
          <span>TUS APPS</span>
          <span>TU UNIVERSO</span>
          <i />
        </div>
        <div className="hbg-cover-brand-mark" aria-label="Universo HBG">
          <span>∞</span>
          <small>HBG</small>
        </div>
        <div className="hbg-cover-values">
          <span>CREA</span><span>CONECTA</span><span>DISFRUTA</span><span>EVOLUCIONA</span>
          <i />
        </div>
      </header>

      <section className="hbg-cover-hero">
        <div className="hbg-cover-overline"><span /> UN ECOSISTEMA · POSIBILIDADES SIN LÍMITE <span /></div>
        <h1><span>UNIVERSO</span><strong>HBG</strong></h1>
        <div className="hbg-cover-tagline">TU VIDA DIGITAL, EN SU PROPIO UNIVERSO.</div>
        <p>Aplicaciones independientes. Un universo conectado. Infinitas posibilidades.</p>
        <div className="hbg-cover-signal"><i /> SISTEMA HBG <b>EN LÍNEA</b><i /></div>
      </section>

      <section className="hbg-cover-apps" aria-label="Aplicaciones del ecosistema">
        {APPS.map((app) => (
          <button
            key={app.id}
            type="button"
            className={"hbg-cover-app hbg-cover-app-" + app.tone}
            onClick={() => onSelect(app.id)}
          >
            <span className="hbg-cover-app-top"><small>{app.eyebrow}</small><b>↗</b></span>
            <span className="hbg-cover-app-art">
              {app.id === "vibra" ? <VibraMark /> : <InstintoMark />}
              <i />
            </span>
            <strong className="hbg-cover-app-title">{app.title}</strong>
            <span className="hbg-cover-app-subtitle">{app.subtitle}</span>
            <span className="hbg-cover-app-description">{app.description}</span>
            <span className="hbg-cover-app-action">ENTRAR AL MÓDULO <b>⟶</b></span>
          </button>
        ))}

        <article className="hbg-cover-app hbg-cover-app-restaurant" aria-label="QR Restaurant próximamente">
          <span className="hbg-cover-app-top"><small>03 / SOLUCIONES PARA NEGOCIOS</small><b>SOON</b></span>
          <span className="hbg-cover-app-art"><RestaurantMark /><i /></span>
          <strong className="hbg-cover-app-title">QR RESTAURANT</strong>
          <span className="hbg-cover-app-subtitle">MENÚ DIGITAL · FINANZAS · INSIGHTS</span>
          <span className="hbg-cover-app-description">La operación de tu restaurante, conectada en una experiencia simple y poderosa.</span>
          <span className="hbg-cover-app-action hbg-cover-app-action-soon">PRÓXIMAMENTE</span>
        </article>
      </section>

      <section className="hbg-cover-foundation" aria-label="Tecnología del ecosistema">
        <div className="hbg-cover-foundation-heading"><span>LA TECNOLOGÍA DETRÁS</span><i /></div>
        <div className="hbg-cover-foundation-grid">
          <button type="button" onClick={() => setShowCore(true)} className="hbg-cover-service hbg-cover-service-core">
            <span className="hbg-cover-service-icon">⌘</span><strong>HBG CORE</strong><small>CENTRO DE CONEXIÓN</small>
          </button>
          <div className="hbg-cover-service hbg-cover-service-authority">
            <span className="hbg-cover-service-icon">⬡</span><strong>HBG AUTHORITY</strong><small>PERMISOS Y SEGURIDAD</small>
          </div>
          <div className="hbg-cover-service hbg-cover-service-ai">
            <span className="hbg-cover-service-icon">✳</span><strong>IA HBG</strong><small>INTELIGENCIA TRANSVERSAL</small>
          </div>
          <div className="hbg-cover-service hbg-cover-service-insights">
            <span className="hbg-cover-service-icon">⌁</span><strong>HBG INSIGHTS</strong><small>DATOS Y OPORTUNIDADES</small>
          </div>
        </div>
      </section>

      <footer className="hbg-cover-footer">
        <span />
        <strong>CREA · CONECTA · EVOLUCIONA</strong>
        <small>UNIVERSO HBG</small>
        <span />
      </footer>
    </main>
  );
}
