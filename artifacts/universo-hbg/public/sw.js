
const SW_VERSION = "hbg-pwa-v1";

self.addEventListener("install", () => {
  // Instalación inicial sin almacenar archivos antiguos.
});

self.addEventListener("activate", (event) => {
  event.waitUntil(
    Promise.resolve().then(() => {
      console.info(`Service Worker activo: ${SW_VERSION}`);
    })
  );
});

self.addEventListener("fetch", (event) => {
  if (event.request.method !== "GET") return;

  // Las navegaciones se consultan directamente al servidor.
  // No se utiliza caché para evitar entregar versiones antiguas.
  if (event.request.mode === "navigate") {
    event.respondWith(fetch(event.request));
  }
});
