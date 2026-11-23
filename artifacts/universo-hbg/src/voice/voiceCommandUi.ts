export interface VoiceWidgetPosition {
  x: number;
  y: number;
}

export interface VoiceWidgetViewport {
  width: number;
  height: number;
}

export const VOICE_WIDGET_POSITION_STORAGE_KEY = "hbg_voice_widget_position";
export const VOICE_RESPONSE_DISMISS_MS = 3000;

export function clampVoiceWidgetPosition(
  position: VoiceWidgetPosition,
  viewport: VoiceWidgetViewport,
): VoiceWidgetPosition {
  const maxX = Math.max(8, viewport.width - 112);
  const maxY = Math.max(8, viewport.height - 72);
  return {
    x: Math.round(Math.min(maxX, Math.max(8, position.x))),
    y: Math.round(Math.min(maxY, Math.max(8, position.y))),
  };
}

export function readVoiceWidgetPosition(
  raw: string | null,
  viewport: VoiceWidgetViewport,
): VoiceWidgetPosition {
  const fallback = clampVoiceWidgetPosition(
    { x: viewport.width - 116, y: viewport.height - 156 },
    viewport,
  );
  if (!raw) return fallback;
  try {
    const parsed: unknown = JSON.parse(raw);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      !("x" in parsed) ||
      !("y" in parsed) ||
      typeof parsed.x !== "number" ||
      typeof parsed.y !== "number" ||
      !Number.isFinite(parsed.x) ||
      !Number.isFinite(parsed.y)
    ) return fallback;
    return clampVoiceWidgetPosition({ x: parsed.x, y: parsed.y }, viewport);
  } catch {
    return fallback;
  }
}

export function isPersistentVoiceError(message: string): boolean {
  return /^(?:no entend[ií]|no se pudo|no hay|no encontr[eé]|encontr[eé] varias|esa operaci[oó]n requiere|permiso de micr[oó]fono|tu navegador no soporta|no se detect[oó]|no se encontr[oó] micr[oó]fono|ocurri[oó] un error)/i.test(message.trim());
}
