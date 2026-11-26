
import { lazy, Suspense, useState, useEffect, type ReactNode } from "react";
import { hbgCore, type ModuleId } from "../core/hbgCore";
import { ownerSession, useOwnerSession } from "../core/ownerSession";
import { useLogoGesture } from "./useLogoGesture";
import { UniversoLanding } from "../components/UniversoLanding";
import { PWAInstallButton } from "../components/PWAInstallButton";

// Cada aplicación se descarga solo cuando el usuario la abre.
// VIBRA se conserva montada después de la primera apertura para no interrumpir audio.
const LazySidebar = lazy(() => import("./Sidebar").then((module) => ({ default: module.Sidebar })));
const LazyPWAUpdateButton = lazy(() => import("../components/PWAUpdateButton").then((module) => ({ default: module.PWAUpdateButton })));
const LazyOwnerGate = lazy(() => import("./OwnerGate").then((module) => ({ default: module.OwnerGate })));
const LazyInstintoModule = lazy(() => import("../modules/instinto").then((module) => ({ default: module.InstintoModule })));
const LazyVibraModule = lazy(() => import("../modules/vibra").then((module) => ({ default: module.VibraModule })));
const LazyTerminadorModule = lazy(() => import("../modules/terminador").then((module) => ({ default: module.TerminadorModule })));
const LazyTerminadorAppsSection = lazy(() => import("../modules/terminador-apps").then((module) => ({ default: module.TerminadorAppsSection })));
const LazyVoiceCommandBar = lazy(() => import("../voice/VoiceCommandBar").then((module) => ({ default: module.VoiceCommandBar })));

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
    instinto: (
      <Suspense fallback={<div className="hbg-card">CARGANDO INSTINTO…</div>}>
        <div className="hbg-app-experience hbg-app-experience-instinto"><LazyInstintoModule /></div>
      </Suspense>
    ),
    vibra: (
      <Suspense fallback={<div className="hbg-card">CARGANDO VIBRA…</div>}>
        <div className="hbg-app-experience hbg-app-experience-vibra"><LazyVibraModule /></div>
      </Suspense>
    ),
    terminador: (
      <Suspense fallback={<div className="hbg-card">CARGANDO TERMINADOR…</div>}>
        <>
          <LazyTerminadorAppsSection />
          <LazyTerminadorModule />
        </>
      </Suspense>
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
  const [vibraMounted, setVibraMounted] = useState(() => hbgCore.getModule() === "vibra");
  const [voiceMounted, setVoiceMounted] = useState(false);

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
    if (activeModule === "vibra") setVibraMounted(true);
  }, [activeModule]);

  // Voice controls load after the first paint so they do not compete with the app shell.
  useEffect(() => {
    const timer = window.setTimeout(() => setVoiceMounted(true), 1800);
    return () => window.clearTimeout(timer);
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
            {voiceMounted && (
              <Suspense fallback={null}>
                <LazyPWAUpdateButton />
              </Suspense>
            )}
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
          <Suspense fallback={null}>
            <LazySidebar
              active={activeModule}
              isOwner={isOwner && !checking}
              onSelect={selectModule}
            />
          </Suspense>
        )}

        <main className="hbg-main">
          <div className="hbg-panel">

            {/* VIBRA permanece montada incluso cuando se abre el menú móvil. */}
            {vibraMounted && (
              <div
                className="hbg-app-experience hbg-app-experience-vibra"
                style={{
                  display:
                    activeModule === "vibra" && !(isMobile && showMenu)
                      ? "block"
                      : "none",
                }}
              >
                <Suspense fallback={<div className="hbg-card">CARGANDO VIBRA…</div>}>
                  <LazyVibraModule />
                </Suspense>
              </div>
            )}

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

      {voiceMounted && (
        <Suspense fallback={null}>
          <LazyVoiceCommandBar accentColor={config.color} />
        </Suspense>
      )}

      {showOwnerGate && (
        <Suspense fallback={<div className="hbg-card">VERIFICANDO ACCESO…</div>}>
          <LazyOwnerGate
            onClose={() => setShowOwnerGate(false)}
            onSuccess={() => {
              setShowOwnerGate(false);
              hbgCore.setModule("terminador");
              setShowMenu(false);
            }}
          />
        </Suspense>
      )}
    </>
  );
}
