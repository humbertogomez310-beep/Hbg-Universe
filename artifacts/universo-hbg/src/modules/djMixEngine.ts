export type DjDeckName = "A" | "B";

export interface EqualPowerCurves {
  outgoing: Float32Array;
  incoming: Float32Array;
}

/** Equal-power curves keep perceived loudness steadier through a two-deck fade. */
export function createEqualPowerCrossfadeCurves(steps = 128): EqualPowerCurves {
  const count = Math.max(2, Math.floor(steps));
  const outgoing = new Float32Array(count);
  const incoming = new Float32Array(count);
  for (let index = 0; index < count; index += 1) {
    const progress = index / (count - 1);
    outgoing[index] = Math.cos(progress * Math.PI * 0.5);
    incoming[index] = Math.sin(progress * Math.PI * 0.5);
  }
  return { outgoing, incoming };
}

interface Deck {
  name: DjDeckName;
  audio: HTMLAudioElement;
  source: MediaElementAudioSourceNode;
  gain: GainNode;
  objectUrl: string | null;
}

const CURVES = createEqualPowerCrossfadeCurves();

function scheduleGainCurve(param: AudioParam, curve: Float32Array, now: number, duration: number): void {
  param.cancelScheduledValues(now);
  param.setValueAtTime(param.value, now);
  param.setValueCurveAtTime(curve, now, duration);
}

/**
 * Browser-side two-deck mixer. It owns two independent media elements and
 * routes both through a shared music bus, with separate DJ voice and FX buses.
 * The host application remains responsible for loading library metadata and
 * deciding when to prepare/crossfade the next track.
 */
export class VibraDjMixEngine {
  private readonly decks: [Deck, Deck];
  private readonly masterBus: GainNode;
  private readonly musicBus: GainNode;
  private readonly voiceBus: GainNode;
  private readonly fxBus: GainNode;
  private activeIndex = 0;
  private transitionTimer: ReturnType<typeof setTimeout> | null = null;
  private destroyed = false;
  private masterVolume = 1;
  private readonly context: AudioContext;

  constructor(context: AudioContext) {
    this.context = context;
    this.masterBus = context.createGain();
    this.musicBus = context.createGain();
    this.voiceBus = context.createGain();
    this.fxBus = context.createGain();
    this.masterBus.gain.value = 1;
    this.musicBus.gain.value = 1;
    this.voiceBus.gain.value = 1;
    this.fxBus.gain.value = 1;
    this.musicBus.connect(this.masterBus);
    this.voiceBus.connect(this.masterBus);
    this.fxBus.connect(this.masterBus);
    this.masterBus.connect(context.destination);

    const createDeck = (name: DjDeckName, initialGain: number): Deck => {
      const audio = new Audio();
      audio.preload = "auto";
      const source = context.createMediaElementSource(audio);
      const gain = context.createGain();
      gain.gain.value = initialGain;
      source.connect(gain);
      gain.connect(this.musicBus);
      return { name, audio, source, gain, objectUrl: null };
    };
    this.decks = [createDeck("A", 1), createDeck("B", 0)];
  }

  get activeDeck(): DjDeckName {
    return this.decks[this.activeIndex].name;
  }

  get activeAudio(): HTMLAudioElement {
    return this.decks[this.activeIndex].audio;
  }

  get incomingDeck(): DjDeckName {
    return this.decks[1 - this.activeIndex].name;
  }

  get incomingAudio(): HTMLAudioElement {
    return this.decks[1 - this.activeIndex].audio;
  }

  get allAudios(): readonly HTMLAudioElement[] {
    return this.decks.map((deck) => deck.audio);
  }

  /** Route both music decks through the host EQ/analyser chain before the master bus. */
  connectMusicOutput(output: AudioNode): void {
    this.musicBus.disconnect();
    this.musicBus.connect(output);
  }

  get isTransitioning(): boolean {
    return this.transitionTimer !== null;
  }

