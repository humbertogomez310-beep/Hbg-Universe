import { useState, useEffect, type ReactNode, type CSSProperties } from "react";
import { hbgCore, MODULES, type ModuleId } from "../core/hbgCore";
import { Sidebar } from "./Sidebar";
import { UniversoModule } from "../modules/universo";
import { InstintoModule } from "../modules/instinto";
import { VibraModule } from "../modules/vibra";
import { TerminadorModule } from "../modules/terminador";

// Terminador es solo de administrador: se oculta hasta tocar 5 veces el pie del menú
const PUBLIC_MODULES: ModuleId[] = ["universo", "instinto", "vibra"];

function Clock() {
  const [time, setTime] = useState(new Date());
  useEffect(() => {
    const id = setInterval(() => setTime(new Date()), 1000);
    return () => clearInterval(id);
  }, []);
  return (
    <span className="hbg-clock">
      {time.toLocaleTimeString("es-ES", { hour12: false })}
    </span>
  );
}

function ModulePanel({ module }: { module: ModuleId }) {
  const [key, setKey] = useState(0);
  const [displayModule, setDisplayModule] = useState(module);

  useEffect(() => {
    setKey((k) => k + 1);
    setDisplayModule(module);
  }, [module]);

  const panels: Record<ModuleId, ReactNode> = {
    universo: <UniversoModule />,
    instinto: <InstintoModule />,
    vibra: <VibraModule />,
    terminador: <TerminadorModule />,
  };

  return (
    <div key={key} className="module-enter">
      {panels[displayModule]}
    </div>
  );
}

export function Shell() {
  const [activeModule, setActiveModule] = useState<ModuleId>(() => {
    hbgCore.init();
    return hbgCore.getModule();
  });
  const [showMenu, setShowMenu] = useState(true);
  const [footerClicks, setFooterClicks] = useState(0);
  const [adminUnlocked, setAdminUnlocked] = useState(false);

  useEffect(() => {
    const unsub = hbgCore.subscribe((mod) => setActiveModule(mod));
    return unsub;
  }, []);

  const config = hbgCore.getModuleConfig(activeModule);

  const handleSelect = (id: ModuleId) => {
    hbgCore.setModule(id);
    setShowMenu(false);
  };

  const handleFooterClick = () => {
    const next = footerClicks + 1;
    setFooterClicks(next);
    if (next >= 5) {
      setAdminUnlocked(true);
      setFooterClicks(0);
    }
  };

  const menuModules = adminUnlocked
    ? MODULES
    : MODULES.filter((m) => PUBLIC_MODULES.includes(m.id));

  return (
    <>
      <div className="hbg-scanlines" />
      <div className="hbg-shell">
        {/* Top bar */}
        <header className="hbg-topbar">
          <span className="hbg-logo">UNIVERSO HBG</span>
          {!showMenu && (
            <button
              className="hbg-mobile-back"
              onClick={() => setShowMenu(true)}
            >
              ← MENÚ
            </button>
          )}
          <div className="hbg-topbar-divider" />
          <span className="hbg-topbar-module">
            {config.icon} {config.label}
          </span>
          <div className="hbg-topbar-status">
            <div className="hbg-status-dot" />
            <Clock />
          </div>
        </header>

        {/* Sidebar (solo computadora) */}
        <Sidebar active={activeModule} onSelect={handleSelect} />

        {/* Menú de botones (solo teléfono) */}
        {showMenu && (
          <div
            className="hbg-mobile-menu-grid"
            style={{
              overflowY: "auto",
              gridColumn: "1 / -1",
              gridRow: 2,
              alignContent: "start",
            }}
          >
            {menuModules.map((mod) => (
              <button
                key={mod.id}
                className="hbg-mobile-menu-btn"
                style={{ "--item-color": mod.color } as CSSProperties}
                onClick={() => handleSelect(mod.id)}
              >
                <span className="hbg-mobile-menu-icon">{mod.icon}</span>
                <div className="hbg-mobile-menu-info">
                  <div className="hbg-mobile-menu-name">{mod.label}</div>
                  <div className="hbg-mobile-menu-desc">{mod.description}</div>
                </div>
              </button>
            ))}
            <div
              className="hbg-version"
              onClick={handleFooterClick}
              style={{ textAlign: "center", padding: "12px 0", userSelect: "none" }}
            >
              {adminUnlocked ? "⚙ MODO ADMIN" : "HBG CORE v1.0.0"}
            </div>
          </div>
        )}

        {/* Módulo abierto */}
        <main className={`hbg-main ${showMenu ? "mobile-hidden" : ""}`}>
          <div className="hbg-panel">
            <ModulePanel module={activeModule} />
          </div>
        </main>
      </div>
    </>
  );
}