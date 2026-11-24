import { useState } from "react";

export function PWAUpdateButton() {
  const [checking, setChecking] = useState(false);
  const [notice, setNotice] = useState("");

  const updateApp = async () => {
    if (checking) return;
    if (!("serviceWorker" in navigator)) {
      setNotice("Este navegador no admite actualizaciones PWA.");
      return;
    }

    setChecking(true);
    setNotice("");

    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      if (!registration) {
        setNotice("No se encontró el Service Worker. Recarga la aplicación con Internet.");
        return;
      }

      // Listen before asking the browser to check, so a newly installing
      // worker cannot be missed between update() and listener registration.
      let installingWorker: ServiceWorker | null = registration.installing;
      const waitForActivation = (worker: ServiceWorker) =>
        new Promise<void>((resolve) => {
          if (worker.state === "activated" || worker.state === "redundant") {
            resolve();
            return;
          }

          const timeout = window.setTimeout(resolve, 20000);
          const finishIfSettled = () => {
            if (worker.state === "activated" || worker.state === "redundant") {
              window.clearTimeout(timeout);
              worker.removeEventListener("statechange", finishIfSettled);
              resolve();
            }
          };
          worker.addEventListener("statechange", finishIfSettled);
        });

      const updateFound = new Promise<void>((resolve) => {
        const onUpdateFound = () => {
          installingWorker = registration.installing;
          registration.removeEventListener("updatefound", onUpdateFound);
          resolve();
        };
        registration.addEventListener("updatefound", onUpdateFound, { once: true });
        window.setTimeout(() => {
          registration.removeEventListener("updatefound", onUpdateFound);
          resolve();
        }, 5000);
      });

      await registration.update();

      if (registration.waiting) {
        const waitingWorker = registration.waiting;
        waitingWorker.postMessage({ type: "SKIP_WAITING" });
        await waitForActivation(waitingWorker);
      } else {
        if (!installingWorker) await updateFound;
        installingWorker = registration.installing || installingWorker;
        if (installingWorker) {
          await waitForActivation(installingWorker);
        }
        const waitingWorker = registration.waiting as ServiceWorker | null;
        if (waitingWorker) {
          waitingWorker.postMessage({ type: "SKIP_WAITING" });
          await waitForActivation(waitingWorker);
        }
      }

      // Always reload after an explicit update request. Navigation is
      // network-first in sw.js, so this fetches the current HTML entrypoint
      // even when the service-worker script itself has not changed.
      window.location.reload();
    } catch (error) {
      console.error("No se pudo actualizar UNIVERSO HBG:", error);
      setNotice("No se pudo comprobar la actualización. Verifica tu conexión e inténtalo otra vez.");
      setChecking(false);
    }
  };

  return (
    <div style={{ position: "relative" }}>
      <button
        type="button"
        className="hbg-btn hbg-btn-ghost hbg-topbar-btn"
        onClick={() => void updateApp()}
        disabled={checking}
        aria-label="Buscar e instalar actualizaciones de UNIVERSO HBG"
        title="Actualizar aplicación"
        style={{ padding: "4px 8px", fontSize: 9 }}
      >
        {checking ? "ACTUALIZANDO..." : "↻ ACTUALIZAR"}
      </button>
      {notice && (
        <div
          role="status"
          aria-live="polite"
          style={{
            position: "absolute",
            zIndex: 10000,
            top: "calc(100% + 10px)",
            right: 0,
            width: "min(300px, calc(100vw - 24px))",
            padding: 12,
            border: "1px solid rgba(0,229,255,0.35)",
            borderRadius: 6,
            background: "#101827",
            color: "#e8f0ff",
            fontSize: 11,
            lineHeight: 1.5,
          }}
        >
          {notice}
          <button
            type="button"
            className="hbg-btn hbg-btn-ghost"
            onClick={() => setNotice("")}
            style={{ display: "block", marginTop: 8, padding: "4px 8px", fontSize: 9 }}
          >
            CERRAR
          </button>
        </div>
      )}
    </div>
  );
}
