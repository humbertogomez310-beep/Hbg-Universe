import { useCallback, useEffect, useState } from "react";
import { fetchLatestBuild, isUpdateAvailable } from "../pwa/versioning";

declare const __HBG_BUILD_ID__: string;

const CURRENT_BUILD_ID = typeof __HBG_BUILD_ID__ === "string" ? __HBG_BUILD_ID__ : "development";
const AVAILABLE_BUILD_KEY = "hbg-pwa-update-available-build";
const PENDING_BUILD_KEY = "hbg-pwa-update-pending-build";

function readAvailableBuild(): string | null {
  try {
    return window.localStorage.getItem(AVAILABLE_BUILD_KEY);
  } catch {
    return null;
  }
}

function storeAvailableBuild(buildId: string | null) {
  try {
    if (buildId) window.localStorage.setItem(AVAILABLE_BUILD_KEY, buildId);
    else window.localStorage.removeItem(AVAILABLE_BUILD_KEY);
  } catch {
    // Storage may be disabled; online checks still work for this session.
  }
}

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
  const [availableBuild, setAvailableBuild] = useState<string | null>(() => readAvailableBuild());
  const [notice, setNotice] = useState("");

  const checkForUpdates = useCallback(async () => {
    if (!navigator.onLine) return;
    const latestBuild = await fetchLatestBuild();
    if (!latestBuild) return;

    if (isUpdateAvailable(CURRENT_BUILD_ID, latestBuild)) {
      storeAvailableBuild(latestBuild);
      setAvailableBuild(latestBuild);
    } else {
      storeAvailableBuild(null);
      setAvailableBuild(null);
    }
  }, []);

  useEffect(() => {
    let disposed = false;

    const check = async () => {
      if (!navigator.onLine || document.visibilityState === "hidden") return;
      const latestBuild = await fetchLatestBuild();
      if (!latestBuild || disposed) return;

      let pendingBuild: string | null = null;
      try {
        pendingBuild = window.sessionStorage.getItem(PENDING_BUILD_KEY);
      } catch {
        // Confirmation still falls back to the live version comparison.
      }

      if (pendingBuild) {
        try {
          window.sessionStorage.removeItem(PENDING_BUILD_KEY);
        } catch {
          // Ignore unavailable session storage.
        }

        if (pendingBuild === CURRENT_BUILD_ID && latestBuild === CURRENT_BUILD_ID) {
          storeAvailableBuild(null);
          setAvailableBuild(null);
          setNotice(`ACTUALIZACIÓN COMPLETADA · ${CURRENT_BUILD_ID.slice(0, 12)}`);
        } else {
          storeAvailableBuild(latestBuild === CURRENT_BUILD_ID ? null : latestBuild);
          setAvailableBuild(latestBuild === CURRENT_BUILD_ID ? null : latestBuild);
          setNotice("La recarga terminó, pero no se pudo confirmar que la nueva versión esté activa. Vuelve a intentarlo con conexión.");
        }
        return;
      }

      if (isUpdateAvailable(CURRENT_BUILD_ID, latestBuild)) {
        storeAvailableBuild(latestBuild);
        setAvailableBuild(latestBuild);
      } else {
        storeAvailableBuild(null);
        setAvailableBuild(null);
      }
    };

    const onVisible = () => {
      if (document.visibilityState === "visible") void check();
    };

    void check();
    window.addEventListener("online", onVisible);
    window.addEventListener("focus", onVisible);
    document.addEventListener("visibilitychange", onVisible);
    const interval = window.setInterval(() => void check(), 180000);

    return () => {
      disposed = true;
      window.removeEventListener("online", onVisible);
      window.removeEventListener("focus", onVisible);
      document.removeEventListener("visibilitychange", onVisible);
      window.clearInterval(interval);
    };
  }, []);

  const updateAvailable = isUpdateAvailable(CURRENT_BUILD_ID, availableBuild);

  const updateApp = async () => {
    if (checking) return;
    if (!("serviceWorker" in navigator)) {
      setNotice("Este navegador no admite actualizaciones PWA.");
      return;
    }
    if (!navigator.onLine) {
      setNotice("Necesitas conexión a Internet para descargar la actualización.");
      return;
    }

    setChecking(true);
    setNotice("");

    try {
      const latestBuild = await fetchLatestBuild();
      if (!latestBuild) throw new Error("No se pudo consultar la versión publicada.");
      if (!isUpdateAvailable(CURRENT_BUILD_ID, latestBuild)) {
        storeAvailableBuild(null);
        setAvailableBuild(null);
        setNotice(`UNIVERSO HBG YA ESTÁ ACTUALIZADO · ${CURRENT_BUILD_ID.slice(0, 12)}`);
        setChecking(false);
        return;
      }

      storeAvailableBuild(latestBuild);
      setAvailableBuild(latestBuild);

      const registration = await navigator.serviceWorker.getRegistration("/");
      if (!registration) {
        throw new Error("No se encontró el Service Worker. Abre la aplicación con Internet e inténtalo otra vez.");
      }

      let resolveUpdateFound: (() => void) | undefined;
      const updateFound = new Promise<void>((resolve) => {
        resolveUpdateFound = resolve;
      });
      const onUpdateFound = () => resolveUpdateFound?.();
      registration.addEventListener("updatefound", onUpdateFound, { once: true });

      let worker: ServiceWorker | null = null;
      try {
        await registration.update();
        worker = registration.waiting || registration.installing;
        if (!worker) {
          await Promise.race([
            updateFound,
            new Promise<void>((resolve) => window.setTimeout(resolve, 5000)),
          ]);
          worker = registration.waiting || registration.installing;
        }
      } finally {
        registration.removeEventListener("updatefound", onUpdateFound);
      }

      if (worker) {
        if (worker.state === "redundant") {
          throw new Error("El nuevo Service Worker fue descartado antes de activarse.");
        }
        if (registration.waiting === worker) worker.postMessage({ type: "SKIP_WAITING" });
        await waitForWorkerActivation(worker);
        if (registration.active !== worker) {
          throw new Error("El nuevo Service Worker no quedó como versión activa.");
        }
      }

      // El HTML se solicita de nuevo incluso cuando sw.js no cambió:
      // Vite publica bundles JS/CSS con nombres hash diferentes por compilación.
      try {
        window.sessionStorage.setItem(PENDING_BUILD_KEY, latestBuild);
      } catch {
        // The next online check still detects a stale build if storage is unavailable.
      }
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
        aria-label={updateAvailable
          ? "Hay una actualización disponible. Descargar e instalar UNIVERSO HBG"
          : "Buscar e instalar actualizaciones de UNIVERSO HBG"}
        aria-describedby={notice ? "hbg-update-notice" : undefined}
        title={updateAvailable
          ? `Nueva versión disponible: ${availableBuild}. Pulsa para instalar.`
          : `Comprobar actualizaciones · versión ${CURRENT_BUILD_ID.slice(0, 12)}`}
        style={{ padding: "4px 8px", fontSize: 9, position: "relative" }}
      >
        {checking ? "ACTUALIZANDO..." : "↻ ACTUALIZAR"}
        {updateAvailable && !checking && (
          <span
            aria-hidden="true"
            style={{
              position: "absolute",
              top: -7,
              right: -7,
              display: "grid",
              placeItems: "center",
              width: 16,
              height: 16,
              borderRadius: "50%",
              background: "#ef233c",
              color: "#fff",
              border: "1px solid #ff7b89",
              boxShadow: "0 0 9px rgba(239,35,60,0.65)",
              fontFamily: "Arial, sans-serif",
              fontSize: 10,
              fontWeight: 800,
              lineHeight: 1,
            }}
          >
            1
          </span>
        )}
      </button>
      {notice && (
        <div
          id="hbg-update-notice"
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
