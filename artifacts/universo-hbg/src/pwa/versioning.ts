export const HBG_RELEASE_VERSION = "0.1";

export interface VersionManifest {
  buildId: string;
  releaseVersion: string;
}

export function readVersionManifest(value: unknown): VersionManifest | null {
  if (!value || typeof value !== "object") return null;

  const manifest = value as { buildId?: unknown; releaseVersion?: unknown };
  const buildId =
    typeof manifest.buildId === "string" ? manifest.buildId.trim() : "";
  const releaseVersion =
    typeof manifest.releaseVersion === "string"
      ? manifest.releaseVersion.trim()
      : "";

  if (!buildId || !/^\d+\.\d+(?:\.\d+)?$/.test(releaseVersion)) {
    return null;
  }

  return { buildId, releaseVersion };
}

export function readBuildId(value: unknown): string | null {
  if (!value || typeof value !== "object") return null;
  const buildId = (value as { buildId?: unknown }).buildId;
  return typeof buildId === "string" && buildId.trim().length > 0
    ? buildId.trim()
    : null;
}

export function isUpdateAvailable(currentBuildId: string, latestBuildId: string | null): boolean {
  return Boolean(currentBuildId && latestBuildId && currentBuildId !== latestBuildId);
}

export async function fetchLatestVersion(fetcher: typeof fetch = fetch): Promise<VersionManifest | null> {
  try {
    const response = await fetcher("/version.json", {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!response.ok) return null;
    return readVersionManifest(await response.json());
  } catch {
    return null;
  }
}

export async function fetchLatestBuild(fetcher: typeof fetch = fetch): Promise<string | null> {
  return (await fetchLatestVersion(fetcher))?.buildId ?? null;
}
