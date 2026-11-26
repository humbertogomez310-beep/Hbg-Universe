export interface TrackAudioAnalysis {
  bpm?: number;
  bpmConfidence?: number;
  beatStrength?: number;
  energyLevel?: number;
  impactStrength?: number;
  musicalKey?: string;
  keyConfidence?: number;
  analyzedAt?: number;
}

export interface TempoEstimate {
  bpm: number | null;
  confidence: number;
  beatStrength: number;
}

export interface KeyEstimate {
  musicalKey: string | null;
  confidence: number;
}

const KEY_NAMES = ["C", "C#", "D", "D#", "E", "F", "F#", "G", "G#", "A", "A#", "B"];
const MAJOR_PROFILE = [6.35, 2.23, 3.48, 2.33, 4.38, 4.09, 2.52, 5.19, 2.39, 3.66, 2.29, 2.88];
const MINOR_PROFILE = [6.33, 2.68, 3.52, 5.38, 2.6, 3.53, 2.54, 4.75, 3.98, 2.69, 3.34, 3.17];

function clamp(value: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, Number.isFinite(value) ? value : min));
}

function mean(values: readonly number[]): number {
  return values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : 0;
}

function correlation(left: readonly number[], right: readonly number[]): number {
  const leftMean = mean(left);
  const rightMean = mean(right);
  let numerator = 0;
  let leftPower = 0;
  let rightPower = 0;
  for (let index = 0; index < left.length; index += 1) {
    const a = left[index] - leftMean;
    const b = right[index] - rightMean;
    numerator += a * b;
    leftPower += a * a;
    rightPower += b * b;
  }
  const denominator = Math.sqrt(leftPower * rightPower);
  return denominator > 0 ? numerator / denominator : 0;
}

function buildOnsetEnvelope(samples: Float32Array, sampleRate: number, hopSize = 512): number[] {
  const windowSize = 1024;
  const envelope: number[] = [];
  let previousRms = 0;
  for (let start = 0; start + windowSize < samples.length; start += hopSize) {
    let power = 0;
    for (let index = 0; index < windowSize; index += 1) {
      const value = samples[start + index];
      power += value * value;
    }
    const rms = Math.sqrt(power / windowSize);
    envelope.push(Math.max(0, rms - previousRms));
    previousRms = rms;
  }
  const average = mean(envelope);
  return envelope.map((value) => Math.max(0, value - average * 0.35));
}

export function estimateBpmFromSamples(
  samples: Float32Array,
  sampleRate: number,
  minBpm = 60,
  maxBpm = 180,
): TempoEstimate {
  if (samples.length < sampleRate * 8 || sampleRate <= 0) return { bpm: null, confidence: 0, beatStrength: 0 };
  const hopSize = 512;
  const envelope = buildOnsetEnvelope(samples, sampleRate, hopSize);
  if (envelope.length < 100 || envelope.every((value) => value === 0)) {
    return { bpm: null, confidence: 0, beatStrength: 0 };
  }

  const minLag = Math.max(1, Math.floor((60 * sampleRate) / (maxBpm * hopSize)));
  const maxLag = Math.min(envelope.length - 2, Math.ceil((60 * sampleRate) / (minBpm * hopSize)));
  const peaks: Array<{ lag: number; score: number }> = [];
  for (let lag = minLag; lag <= maxLag; lag += 1) {
    let dot = 0;
    let leftPower = 0;
    let rightPower = 0;
    for (let index = lag; index < envelope.length; index += 1) {
      const left = envelope[index];
      const right = envelope[index - lag];
      dot += left * right;
      leftPower += left * left;
      rightPower += right * right;
    }
    const denominator = Math.sqrt(leftPower * rightPower);
    peaks.push({ lag, score: denominator > 0 ? dot / denominator : 0 });
  }
  peaks.sort((left, right) => right.score - left.score);
  const best = peaks[0];
  if (!best || best.score < 0.04) return { bpm: null, confidence: 0, beatStrength: 0 };
  const competing = peaks.find((peak) => {
    const ratio = peak.lag / best.lag;
    const isHalfOrDoubleTempoAlias = Math.abs(ratio - 2) < 0.12 || Math.abs(ratio - 0.5) < 0.06;
    return Math.abs(peak.lag - best.lag) / best.lag > 0.08 && !isHalfOrDoubleTempoAlias;
  });
  const confidence = clamp((best.score - (competing?.score ?? 0)) / Math.max(best.score, 0.001), 0, 1);
  const rawBpm = (60 * sampleRate) / (best.lag * hopSize);
  const normalizedBpm = rawBpm < 85 ? rawBpm * 2 : rawBpm > 170 ? rawBpm / 2 : rawBpm;
  return { bpm: Math.round(normalizedBpm * 10) / 10, confidence, beatStrength: clamp(best.score, 0, 1) };
}

