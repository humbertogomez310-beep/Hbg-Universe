import {
  useState,
  useEffect,
  useRef,
  type ReactNode,
  type CSSProperties,
  type PointerEvent as ReactPointerEvent,
} from "react";
import { hbgCore, MODULES, type ModuleId } from "../core/hbgCore";
import { ownerSession, type OwnerSessionSnapshot } from "../core/ownerSession";
import { Sidebar } from "./Sidebar";
import { OwnerGate } from "./OwnerGate";
import { UniversoModule } from "../modules/universo";
import { InstintoModule } from "../modules/instinto";
import { VibraModule } from "../modules/vibra";
import { TerminadorModule } from "../modules/terminador";

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

  if (
    (module === "terminador" || displayModule === "terminador") &&
    (!isOwner || checking)
  ) {
    return null;
  }

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
  const [ownerState, setOwnerState] = useState<OwnerSessionSnapshot>(() =>
    ownerSession.getSnapshot(),
  );
  const [ownerGateOpen, setOwnerGateOpen] = useState(false);
  const tapCountRef = useRef(0);
  const lastTapAtRef = useRef(0);
  const armedUntilRef = useRef(0);
  const armTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const holdTimeoutRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const pressedPointerRef = useRef<number | null>(null);
  const holdPointerRef = useRef<number | null>(null);

  useEffect(() => {
    const unsub = hbgCore.subscribe((mod) => setActiveModule(mod));
    return unsub;
  }, []);

  useEffect(() => {
    const syncOwnerState = () => setOwnerState(ownerSession.getSnapshot());
    const unsubscribe = ownerSession.subscribe(syncOwnerState);
    syncOwnerState();
    return unsubscribe;
  }, []);

  useEffect(() => {
    if (
      !ownerState.checking &&
      !ownerState.isOwner &&
      activeModule === "terminador"
    ) {
      hbgCore.setModule("universo");
    }
  }, [activeModule, ownerState.checking, ownerState.isOwner]);

  const safeActiveModule =
    activeModule === "terminador" &&
    (!ownerState.isOwner || ownerState.checking)
      ? "universo"
      : activeModule;
  const config = hbgCore.getModuleConfig(safeActiveModule);

  const handleSelect = (id: ModuleId) => {
    if (id === "terminador" && (!ownerState.isOwner || ownerState.checking)) {
      return;
    }
    hbgCore.setModule(id);
    setShowMenu(false);
  };

  const clearGestureTimers = () => {
    if (armTimeoutRef.current) clearTimeout(armTimeoutRef.current);
    if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
    armTimeoutRef.current = null;
    holdTimeoutRef.current = null;
  };

  const resetLogoGesture = () => {
    clearGestureTimers();
    tapCountRef.current = 0;
    lastTapAtRef.current = 0;
    armedUntilRef.current = 0;
    pressedPointerRef.current = null;
    holdPointerRef.current = null;
  };

  const activateTerminator = () => {
    resetLogoGesture();
    if (ownerSession.isOwner) {
      hbgCore.setModule("terminador");
      setShowMenu(false);
      return;
    }
    setOwnerGateOpen(true);
  };

  const handleLogoPointerDown = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (event.pointerType === "mouse" && event.button !== 0) return;
    if (
      pressedPointerRef.current !== null ||
      holdPointerRef.current !== null
    ) {
      return;
    }
    try {
      event.currentTarget.setPointerCapture(event.pointerId);
    } catch {
      // Pointer capture may be unavailable for a browser-managed pointer.
    }
    pressedPointerRef.current = event.pointerId;

    const holdStartedAt = Date.now();
    const armedUntil = armedUntilRef.current;
    if (armedUntil > 0 && holdStartedAt <= armedUntil) {
      holdPointerRef.current = event.pointerId;
      holdTimeoutRef.current = setTimeout(() => {
        holdTimeoutRef.current = null;
        if (
          holdPointerRef.current === event.pointerId &&
          armedUntilRef.current === armedUntil &&
          holdStartedAt <= armedUntil
        ) {
          activateTerminator();
        }
      }, 2000);
    }
  };

  const handleLogoPointerUp = (event: ReactPointerEvent<HTMLSpanElement>) => {
    if (
      pressedPointerRef.current !== event.pointerId &&
      holdPointerRef.current !== event.pointerId
    ) {
      return;
    }
    if (pressedPointerRef.current === event.pointerId) {
      pressedPointerRef.current = null;
    }
    if (holdPointerRef.current === event.pointerId) {
      holdPointerRef.current = null;
      if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
      holdTimeoutRef.current = null;
    }

    const now = Date.now();
    if (armedUntilRef.current > 0) {
      if (now >= armedUntilRef.current) resetLogoGesture();
      return;
    }
    tapCountRef.current =
      lastTapAtRef.current > 0 && now - lastTapAtRef.current <= 2000
        ? tapCountRef.current + 1
        : 1;
    lastTapAtRef.current = now;

    if (tapCountRef.current === 5) {
      armedUntilRef.current = now + 10000;
      armTimeoutRef.current = setTimeout(() => {
        armTimeoutRef.current = null;
        if (holdPointerRef.current === null) resetLogoGesture();
      }, 10000);
    }
  };

  const handleLogoPointerCancel = (
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    if (pressedPointerRef.current === event.pointerId) {
      pressedPointerRef.current = null;
    }
    if (
      holdPointerRef.current === event.pointerId &&
      armedUntilRef.current > 0
    ) {
      return;
    }
    if (holdPointerRef.current === event.pointerId) {
      holdPointerRef.current = null;
    }
    if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
    holdTimeoutRef.current = null;
  };

  const handleLostLogoPointerCapture = (
    event: ReactPointerEvent<HTMLSpanElement>,
  ) => {
    if (pressedPointerRef.current === event.pointerId) {
      pressedPointerRef.current = null;
    }
    if (holdPointerRef.current !== event.pointerId) return;
    holdPointerRef.current = null;
    if (holdTimeoutRef.current) clearTimeout(holdTimeoutRef.current);
    holdTimeoutRef.current = null;
    if (
      armedUntilRef.current > 0 &&
      Date.now() >= armedUntilRef.current
    ) {
      resetLogoGesture();
    }
  };

  useEffect(
    () => () => {
      clearGestureTimers();
    },
    [],
  );

  const handleLock = () => {
    void ownerSession.logout();
    hbgCore.setModule("universo");
    setShowMenu(true);
  };

  const menuModules = MODULES.filter(
    (module) => module.id !== "terminador" || ownerState.isOwner,
  );

  return (
    <>
      <div className="hbg-scanlines" />
      <div className="hbg-shell">
        {/* Top bar */}
        <header className="hbg-topbar">
          <span
            className="hbg-logo"
            onPointerDown={handleLogoPointerDown}
            onPointerUp={handleLogoPointerUp}
            onPointerCancel={handleLogoPointerCancel}
            onLostPointerCapture={handleLostLogoPointerCapture}
            onContextMenu={(event) => event.preventDefault()}
            style={
              {
                display: "inline-block",
                padding: "14px 10px",
                margin: "-14px -10px",
                userSelect: "none",
                WebkitUserSelect: "none",
                WebkitTouchCallout: "none",
                WebkitTapHighlightColor: "transparent",
                touchAction: "none",
              } as CSSProperties
            }
          >
            UNIVERSO HBG
          </span>
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
            {ownerState.isOwner && (
              <button
                className="hbg-btn hbg-btn-ghost"
                onClick={handleLock}
                style={{ minHeight: 30, padding: "4px 9px", fontSize: 9 }}
              >
                BLOQUEAR
              </button>
            )}
            <div className="hbg-status-dot" />
            <Clock />
          </div>
        </header>

        {/* Sidebar (solo computadora) */}
        <Sidebar
          active={safeActiveModule}
          isOwner={ownerState.isOwner}
          onSelect={handleSelect}
        />

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
            <div className="hbg-version" style={{ textAlign: "center", padding: "12px 0" }}>
              HBG CORE v1.0.0
            </div>
          </div>
        )}

        {/* Módulo abierto */}
        <main className={`hbg-main ${showMenu ? "mobile-hidden" : ""}`}>
          <div className="hbg-panel">
            <ModulePanel
              module={activeModule}
              isOwner={ownerState.isOwner}
              checking={ownerState.checking}
            />
          </div>
        </main>
      </div>
      {ownerGateOpen && (
        <OwnerGate
          onCancel={() => setOwnerGateOpen(false)}
          onSuccess={() => {
            setOwnerGateOpen(false);
            hbgCore.setModule("terminador");
            setShowMenu(false);
          }}
        />
      )}
    </>
  );
}