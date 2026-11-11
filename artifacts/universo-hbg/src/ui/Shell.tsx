
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
import { VoiceCommandBar } from "../voice/VoiceCommandBar";

// En teléfono se muestra un menú de tarjetas en vez de la barra lateral.
function useIsMobile(): boolean {
  const query = "(max-width: 800px)";
  const supported =
    typeof window !== "undefined" &&
    typeof window.matchMedia === "function";

  const [mobile, setMobile] = useState(() =>
    supported ? window.matchMedia(query).matches : false
  );

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
    setKey((current) => current + 1);
    setDisplayModule(module);
  }, [module]);

  // Defensa adicional: Terminador nunca se monta sin sesión OWNER confirmada.
  if (displayModule === "terminador" && (!isOwner || checking)) {
    return <UniversoModule />;
  }

  const panels: Record<ModuleId, ReactNode> = {
    universo: <UniversoModule />,
    instinto: <InstintoModule />,
    vibra: <VibraModule />,
    terminador: (
      <>
        <TerminadorAppsSection />
        <TerminadorModule />
      </>
    ),
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

  const [showOwnerGate, setShowOwnerGate] = useState(false);
  const [showMenu, setShowMenu] = useState(true);

  const isMobile = useIsMobile();
  const { isOwner, checking } = useOwnerSession();

  useEffect(() => {
    const unsubscribe = hbgCore.subscribe((module) => {
      setActiveModule(module);
    });

    return unsubscribe;
  }, []);

  useEffect(() => {
    void ownerSession.checkSession();
  }, []);

  // Si localStorage restauró Terminador, la sesión del servidor decide.
  // Sin OWNER confirmado, se vuelve al módulo público.
  useEffect(() => {
    if (!checking && !isOwner && activeModule === "terminador") {
      hbgCore.setModule("universo");
    }
  }, [activeModule, checking, isOwner]);

  const selectModule = (module: ModuleId) => {
    if (module === "terminador" && (!isOwner || checking)) {
      setShowOwnerGate(true);
      return;
    }

    hbgCore.setModule(module);
    setShowMenu(false);
  };

  const handleLogoUnlock = () => {
    if (checking) return;

    if (isOwner) {
      hbgCore.setModule("terminador");
      setShowMenu(false);
    } else {
      setShowOwnerGate(true);
    }
  };

  const logoGesture = useLogoGesture(handleLogoUnlock);

  const config = hbgCore.getModuleConfig(
    activeModule === "terminador" && (!isOwner || checking)
      ? "universo"
      : activeModule
  );

  const visibleModules = isOwner
    ? MODULES
    : MODULES.filter((module) => module.id !== "terminador");

  return (
    <>
      <div className="hbg-scanlines" />

      <div className="hbg-shell">
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
            {isOwner && !checking && (
              <button
                type="button"
                className="hbg-btn hbg-btn-ghost hbg-topbar-btn"
                style={{ padding: "4px 8px", fontSize: 9 }}
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

        {!isMobile && (
          <Sidebar
            active={activeModule}
            isOwner={isOwner && !checking}
            onSelect={selectModule}
          />
        )}

        <main className="hbg-main">
          <div className="hbg-panel">

            {/* VIBRA permanece montada incluso cuando se abre el menú móvil. */}
            <div
              style={{
                display:
                  activeModule === "vibra" && !(isMobile && showMenu)
                    ? "block"
                    : "none",
              }}
            >
              <VibraModule />
            </div>

            {isMobile && showMenu ? (
              <MobileMenu
                modules={visibleModules}
                active={activeModule}
                onSelect={selectModule}
              />
            ) : activeModule !== "vibra" ? (
              <ModulePanel
                module={activeModule}
                isOwner={isOwner}
                checking={checking}
              />
            ) : null}

          </div>
        </main>
      </div>

      <VoiceCommandBar accentColor={config.color} />

      {showOwnerGate && (
        <OwnerGate
          onClose={() => setShowOwnerGate(false)}
          onSuccess={() => {
            setShowOwnerGate(false);
            hbgCore.setModule("terminador");
            setShowMenu(false);
          }}
        />
      )}
    </>
  );
}