function fft(real: Float64Array, imaginary: Float64Array): void {
  const size = real.length;
  for (let index = 1, reversed = 0; index < size; index += 1) {
    let bit = size >> 1;
    for (; reversed & bit; bit >>= 1) reversed ^= bit;
    reversed ^= bit;
    if (index < reversed) {
      [real[index], real[reversed]] = [real[reversed], real[index]];
      [imaginary[index], imaginary[reversed]] = [imaginary[reversed], imaginary[index]];
    }
  }
  for (let length = 2; length <= size; length <<= 1) {
    const angle = (-2 * Math.PI) / length;
    const stepReal = Math.cos(angle);
    const stepImaginary = Math.sin(angle);
    for (let start = 0; start < size; start += length) {
      let twiddleReal = 1;
      let twiddleImaginary = 0;
      const half = length >> 1;
      for (let offset = 0; offset < half; offset += 1) {
        const even = start + offset;
        const odd = even + half;
        const oddReal = real[odd] * twiddleReal - imaginary[odd] * twiddleImaginary;
        const oddImaginary = real[odd] * twiddleImaginary + imaginary[odd] * twiddleReal;
        real[odd] = real[even] - oddReal;
        imaginary[odd] = imaginary[even] - oddImaginary;
        real[even] += oddReal;
        imaginary[even] += oddImaginary;
        const nextReal = twiddleReal * stepReal - twiddleImaginary * stepImaginary;
        twiddleImaginary = twiddleReal * stepImaginary + twiddleImaginary * stepReal;
        twiddleReal = nextReal;
      }
    }
  }
}

export function estimateKeyFromSamples(samples: Float32Array, sampleRate: number): KeyEstimate {
  const fftSize = 4096;
  const hopSize = 8192;
  if (samples.length < fftSize * 4 || sampleRate <= 0) return { musicalKey: null, confidence: 0 };
  const chroma = Array(12).fill(0) as number[];
  let frames = 0;
  const maxSamples = Math.min(samples.length, sampleRate * 90);
  for (let start = 0; start + fftSize <= maxSamples; start += hopSize) {
    const real = new Float64Array(fftSize);
    const imaginary = new Float64Array(fftSize);
    for (let index = 0; index < fftSize; index += 1) {
      const window = 0.5 - 0.5 * Math.cos((2 * Math.PI * index) / (fftSize - 1));
      real[index] = samples[start + index] * window;
    }
    fft(real, imaginary);
    for (let bin = 2; bin < fftSize / 2; bin += 1) {
      const frequency = (bin * sampleRate) / fftSize;
      if (frequency < 55 || frequency > 2100) continue;
      const midi = 69 + 12 * Math.log2(frequency / 440);
      const pitchClass = ((Math.round(midi) % 12) + 12) % 12;
      const magnitude = Math.hypot(real[bin], imaginary[bin]);
      chroma[pitchClass] += magnitude / Math.sqrt(frequency);
    }
    frames += 1;
  }
  if (!frames || chroma.every((value) => value === 0)) return { musicalKey: null, confidence: 0 };

  const matches: Array<{ key: string; score: number }> = [];
  for (let tonic = 0; tonic < 12; tonic += 1) {
    const major = chroma.map((_, index) => chroma[(index + tonic) % 12]);
    const minor = major;
    matches.push({ key: `${KEY_NAMES[tonic]} major`, score: correlation(major, MAJOR_PROFILE) });
    matches.push({ key: `${KEY_NAMES[tonic]} minor`, score: correlation(minor, MINOR_PROFILE) });
  }
  matches.sort((left, right) => right.score - left.score);
  const best = matches[0];
  const second = matches[1];
  if (!best || best.score < 0.08) return { musicalKey: null, confidence: 0 };
  return {
    musicalKey: best.key,
    confidence: clamp((best.score - (second?.score ?? 0)) / Math.max(Math.abs(best.score), 0.001), 0, 1),
  };
}

function estimateEnergyProfile(samples: Float32Array): { energyLevel: number; impactStrength: number } {
  const frameSize = 2048;
  const frameRms: number[] = [];
  for (let start = 0; start < samples.length; start += frameSize) {
    const end = Math.min(samples.length, start + frameSize);
    let power = 0;
    for (let index = start; index < end; index += 1) power += samples[index] * samples[index];
    frameRms.push(Math.sqrt(power / Math.max(1, end - start)));
  }
  const average = mean(frameRms);
  const peak = frameRms.length ? Math.max(...frameRms) : 0;
  const sorted = [...frameRms].sort((left, right) => left - right);
  const median = sorted.length ? sorted[Math.floor(sorted.length * 0.5)] : 0;
  return {
    energyLevel: clamp(average * 3.5, 0, 1),
    impactStrength: clamp((peak - median) / Math.max(peak, 0.001), 0, 1),
  };
}