  setMasterVolume(volume: number): void {
    this.masterVolume = Math.max(0, Math.min(1, Number.isFinite(volume) ? volume : 0));
    this.applyMasterVolume();
  }

  setInteractionActive(active: boolean): void {
    const now = this.context.currentTime;
    // Music ducking is applied once by the shared output gain registered with
    // HBG AudioManager. DJ voice and effects yield completely to user speech.
    this.voiceBus.gain.cancelScheduledValues(now);
    this.voiceBus.gain.setTargetAtTime(active ? 0 : 1, now, active ? 0.025 : 0.12);
    this.fxBus.gain.cancelScheduledValues(now);
    this.fxBus.gain.setTargetAtTime(active ? 0 : 1, now, active ? 0.025 : 0.2);
  }

  connectDjVoice(source: AudioNode): void {
    source.connect(this.voiceBus);
  }

  connectDjFx(source: AudioNode): void {
    source.connect(this.fxBus);
  }

  private releaseDeck(deck: Deck): void {
    deck.audio.pause();
    deck.audio.removeAttribute("src");
    deck.audio.load();
    if (deck.objectUrl) URL.revokeObjectURL(deck.objectUrl);
    deck.objectUrl = null;
  }

  private settleTransitionOnActiveDeck(): void {
    if (this.transitionTimer !== null) clearTimeout(this.transitionTimer);
    this.transitionTimer = null;
    const active = this.decks[this.activeIndex];
    const inactive = this.decks[1 - this.activeIndex];
    this.releaseDeck(inactive);
    const now = this.context.currentTime;
    active.gain.gain.cancelScheduledValues(now);
    active.gain.gain.setValueAtTime(1, now);
    inactive.gain.gain.cancelScheduledValues(now);
    inactive.gain.gain.setValueAtTime(0, now);
  }

