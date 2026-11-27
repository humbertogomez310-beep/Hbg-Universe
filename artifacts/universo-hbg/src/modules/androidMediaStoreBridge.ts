import {
  getAllTrackMeta,
  parseFilename,
  saveAudioBlob,
  saveTrackMeta,
  type TrackMeta,
} from "../core/vibraDB";

export interface AndroidAudioItem {
  id: string;
  displayName: string;
  title: string;
  artist: string;
  album: string;
  durationMs: number;
  size: number;
  mimeType: string;
  url: string;
}

export interface HBGAndroidBridge {
  hasAudioPermission(): boolean;
  requestAudioPermission(): void;
  listAudioFiles(): string;
  isVoiceWakeAvailable(): boolean;
  startVoiceWake(): boolean;
  stopVoiceWake(): void;
}

declare global {
  interface Window {
    HBGAndroidBridge?: HBGAndroidBridge;
  }
}

export function getAndroidBridge(): HBGAndroidBridge | null {
  if (typeof window === "undefined") return null;
  return window.HBGAndroidBridge ?? null;
}

/**
 * Copies authorized MediaStore audio into VIBRA's existing local library.
 * Original device files are never moved, deleted, or uploaded.
 * Import is sequential to bound memory usage on large libraries.
 */
export async function importAndroidAudioLibrary(
  onProgress?: (processed: number, total: number) => void,
): Promise<TrackMeta[]> {
  const bridge = getAndroidBridge();
  if (!bridge || !bridge.hasAudioPermission()) return [];

  let items: AndroidAudioItem[];
  try {
    items = JSON.parse(bridge.listAudioFiles()) as AndroidAudioItem[];
  } catch {
    throw new Error("Android no devolvió una lista de audio válida.");
  }
  const existing = new Set((await getAllTrackMeta()).map((track) => track.id));
  const imported: TrackMeta[] = [];
  let processed = 0;

  for (const item of items) {
    const id = `android-media-${item.id}`;
    if (existing.has(id)) {
      processed += 1;
      onProgress?.(processed, items.length);
      continue;
    }
    try {
      const response = await fetch(item.url);
      if (!response.ok) throw new Error("No se pudo leer el archivo autorizado.");
      const blob = await response.blob();
      if (blob.size === 0) throw new Error("El archivo de audio está vacío.");
      await saveAudioBlob(id, blob);
      const parsed = parseFilename(item.displayName);
      const meta: TrackMeta = {
        id,
        title: item.title?.trim() || parsed.title,
        artist: item.artist?.trim() || parsed.artist,
        album: item.album?.trim() || "",
        duration: Math.max(0, Number(item.durationMs || 0) / 1000),
        size: blob.size,
        type: item.mimeType || blob.type || "application/octet-stream",
        importedAt: Date.now(),
      };
      await saveTrackMeta(meta);
      imported.push(meta);
      existing.add(id);
    } catch {
      // One unreadable or unsupported item must not block the rest of the library.
    }
    processed += 1;
    onProgress?.(processed, items.length);
  }
  return imported;
}
