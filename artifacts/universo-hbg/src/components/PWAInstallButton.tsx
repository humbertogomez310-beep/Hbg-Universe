import { useEffect, useState } from "react";

interface BeforeInstallPromptEvent extends Event {
  prompt: () => Promise<void>;
  userChoice: Promise<{ outcome: "accepted" | "dismissed"; platform: string }>;
}

declare global {
  interface Window {
    __hbgDeferredInstallPrompt?: BeforeInstallPromptEvent | null;
    __hbgInstallListenerReady?: boolean;
  }
}

if (typeof window !== "undefined" && !window.__hbgInstallListenerReady) {
  window.__hbgInstallListenerReady = true;

  window.addEventListener("beforeinstallprompt", (event: Event) => {
    event.preventDefault();
    window.__hbgDeferredInstallPrompt = event as BeforeInstallPromptEvent;
    window.dispatchEvent(new Event("hbg-install-available"));
  });

  window.addEventListener("appinstalled", () => {
    window.__hbgDeferredInstallPrompt = null;
    window.dispatchEvent(new Event("hbg-app-installed"));
  });
}

function isStandalone(): boolean {
  if (typeof window === "undefined") return false;
  const displayMode =
    typeof window.matchMedia === "function" &&
    window.matchMedia("(display-mode: standalone)").matches;
  const iosStandalone =
    (navigator as Navigator & { standalone?: boolean }).standalone === true;
  return displayMode || iosStandalone;
}

function isIOS(): boolean {
  if (typeof navigator === "undefined") return false;
  return (
    /iPad|iPhone|iPod/.test(navigator.userAgent) ||
    (navigator.platform === "MacIntel" && navigator.maxTouchPoints > 1)
  );
}

export function PWAInstallButton() {
  const [installAvailable, setInstallAvailable] = useState(false);
  const [installed, setInstalled] = useState(false);
  const [showInstructions, setShowInstructions] = useState(false);
  const [installing, setInstalling] = useState(false);
  const ios = isIOS();

  useEffect(() => {
    const updateAvailability = () => {
      setInstallAvailable(Boolean(window.__hbgDeferredInstallPrompt));
    };
    const markInstalled = () => {
      setInstalled(true);
      setInstallAvailable(false);
      setShowInstructions(false);
    };

    setInstalled(isStandalone());
    updateAvailability();

    window.addEventListener("hbg-install-available", updateAvailability);
    window.addEventListener("hbg-app-installed", markInstalled);
    window.addEventListener("appinstalled", markInstalled);

    const displayMode = window.matchMedia?.("(display-mode: standalone)");
    displayMode?.addEventListener?.("change", () => {
      if (isStandalone()) markInstalled();
    });

    return () => {
      window.removeEventListener("hbg-install-available", updateAvailability);
      window.removeEventListener("hbg-app-installed", markInstalled);
      window.removeEventListener("appinstalled", markInstalled);
    };
  }, []);

  const handleInstall = async () => {
    if (installed || installing) return;

    const promptEvent = window.__hbgDeferredInstallPrompt;
    if (!promptEvent) {
      setShowInstructions((visible) => !visible);
      return;
    }

    try {
      setInstalling(true);
      await promptEvent.prompt();
      const choice = await promptEvent.userChoice;
      window.__hbgDeferredInstallPrompt = null;
      setInstallAvailable(false);

      if (choice.outcome === "accepted") {
        setShowInstructions(false);
      } else {
        setShowInstructions(true);
      }
    } catch (error) {
      console.error("No se pudo iniciar la instalación de UNIVERSO HBG:", error);
      setShowInstructions(true);
    } finally {
      setInstalling(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="hbg-btn hbg-btn-ghost hbg-topbar-btn"
        onClick={() => void handleInstall()}
        disabled={installed || installing}
        aria-label={installed ? "UNIVERSO HBG ya está instalado" : "Instalar UNIVERSO HBG"}
        aria-expanded={showInstructions}
        title={installed ? "Aplicación instalada" : "Instalar aplicación"}
        style={{ padding: "4px 8px", fontSize: 9, opacity: installed ? 0.75 : 1 }}
      >
        {installed ? "✓ INSTALADA" : installing ? "PREPARANDO..." : "↓ INSTALAR"}
      </button>

      {showInstructions && !installed && (
        <div
          role="dialog"
          aria-label="Instrucciones para instalar UNIVERSO HBG"
          style={{
            position: "absolute",
            zIndex: 10000,
            top: "calc(100% + 10px)",
            right: 0,
            width: "min(320px, calc(100vw - 24px))",
            padding: 14,
            border: "1px solid rgba(0,229,255,0.35)",
            borderRadius: 6,
            background: "#101827",
            boxShadow: "0 12px 36px rgba(0,0,0,0.45)",
            color: "#e8f0ff",
            whiteSpace: "normal",
          }}
        >
          <div style={{ fontSize: 11, fontWeight: 700, color: "#00e5ff", marginBottom: 8 }}>
            INSTALAR UNIVERSO HBG
          </div>
          <div style={{ fontSize: 11, lineHeight: 1.7 }}>
            {ios ? (
              <>
                {/Safari/i.test(navigator.userAgent) ? (
                  <>1. Pulsa <strong>Compartir</strong> en Safari.<br />2. Selecciona <strong>Añadir a pantalla de inicio</strong>.<br />3. Confirma con <strong>Añadir</strong>.</>
                ) : (
                  <>En iPhone o iPad, abre esta dirección con <strong>Safari</strong>. Después pulsa <strong>Compartir → Añadir a pantalla de inicio</strong> y confirma.</>
                )}
              </>
            ) : (
              <>1. Abre el menú del navegador (⋮).<br />2. Selecciona <strong>Instalar aplicación</strong> o <strong>Añadir a pantalla de inicio</strong>.<br />3. Confirma la instalación.</>
            )}
          </div>
          <button
            type="button"
            className="hbg-btn hbg-btn-ghost"
            onClick={() => setShowInstructions(false)}
            style={{ marginTop: 10, padding: "5px 9px", fontSize: 9 }}
          >
            CERRAR
          </button>
        </div>
      )}
    </div>
  );
}
