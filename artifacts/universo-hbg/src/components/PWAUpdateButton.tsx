import { useState } from "react";

function waitForWorkerActivation(worker: ServiceWorker): Promise<void> {
  if (worker.state === "activated") return Promise.resolve();
  if (worker.state === "redundant") {
    return Promise.reject(new Error("El nuevo Service Worker fue descartado antes de activarse."));
  }

  return new Promise((resolve, reject) => {
    const timeout = window.setTimeout(() => {
      cleanup();
      reject(new Error("La activación del nuevo Service Worker excedió el tiempo de espera."));
    }, 45000);

    const onStateChange = () => {
      if (worker.state === "activated") {
        cleanup();
        resolve();
      } else if (worker.state === "redundant") {
        cleanup();
        reject(new Error("El nuevo Service Worker falló y fue descartado."));
      }
    };

    const cleanup = () => {
      window.clearTimeout(timeout);
      worker.removeEventListener("statechange", onStateChange);
    };

    worker.addEventListener("statechange", onStateChange);
    onStateChange();
  });
}

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
        setChecking(false);
        return;
      }

      // Subscribe before update() so a fast updatefound event cannot be missed.
      let resolveUpdateFound: (() => void) | undefined;
      const updateFound = new Promise<void>((resolve) => {
        resolveUpdateFound = resolve;
      });
      const onUpdateFound = () => {
        registration.removeEventListener("updatefound", onUpdateFound);
        resolveUpdateFound?.();
      };
      registration.addEventListener("updatefound", onUpdateFound, { once: true });

      try {
        await registration.update();
      } finally {
        registration.removeEventListener("updatefound", onUpdateFound);
      }

      let worker = registration.waiting || registration.installing;
      if (!worker && resolveUpdateFound) {
        await Promise.race([
          updateFound,
          new Promise<void>((resolve) => window.setTimeout(resolve, 5000)),
        ]);
        worker = registration.waiting || registration.installing;
      }

      if (!worker) {
        setNotice("La aplicación ya está actualizada. No se encontró una versión nueva.");
        setChecking(false);
        return;
      }

      if (worker.state === "redundant") {
        throw new Error("El nuevo Service Worker fue descartado antes de activarse.");
      }

      if (registration.waiting === worker) {
        worker.postMessage({ type: "SKIP_WAITING" });
      }

      await waitForWorkerActivation(worker);

      if (registration.active !== worker) {
        throw new Error("El nuevo Service Worker no quedó como versión activa.");
      }

      // The worker's activate handler completes clients.claim() before the
      // activated state is reached. Reload only after that confirmation.
      window.location.reload();
    } catch (error) {
      console.error("No se pudo actualizar UNIVERSO HBG:", error);
      setNotice(
        error instanceof Error
          ? `La actualización no se completó: ${error.message}`
          : "No se pudo comprobar la actualización. Verifica tu conexión e inténtalo otra vez.",
      );
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
