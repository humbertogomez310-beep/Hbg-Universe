export interface VersionManifest {
  buildId: string;
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

export async function fetchLatestBuild(fetcher: typeof fetch = fetch): Promise<string | null> {
  try {
    const response = await fetcher("/version.json", {
      cache: "no-store",
      headers: { "Cache-Control": "no-cache" },
    });
    if (!response.ok) return null;
    return readBuildId(await response.json());
  } catch {
    return null;
  }
}
