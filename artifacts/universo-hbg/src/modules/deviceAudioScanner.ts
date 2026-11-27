/**
 * Browser-side bulk audio discovery.
 *
 * A directory is explicitly selected by the user. The scanner then walks that
 * directory recursively and returns only supported audio files; it never
 * opens the image gallery or asks the user to pick tracks one by one.
 *
 * This is a browser fallback, not Android-wide MediaStore access. Full-device
 * discovery requires the native Android READ_MEDIA_AUDIO + MediaStore bridge.
 */

export const SUPPORTED_DEVICE_AUDIO_EXTENSIONS = new Set([
  "mp3", "wav", "ogg", "flac", "aac", "m4a",
]);

export function isSupportedDeviceAudioFile(file: Pick<File, "name">): boolean {
  const extension = file.name.split(".").pop()?.toLowerCase() ?? "";
  return SUPPORTED_DEVICE_AUDIO_EXTENSIONS.has(extension);
}

interface DirectoryEntryLike {
  kind: "file" | "directory";
  name: string;
  getFile?: () => Promise<File>;
  values?: () => AsyncIterable<DirectoryEntryLike>;
}

interface DirectoryPickerWindow extends Window {
  showDirectoryPicker?: (options?: { id?: string; mode?: "read" }) => Promise<DirectoryEntryLike>;
}

async function collectDirectoryFiles(
  directory: DirectoryEntryLike,
  output: File[],
): Promise<void> {
  if (!directory.values) return;

  for await (const entry of directory.values()) {
    if (entry.kind === "directory") {
      await collectDirectoryFiles(entry, output);
      continue;
    }

    if (entry.kind === "file" && entry.getFile && isSupportedDeviceAudioFile({ name: entry.name })) {
      output.push(await entry.getFile());
    }
  }
}

/**
 * Returns:
 * - File[] when a directory was selected (possibly empty).
 * - null when the browser has no directory-picker API or the user cancelled.
 */
export async function pickAudioDirectory(): Promise<File[] | null> {
  if (typeof window === "undefined") return null;

  const picker = (window as DirectoryPickerWindow).showDirectoryPicker;
  if (typeof picker !== "function") return null;

  let root: DirectoryEntryLike;
  try {
    root = await picker.call(window, { id: "vibra-audio-library", mode: "read" });
  } catch (error) {
    if (error instanceof DOMException && error.name === "AbortError") return null;
    throw error;
  }

  const files: File[] = [];
  await collectDirectoryFiles(root, files);
  return files;
}
