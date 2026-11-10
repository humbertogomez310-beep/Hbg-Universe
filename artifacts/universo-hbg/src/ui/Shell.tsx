import { useState, useEffect, type ReactNode } from "react";
import { hbgCore, type ModuleId } from "../core/hbgCore";
import { ownerSession, useOwnerSession } from "../core/ownerSession";
import { Sidebar } from "./Sidebar";
import { OwnerGate } from "./OwnerGate";
import { useLogoGesture } from "./useLogoGesture";
import { UniversoModule } from "../modules/universo";
import { InstintoModule } from "../modules/instinto";
import { VibraModule } from "../modules/vibra";
import { TerminadorModule } from "../modules/terminador";
import { VoiceCommandBar } from "../voice/VoiceCommandBar";

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

  let panel: ReactNode;

  switch (displayModule) {
    case "universo":
      panel = <UniversoModule />;
      break;
    case "instinto":
      panel = <InstintoModule />;
      break;
    case "vibra":
      panel = <VibraModule />;
      break;
    case "terminador":
      panel = <TerminadorModule />;
      break;
  }

  return (
    <div key={key} className="module-enter">
      {panel}
    </div>
  );
}

export function Shell() {
  const [activeModule, setActiveModule] = useState<ModuleId>(() => {
    hbgCore.init();
    return hbgCore.getModule();
  });
  const [showOwnerGate, setShowOwnerGate] = useState(false);
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
  };

  const handleLogoUnlock = () => {
    if (checking) return;

    if (isOwner) {
      hbgCore.setModule("terminador");
    } else {
      setShowOwnerGate(true);
    }
  };

  const logoGesture = useLogoGesture(handleLogoUnlock);
  const config = hbgCore.getModuleConfig(
    activeModule === "terminador" && (!isOwner || checking)
      ? "universo"
      : activeModule,
  );

  return (
    <>
      <div className="hbg-scanlines" />
      <div className="hbg-shell">
        <header className="hbg-topbar">
          <span className="hbg-logo" {...logoGesture}>
            UNIVERSO HBG
          </span>

          <div className="hbg-topbar-divider" />

          <span className="hbg-topbar-module">
            {config.icon} {config.label}
          </span>

          <div className="hbg-topbar-status">
            {isOwner && !checking && (
              <button
                type="button"
                className="hbg-btn hbg-btn-ghost"
                style={{ padding: "4px 8px", fontSize: 9 }}
                onClick={() => {
                  void ownerSession.logout();
                  hbgCore.setModule("universo");
                }}
              >
                CERRAR SESIÓN OWNER
              </button>
            )}
            <div className="hbg-status-dot" />
            <Clock />
          </div>
        </header>

        <Sidebar
          active={activeModule}
          isOwner={isOwner && !checking}
          onSelect={selectModule}
        />

        <main className="hbg-main">
          <div className="hbg-panel">
            <div
              style={{
                display: activeModule === "vibra" ? "block" : "none",
              }}
            >
              <VibraModule />
            </div>

            {activeModule !== "vibra" && (
              <ModulePanel
                module={activeModule}
                isOwner={isOwner}
                checking={checking}
              />
            )}
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
          }}
        />
      )}
    </>
  );
}
