/**
 * HBG LINGUA — deterministic, local-first language normalization.
 *
 * This layer normalizes speech transcripts before intent classification.
 * It does not execute actions, grant permissions, or provide always-on wake-word detection.
 */

export interface NormalizedUtterance {
  raw: string;
  text: string;
  wakePhrasePresent: boolean;
}

const WAKE_PREFIX = /^(?:oye|hey|hola) hbg\b\s*/;

function normalizeBase(input: string): string {
  return input
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^\p{L}\p{N}\s]/gu, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function normalizeUtterance(input: string): string {
  return normalizeBase(input).replace(WAKE_PREFIX, "").trim();
}

export function inspectUtterance(input: string): NormalizedUtterance {
  const normalized = normalizeBase(input);
  return {
    raw: input,
    text: normalized.replace(WAKE_PREFIX, "").trim(),
    wakePhrasePresent: /^(?:oye|hey|hola) hbg\b/.test(normalized),
  };
}
