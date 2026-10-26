import { useState, useEffect, type CSSProperties, type ReactNode } from "react";
import { hbgCore, MODULES, type ModuleConfig, type ModuleId } from "../core/hbgCore";
import { ownerSession, useOwnerSession } from "../core/ownerSession";
import { Sidebar } from "./Sidebar";
import { OwnerGate } from "./OwnerGate";
import { useLogoGesture } from "./useLogoGesture";
import { UniversoModule } from "../modules/universo";
import { InstintoModule } from "../modules/instinto";
import { VibraModule } from "../modules/vibra";
import { TerminadorModule } from "../modules/terminador";
import { TerminadorAppsSection } from "../modules/terminador-apps";

// En teléfono (pantalla angosta) se muestra un menú de tarjetas en vez de la barra lateral.
function useIsMobile(): boolean {
  const query = "(max-width: 800px)";
  const supported = typeof window !== "undefined" && typeof window.matchMedia === "function";
  const [mobile, setMobile] = useState(() => (supported ? window.matchMedia(query).matches : false));
  useEffect(() => {
    if (!supported) return;
    const list = window.matchMedia(query);
    const update = () => setMobile(list.matches);
    update();
    list.addEventListener("change", update);
    return () => list.removeEventListener("change", update);
  }, [supported]);
  return mobile;
}

function MobileMenu({
  modules,
  active,
  onSelect,
}: {
  modules: ModuleConfig[];
  active: ModuleId;
  onSelect: (id: ModuleId) => void;
}) {
  return (
    <div className="hbg-menu-list">
      {modules.map((mod) => (
        <button
          key={mod.id}
          className={`hbg-menu-card ${active === mod.id ? "active" : ""}`}
          style={{ "--item-color": mod.color } as CSSProperties}
          onClick={() => onSelect(mod.id)}
        >
          <span className="hbg-nav-icon">{mod.icon}</span>
          <div className="hbg-nav-info">
            <div className="hbg-nav-name">{mod.label}</div>
            <div className="hbg-nav-desc">{mod.description}</div>
          </div>
        </button>
      ))}
      <div className="hbg-version hbg-menu-footer">HBG CORE v1.0.0</div>
    </div>
  );
}

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

function ModulePanel({
  module,
  isOwner,
  checking,
}: {
  module: ModuleId;
  isOwner: boolean;
  checking: boolean;
}) {
  const [key, setKey] = useState(0);
  const [displayModule, setDisplayModule] = useState(module);

  useEffect(() => {
    setKey((k) => k + 1);
    setDisplayModule(module);
  }, [module]);

  // Terminador solo se dibuja con sesión de dueño confirmada por el servidor.
  const panels: Record<ModuleId, ReactNode> = {
    universo: <UniversoModule />,
    instinto: <InstintoModule />,
    vibra: <VibraModule />,
    terminador:
      isOwner && !checking ? (
        <>
          <TerminadorAppsSection />
          <TerminadorModule />
        </>
      ) : null,
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
  const [gateOpen, setGateOpen] = useState(false);
  const [showMenu, setShowMenu] = useState(true);
  const isMobile = useIsMobile();
  const { isOwner, checking } = useOwnerSession();

  useEffect(() => {
    const unsub = hbgCore.subscribe((mod) => setActiveModule(mod));
    return unsub;
  }, []);

  useEffect(() => {
    void ownerSession.checkSession();
  }, []);

  // Si el módulo guardado es Terminador pero no hay sesión de dueño, se vuelve a Universo.
  useEffect(() => {
    if (!checking && !isOwner && activeModule === "terminador") {
      hbgCore.setModule("universo");
    }
  }, [checking, isOwner, activeModule]);

  const logoGesture = useLogoGesture(() => {
    if (ownerSession.getState().isOwner) {
      hbgCore.setModule("terminador");
      setShowMenu(false);
    } else {
      setGateOpen(true);
    }
  });

  const config = hbgCore.getModuleConfig(activeModule);
  const visibleModules = isOwner ? MODULES : MODULES.filter((m) => m.id !== "terminador");
  const select = (id: ModuleId) => {
    hbgCore.setModule(id);
    setShowMenu(false);
  };

  return (
    <>
      <div className="hbg-scanlines" />
      <div className="hbg-shell">
        {/* Top bar */}
        <header className="hbg-topbar">
          <span className="hbg-logo" {...logoGesture}>
            UNIVERSO HBG
          </span>
          {isMobile && !showMenu && (
            <button
              className="hbg-btn hbg-btn-ghost hbg-topbar-btn"
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
            {isOwner && (
              <button
                className="hbg-btn hbg-btn-ghost hbg-topbar-btn"
                style={{ marginRight: 8 }}
                onClick={() => {
                  void ownerSession.logout().then(() => {
                    hbgCore.setModule("universo");
                    setShowMenu(true);
                  });
                }}
              >
                BLOQUEAR
              </button>
            )}
            <div className="hbg-status-dot" />
            <Clock />
          </div>
        </header>

        {/* Sidebar */}
        {!isMobile && <Sidebar active={activeModule} onSelect={select} isOwner={isOwner} />}

        {/* Main */}
        <main className="hbg-main">
          <div className="hbg-panel">
            {isMobile && showMenu ? (
              <MobileMenu modules={visibleModules} active={activeModule} onSelect={select} />
            ) : (
              <ModulePanel module={activeModule} isOwner={isOwner} checking={checking} />
            )}
          </div>
        </main>
      </div>
      {gateOpen && (
        <OwnerGate
          onClose={() => setGateOpen(false)}
          onSuccess={() => {
            setGateOpen(false);
            hbgCore.setModule("terminador");
            setShowMenu(false);
          }}
        />
      )}
    </>
  );
}