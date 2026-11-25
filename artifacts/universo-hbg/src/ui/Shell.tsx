
import { useState, useEffect, type ReactNode } from "react";
import { hbgCore, type ModuleId } from "../core/hbgCore";
import { ownerSession, useOwnerSession } from "../core/ownerSession";
import { Sidebar } from "./Sidebar";
import { OwnerGate } from "./OwnerGate";
import { useLogoGesture } from "./useLogoGesture";
import { UniversoLanding } from "../components/UniversoLanding";
import { InstintoModule } from "../modules/instinto";
import { VibraModule } from "../modules/vibra";
import { TerminadorModule } from "../modules/terminador";
import { TerminadorAppsSection } from "../modules/terminador-apps";
import { VoiceCommandBar } from "../voice/VoiceCommandBar";
import { PWAInstallButton } from "../components/PWAInstallButton";
import { PWAUpdateButton } from "../components/PWAUpdateButton";

// Detección responsive compartida por escritorio y móvil.
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
  onSelect,
}: {
  module: ModuleId;
  isOwner: boolean;
  checking: boolean;
  onSelect: (id: ModuleId) => void;
}) {
  const [key, setKey] = useState(0);
  const [displayModule, setDisplayModule] = useState(module);

  useEffect(() => {
    setKey((current) => current + 1);
    setDisplayModule(module);
  }, [module]);

  // Defensa adicional: Terminador nunca se monta sin sesión OWNER confirmada.
  if (displayModule === "terminador" && (!isOwner || checking)) {
    return <UniversoLanding onSelect={onSelect} />;
  }

  const panels: Record<ModuleId, ReactNode> = {
    universo: <UniversoLanding onSelect={onSelect} />,
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
            <PWAInstallButton />
            <PWAUpdateButton />
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
              <UniversoLanding onSelect={selectModule} />
            ) : activeModule !== "vibra" ? (
              <ModulePanel
                module={activeModule}
                isOwner={isOwner}
                checking={checking}
                onSelect={selectModule}
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
