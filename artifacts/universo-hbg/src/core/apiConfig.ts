/**
 * Whether this PWA build is allowed to call the remote HBG API.
 *
 * Static Local-first releases set VITE_HBG_API_ENABLED=false at build time.
 * Server-backed releases keep the default (enabled) behavior.
 */
export function remoteApiEnabled(
  configuredValue: string | undefined = import.meta.env?.VITE_HBG_API_ENABLED,
): boolean {
  return configuredValue !== "false";
}

/**
 * Resolve an API path against the optional server origin.
 * Relative same-origin requests remain the default for existing deployments.
 */
export function hbgApiUrl(
  path: string,
  configuredBaseUrl: string | undefined = import.meta.env?.VITE_HBG_API_BASE_URL,
): string {
  const normalizedPath = path.startsWith("/") ? path : `/${path}`;
  if (!configuredBaseUrl?.trim()) return normalizedPath;

  let base: URL;
  try {
    base = new URL(configuredBaseUrl.trim());
  } catch {
    throw new Error("VITE_HBG_API_BASE_URL no contiene una URL válida.");
  }
  if (
    (base.protocol !== "https:" && base.protocol !== "http:") ||
    base.username ||
    base.password
  ) {
    throw new Error("La URL de HBG API debe usar HTTP(S) y no incluir credenciales.");
  }
  return new URL(normalizedPath, base.origin).toString();
}
