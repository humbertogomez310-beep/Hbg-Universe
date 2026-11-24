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
    const currentController = navigator.serviceWorker.controller;
    let reloadStarted = false;
    const reloadOnChange = () => {
      reloadStarted = true;
      window.location.reload();
    };
    navigator.serviceWorker.addEventListener("controllerchange", reloadOnChange, { once: true });

    try {
      const registration = await navigator.serviceWorker.getRegistration("/");
      if (!registration) {
        navigator.serviceWorker.removeEventListener("controllerchange", reloadOnChange);
        setNotice("No se encontró el Service Worker. Recarga la aplicación con Internet.");
        return;
      }

      await registration.update();
      if (registration.waiting) {
        registration.waiting.postMessage({ type: "SKIP_WAITING" });
      }

      if (registration.installing) {
        await new Promise<void>((resolve) => {
          const worker = registration.installing!;
          if (worker.state === "activated" || worker.state === "redundant") {
            resolve();
            return;
          }
          const timeout = window.setTimeout(resolve, 12000);
          worker.addEventListener("statechange", () => {
            if (worker.state === "activated" || worker.state === "redundant") {
              window.clearTimeout(timeout);
              resolve();
            }
          });
        });
      }

      if (navigator.serviceWorker.controller !== currentController) {
        window.location.reload();
        return;
      }

      navigator.serviceWorker.removeEventListener("controllerchange", reloadOnChange);
      if (!reloadStarted) setNotice("La aplicación ya tiene la versión más reciente.");
    } catch (error) {
      navigator.serviceWorker.removeEventListener("controllerchange", reloadOnChange);
      console.error("No se pudo actualizar UNIVERSO HBG:", error);
      setNotice("No se pudo comprobar la actualización. Verifica tu conexión e inténtalo otra vez.");
    } finally {
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
        {checking ? "COMPROBANDO..." : "↻ ACTUALIZAR"}
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