/**
 * Reduces analysis audio to roughly 12 kHz and at most 90 seconds.
 * A short box-average before decimation keeps the memory/CPU cost low while
 * retaining the frequency range needed for BPM and musical-key estimation.
 * The original IndexedDB audio Blob is never modified or re-encoded.
 */
export function downsampleAudioForAnalysis(
  channels: readonly Float32Array[],
  sampleRate: number,
): { samples: Float32Array; sampleRate: number } {
  if (!channels.length || !channels[0]?.length || sampleRate <= 0) {
    return { samples: new Float32Array(0), sampleRate: 0 };
  }

  const sourceLength = Math.floor(Math.min(sampleRate * 90, ...channels.map((channel) => channel.length)));
  const factor = Math.max(1, Math.round(sampleRate / 12_000));
  const outputLength = Math.ceil(sourceLength / factor);
  const samples = new Float32Array(outputLength);

  for (let outputIndex = 0; outputIndex < outputLength; outputIndex += 1) {
    const start = outputIndex * factor;
    const end = Math.min(sourceLength, start + factor);
    let sum = 0;
    let count = 0;
    for (const channel of channels) {
      for (let sourceIndex = start; sourceIndex < end; sourceIndex += 1) {
        sum += channel[sourceIndex];
        count += 1;
      }
    }
    samples[outputIndex] = count ? sum / count : 0;
  }

  return { samples, sampleRate: sampleRate / factor };
}

export function analyzeDecodedAudio(
  channels: readonly Float32Array[],
  sampleRate: number,
): TrackAudioAnalysis {
  if (!channels.length || !channels[0]?.length || sampleRate <= 0) {
    return { beatStrength: 0, energyLevel: 0, impactStrength: 0, analyzedAt: Date.now() };
  }
  const prepared = downsampleAudioForAnalysis(channels, sampleRate);
  const mono = prepared.samples;
  const analysisSampleRate = prepared.sampleRate;
  const tempo = estimateBpmFromSamples(mono, analysisSampleRate);
  const key = estimateKeyFromSamples(mono, analysisSampleRate);
  return {
    ...(tempo.bpm === null ? {} : { bpm: tempo.bpm, bpmConfidence: tempo.confidence }),
    beatStrength: tempo.beatStrength,
    ...estimateEnergyProfile(mono),
    ...(key.musicalKey === null ? {} : { musicalKey: key.musicalKey, keyConfidence: key.confidence }),
    analyzedAt: Date.now(),
  };
}

/** Decodes a local library file and estimates tempo/key without uploading audio. */
export async function analyzeAudioBlob(blob: Blob): Promise<TrackAudioAnalysis> {
  if (typeof AudioContext === "undefined") {
    throw new Error("El análisis musical requiere Web Audio en este navegador.");
  }
  const context = new AudioContext();
  try {
    const decoded = await context.decodeAudioData(await blob.arrayBuffer());
    const channels = Array.from({ length: decoded.numberOfChannels }, (_, index) => decoded.getChannelData(index));
    return analyzeDecodedAudio(channels, decoded.sampleRate);
  } finally {
    await context.close().catch(() => undefined);
  }
}

const CAMELOT: Record<string, string> = {
  "C major": "8B", "G major": "9B", "D major": "10B", "A major": "11B",
  "E major": "12B", "B major": "1B", "F# major": "2B", "C# major": "3B",
  "G# major": "4B", "D# major": "5B", "A# major": "6B", "F major": "7B",
  "A minor": "8A", "E minor": "9A", "B minor": "10A", "F# minor": "11A",
  "C# minor": "12A", "G# minor": "1A", "D# minor": "2A", "A# minor": "3A",
  "F minor": "4A", "C minor": "5A", "G minor": "6A", "D minor": "7A",
};

export function scoreHarmonicCompatibility(leftKey?: string, rightKey?: string): number {
  if (!leftKey || !rightKey) return 0;
  const left = CAMELOT[leftKey];
  const right = CAMELOT[rightKey];
  if (!left || !right) return 0;
  if (left === right) return 1;
  const leftNumber = Number(left.slice(0, -1));
  const rightNumber = Number(right.slice(0, -1));
  const sameMode = left.slice(-1) === right.slice(-1);
  const distance = Math.min(
    Math.abs(leftNumber - rightNumber),
    12 - Math.abs(leftNumber - rightNumber),
  );
  if (distance === 1 && sameMode) return 0.82;
  if (leftNumber === rightNumber && !sameMode) return 0.72;
  return 0.12;
}

export function scoreTempoCompatibility(leftBpm?: number, rightBpm?: number): number {
  if (!leftBpm || !rightBpm || leftBpm <= 0 || rightBpm <= 0) return 0;
  const variants = [rightBpm, rightBpm * 2, rightBpm / 2];
  const distance = Math.min(...variants.map((tempo) => Math.abs(tempo - leftBpm) / leftBpm));
  return clamp(1 - distance / 0.12, 0, 1);
}