  /** Replace the active deck for a manual selection or a non-crossfade advance. */
  async loadActive(blob: Blob, startTime = 0, autoplay = false): Promise<HTMLAudioElement | null> {
    if (this.destroyed) return null;
    this.settleTransitionOnActiveDeck();
    const active = this.decks[this.activeIndex];
    this.releaseDeck(active);
    const objectUrl = URL.createObjectURL(blob);
    active.objectUrl = objectUrl;
    active.audio.src = objectUrl;
    active.audio.load();

    const ready = await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (success: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        active.audio.removeEventListener("canplay", onReady);
        active.audio.removeEventListener("error", onError);
        resolve(success);
      };
      const onReady = () => finish(true);
      const onError = () => finish(false);
      const timeout = setTimeout(() => finish(false), 12000);
      active.audio.addEventListener("canplay", onReady, { once: true });
      active.audio.addEventListener("error", onError, { once: true });
    });
    if (!ready) {
      this.releaseDeck(active);
      return null;
    }

    if (startTime > 0 && Number.isFinite(startTime)) {
      try { active.audio.currentTime = startTime; } catch { /* Some codecs are not seekable yet. */ }
    }
    if (autoplay) {
      try {
        await this.context.resume();
        await active.audio.play();
      } catch {
        return null;
      }
    }
    return active.audio;
  }

  /** Cancel a prepared but not-yet-started incoming track. */
  clearPreparedNext(): void {
    if (this.destroyed || this.transitionTimer !== null) return;
    this.releaseDeck(this.decks[1 - this.activeIndex]);
    const now = this.context.currentTime;
    this.decks[1 - this.activeIndex].gain.gain.cancelScheduledValues(now);
    this.decks[1 - this.activeIndex].gain.gain.setValueAtTime(0, now);
  }

  pauseAll(): void {
    if (this.destroyed) return;
    this.settleTransitionOnActiveDeck();
    this.decks[this.activeIndex].audio.pause();
  }

  async resumeActive(): Promise<boolean> {
    if (this.destroyed) return false;
    try {
      await this.context.resume();
      await this.decks[this.activeIndex].audio.play();
      return true;
    } catch {
      return false;
    }
  }

  /** Load the inactive deck while the active deck continues playing. */
  async prepareNext(blob: Blob): Promise<boolean> {
    if (this.destroyed || this.transitionTimer !== null) return false;
    const deck = this.decks[1 - this.activeIndex];
    this.releaseDeck(deck);
    const objectUrl = URL.createObjectURL(blob);
    deck.objectUrl = objectUrl;
    deck.audio.src = objectUrl;
    deck.audio.load();

    const ready = await new Promise<boolean>((resolve) => {
      let settled = false;
      const finish = (success: boolean) => {
        if (settled) return;
        settled = true;
        clearTimeout(timeout);
        deck.audio.removeEventListener("canplay", onReady);
        deck.audio.removeEventListener("error", onError);
        resolve(success);
      };
      const onReady = () => finish(true);
      const onError = () => finish(false);
      const timeout = setTimeout(() => finish(false), 12000);
      deck.audio.addEventListener("canplay", onReady, { once: true });
      deck.audio.addEventListener("error", onError, { once: true });
    });
    if (!ready) {
      deck.audio.removeAttribute("src");
      deck.audio.load();
      URL.revokeObjectURL(objectUrl);
      deck.objectUrl = null;
    }
    return ready;
  }

  /** Start the incoming deck, then crossfade without stopping either track early. */
  async crossfadeToNext(durationMs = 8000): Promise<boolean> {
    if (this.destroyed || this.transitionTimer !== null) return false;
    const outgoing = this.decks[this.activeIndex];
    const incoming = this.decks[1 - this.activeIndex];
    if (!incoming.audio.src) return false;

    try {
      await this.context.resume();
      await incoming.audio.play();
    } catch {
      return false;
    }

    const now = this.context.currentTime;
    const safeDurationMs = Number.isFinite(durationMs) ? Math.max(500, Math.min(30000, durationMs)) : 8000;
    const duration = safeDurationMs / 1000;
    scheduleGainCurve(outgoing.gain.gain, CURVES.outgoing, now, duration);
    scheduleGainCurve(incoming.gain.gain, CURVES.incoming, now, duration);
    this.activeIndex = 1 - this.activeIndex;

    this.transitionTimer = setTimeout(() => {
      this.transitionTimer = null;
      outgoing.audio.pause();
      outgoing.audio.removeAttribute("src");
      outgoing.audio.load();
      if (outgoing.objectUrl) URL.revokeObjectURL(outgoing.objectUrl);
      outgoing.objectUrl = null;
      outgoing.gain.gain.cancelScheduledValues(this.context.currentTime);
      outgoing.gain.gain.setValueAtTime(0, this.context.currentTime);
      incoming.gain.gain.cancelScheduledValues(this.context.currentTime);
      incoming.gain.gain.setValueAtTime(1, this.context.currentTime);
    }, safeDurationMs);
    return true;
  }

  private applyMasterVolume(): void {
    const now = this.context.currentTime;
    this.masterBus.gain.cancelScheduledValues(now);
    this.masterBus.gain.setTargetAtTime(this.masterVolume, now, 0.04);
  }

  destroy(): void {
    if (this.destroyed) return;
    this.destroyed = true;
    if (this.transitionTimer !== null) clearTimeout(this.transitionTimer);
    this.transitionTimer = null;
    for (const deck of this.decks) {
      deck.audio.pause();
      deck.audio.removeAttribute("src");
      deck.audio.load();
      if (deck.objectUrl) URL.revokeObjectURL(deck.objectUrl);
      deck.objectUrl = null;
      deck.source.disconnect();
      deck.gain.disconnect();
    }
    this.musicBus.disconnect();
    this.voiceBus.disconnect();
    this.fxBus.disconnect();
    this.masterBus.disconnect();
  }
}
