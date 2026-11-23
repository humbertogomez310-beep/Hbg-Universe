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
