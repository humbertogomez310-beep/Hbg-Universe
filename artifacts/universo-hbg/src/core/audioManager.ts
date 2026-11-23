/**
 * HBG audio coordination for audio outputs owned by Universo applications.
 * This controls only registered in-app media; it cannot change device volume.
 */
export type AudioDuckingTarget = (factor: number) => void;

const VOICE_DUCK_FACTOR = 0.25;
const outputs = new Map<string, AudioDuckingTarget>();
const voiceSessions = new Set<symbol>();

export function getCurrentAudioDuckingFactor(): number {
  return voiceSessions.size > 0 ? VOICE_DUCK_FACTOR : 1;
}

function applyFactor(): void {
  const factor = getCurrentAudioDuckingFactor();
  for (const target of outputs.values()) {
    try {
      target(factor);
    } catch {
      // One unavailable output must not prevent other registered outputs from updating.
    }
  }
}

export function registerAudioOutput(id: string, target: AudioDuckingTarget): () => void {
  if (!id.trim()) throw new Error("El identificador de salida de audio es obligatorio.");
  outputs.set(id, target);
  try {
    target(getCurrentAudioDuckingFactor());
  } catch {
    // The output can still be registered and updated on the next session change.
  }

  return () => {
    if (outputs.get(id) === target) outputs.delete(id);
  };
}

/** Starts a temporary voice session and returns an idempotent release function. */
export function beginVoiceAudioSession(): () => void {
  const token = Symbol("hbg-voice-audio-session");
  voiceSessions.add(token);
  applyFactor();
  let released = false;

  return () => {
    if (released) return;
    released = true;
    voiceSessions.delete(token);
    applyFactor();
  };
}
