import { useState, useEffect, useRef, useCallback, useMemo } from "react";
import { UniversoScreen } from "../components/UniversoScreen";
import { hbgCore, type HBGActionResult } from "../core/hbgCore";
import { calculateEffectiveAudioVolume, getCurrentAudioDuckingFactor, registerAudioOutput, registerAudioSessionLifecycle, preventVoiceSessionPlaybackRestore } from "../core/audioManager";
import {
  saveAudioBlob,
  getAudioBlob,
  saveTrackMeta,
  getAllTrackMeta,
  saveAppState,
  getAppState,
  deleteAppState,
  deleteAudioBlob,
  deleteTrackMeta,
  getAudioDuration,
  parseFilename,
  formatDuration,
  type TrackMeta,
} from "../core/vibraDB";
import {
  interpretMusicDirection,
  normalizeMusicText,
  readMusicDirection,
  selectTracksForDirection,
  selectNextAutoDjTrack,
  explainAutoDjSelection,
  type MusicDirection,
} from "./musicDirector";
import { analyzeAudioBlob } from "./djAudioAnalysis";
import { VibraDjMixEngine } from "./djMixEngine";
import {
  selectNextPlaybackId,
  selectPreviousPlaybackId,
  shouldRestorePlaybackAfterInterruption,
  recoverPlaybackPosition,
  type RepeatMode,
} from "./vibraPlayback";

type MoodMode = "party" | "focus" | "creative" | "chill" | "nostalgia" | "sad" | "happy" | "normal";
type ViewMode = "player" | "dj" | "library" | "playlists" | "modes" | "eq" | "perfil" | "universo" | "scan";

interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  color: string;
}

interface LibraryScanCheckpoint {
  queueIds: string[];
  processed: number;
  total: number;
  failed: number;
  updatedAt: number;
}

const LIBRARY_SCAN_CHECKPOINT_KEY = "library_scan_checkpoint";

const STORAGE_KEYS = {
  volume: "hbg_vibra_volume",
  mood: "hbg_vibra_mood",
  trackId: "hbg_vibra_track_id",
  trackTime: "hbg_vibra_track_time",
  playlists: "hbg_vibra_playlists",
  favorites: "hbg_vibra_favorites",
  recentTrackIds: "hbg_vibra_recent_tracks",
  autoDj: "hbg_vibra_auto_dj",
  partyMode: "hbg_vibra_party_mode",
  equalizer: "hbg_vibra_equalizer_v1",
  shuffle: "hbg_vibra_shuffle",
  repeat: "hbg_vibra_repeat",
  normalQueue: "hbg_vibra_normal_queue",
  resumeAfterInterruption: "hbg_vibra_resume_after_interruption",
};

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try {
    return window.localStorage;
  } catch {
    return null;
  }
}

function readStoredValue(key: string): string | null {
  try {
    return browserStorage()?.getItem(key) ?? null;
  } catch {
    return null;
  }
}

function writeStoredValue(key: string, value: string): boolean {
  try {
    const storage = browserStorage();
    if (!storage) return false;
    storage.setItem(key, value);
    return true;
  } catch {
    return false;
  }
}

function readStoredMode(): MoodMode {
  const value = readStoredValue(STORAGE_KEYS.mood);
  return MOODS.some((mood) => mood.mode === value) ? value as MoodMode : "focus";
}

function readStoredVolume(): number {
  const raw = readStoredValue(STORAGE_KEYS.volume);
  if (raw === null) return 80;
  const value = Number(raw);
  return Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 80;
}

function readStoredFavorites(): Set<string> {
  try {
    const parsed: unknown = JSON.parse(readStoredValue(STORAGE_KEYS.favorites) ?? "[]");
    return new Set(Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string") : []);
  } catch {
    return new Set();
  }
}

function readStoredPlaylists(): Playlist[] {
  try {
    const parsed: unknown = JSON.parse(readStoredValue(STORAGE_KEYS.playlists) ?? "[]");
    if (!Array.isArray(parsed)) return [];
    return parsed.filter((value): value is Playlist =>
      typeof value === "object" &&
      value !== null &&
      typeof value.id === "string" &&
      typeof value.name === "string" &&
      Array.isArray(value.trackIds) &&
      value.trackIds.every((id: unknown) => typeof id === "string") &&
      typeof value.color === "string"
    );
  } catch {
    return [];
  }
}

function readStoredRecentTracks(): string[] {
  try {
    const parsed: unknown = JSON.parse(readStoredValue(STORAGE_KEYS.recentTrackIds) ?? "[]");
    return Array.isArray(parsed) ? parsed.filter((value): value is string => typeof value === "string").slice(0, 5000) : [];
  } catch {
    return [];
  }
}

function readStoredDirection(): MusicDirection {
  const storage = browserStorage();
  return storage ? readMusicDirection(storage) : { goal: "", energy: "steady" };
}

function readStoredTrackId(): string | null {
  const value = readStoredValue(STORAGE_KEYS.trackId);
  return value && value.length <= 200 ? value : null;
}

const MOODS: { mode: MoodMode; label: string; color: string; bpm: [number, number]; icon: string }[] = [
  { mode: "party", label: "PARTY", color: "var(--neon-pink)", bpm: [120, 160], icon: "⚡" },
  { mode: "focus", label: "FOCUS", color: "var(--neon-cyan)", bpm: [60, 90], icon: "◎" },
  { mode: "creative", label: "CREATIVE", color: "#ff9100", bpm: [80, 110], icon: "◈" },
  { mode: "chill", label: "CHILL", color: "var(--neon-green)", bpm: [50, 75], icon: "◉" },
  { mode: "nostalgia", label: "NOSTALGIA", color: "#b388ff", bpm: [70, 100], icon: "◇" },
  { mode: "sad", label: "SAD", color: "#42a5f5", bpm: [45, 70], icon: "◑" },
  { mode: "happy", label: "HAPPY", color: "#ffd740", bpm: [100, 140], icon: "◐" },
  { mode: "normal", label: "NORMAL", color: "var(--neon-purple)", bpm: [90, 120], icon: "◆" },
];

const EQ_BANDS = ["60Hz", "170Hz", "310Hz", "600Hz", "1kHz", "3kHz", "6kHz", "12kHz", "14kHz", "16kHz"];
const EQ_FREQUENCIES = [60, 170, 310, 600, 1000, 3000, 6000, 12000, 14000, 16000];

function formatDjAnalysis(track: TrackMeta | null): string {
  if (!track) return "SIN DATOS DE ANÁLISIS";
  const facts: string[] = [];
  if (track.bpm && (track.bpmConfidence ?? 0) >= 0.25) facts.push(`${Math.round(track.bpm)} BPM`);
  if (track.musicalKey && (track.keyConfidence ?? 0) >= 0.25) facts.push(track.musicalKey.toUpperCase());
  if ((track.beatStrength ?? 0) >= 0.05) facts.push(`PULSO ${Math.round(track.beatStrength! * 100)}%`);
  if (track.energyLevel !== undefined) facts.push(`ENERGÍA ${Math.round(track.energyLevel * 100)}%`);
  if (track.impactStrength !== undefined) facts.push(`IMPACTO ${Math.round(track.impactStrength * 100)}%`);
  return facts.length ? facts.join(" · ") : "ANÁLISIS EN PROCESO";
}

function VisualizerBars({ active, color, analyser }: { active: boolean; color: string; analyser: AnalyserNode | null }) {
  const [heights, setHeights] = useState<number[]>(() => Array(24).fill(4));
  useEffect(() => {
    if (!active || !analyser) {
      setHeights(Array(24).fill(4));
      return;
    }

    const values = new Uint8Array(analyser.frequencyBinCount);
    let frame = 0;
    let lastUpdateAt = -80;
    const draw = (timestamp: number) => {
      // Keep the spectrum useful without forcing a React render on every
      // display frame; mobile audio playback gets more main-thread headroom.
      if (timestamp - lastUpdateAt >= 80) {
        analyser.getByteFrequencyData(values);
        const next = Array.from({ length: 24 }, (_, index) => {
          const bin = Math.min(values.length - 1, Math.floor((index / 24) * values.length));
          return 4 + (values[bin] / 255) * 50;
        });
        setHeights(next);
        lastUpdateAt = timestamp;
      }
      frame = window.requestAnimationFrame(draw);
    };
    frame = window.requestAnimationFrame(draw);
    return () => window.cancelAnimationFrame(frame);
  }, [active, analyser]);

  return (
    <div
      role="img"
      aria-label={analyser ? (active ? "Visualizador de frecuencias de audio en tiempo real" : "Visualizador de audio inactivo") : "Visualizador de frecuencias no disponible en este navegador"}
      style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 56, padding: "0 4px" }}
    >
      {heights.map((height, index) => (
        <div key={index} style={{ flex: 1, height: `${height}px`, background: color, borderRadius: "1px 1px 0 0", boxShadow: active && analyser ? `0 0 4px ${color}` : "none", transition: "height 0.06s linear", opacity: 0.75 }} />
      ))}
    </div>
  );
}

export function VibraModule() {
  // Restore persisted values without allowing blocked/corrupt browser storage to crash VIBRA.
  const [activeMode, setActiveMode] = useState<MoodMode>(readStoredMode);
  const [volume, setVolume] = useState<number>(readStoredVolume);
  const [favorites, setFavorites] = useState<Set<string>>(readStoredFavorites);
  const [playlists, setPlaylists] = useState<Playlist[]>(readStoredPlaylists);
  const [musicDirection, setMusicDirection] = useState<MusicDirection>(readStoredDirection);
  const [autoDjEnabled, setAutoDjEnabled] = useState(() => readStoredValue(STORAGE_KEYS.autoDj) === "true");
  const [partyMode, setPartyMode] = useState(() => readStoredValue(STORAGE_KEYS.partyMode) === "true");
  const [shuffleEnabled, setShuffleEnabled] = useState(() => readStoredValue(STORAGE_KEYS.shuffle) === "true");
  const [repeatMode, setRepeatMode] = useState<RepeatMode>(() => {
    const stored = readStoredValue(STORAGE_KEYS.repeat);
    return stored === "all" || stored === "one" ? stored : "off";
  });
  const [recentTrackIds, setRecentTrackIds] = useState<string[]>(readStoredRecentTracks);

  const [view, setView] = useState<ViewMode>("player");
  const [tracks, setTracks] = useState<TrackMeta[]>([]);
  const [normalQueueIds, setNormalQueueIds] = useState<string[]>(() => {
    try {
      const saved: unknown = JSON.parse(readStoredValue(STORAGE_KEYS.normalQueue) ?? "[]");
      return Array.isArray(saved) ? saved.filter((id): id is string => typeof id === "string") : [];
    } catch {
      return [];
    }
  });
  const [currentId, setCurrentId] = useState<string | null>(readStoredTrackId);
  const [isPlaying, setIsPlaying] = useState(false);
  const [djMixStatus, setDjMixStatus] = useState<"standby" | "preloading" | "ready" | "mixing">("standby");
  const [progress, setProgress] = useState(0); // 0–1
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [eqValues, setEqValues] = useState<Record<string, number>>(() => {
    try {
      const parsed: unknown = JSON.parse(readStoredValue(STORAGE_KEYS.equalizer) ?? "null");
      if (typeof parsed === "object" && parsed !== null && !Array.isArray(parsed)) {
        return Object.fromEntries(EQ_BANDS.map((band) => {
          const value = (parsed as Record<string, unknown>)[band];
          return [band, typeof value === "number" && Number.isFinite(value) ? Math.max(0, Math.min(100, value)) : 50];
        }));
      }
    } catch {
      // Corrupt EQ preferences fall back to a flat response.
    }
    return Object.fromEntries(EQ_BANDS.map((band) => [band, 50]));
  });
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [newPlaylistQuery, setNewPlaylistQuery] = useState("");
  const [filterFavs, setFilterFavs] = useState(false);
  const [directionInput, setDirectionInput] = useState(() => musicDirection.goal);
  const [autoDjSeekStep, setAutoDjSeekStep] = useState<5 | 10>(5);
  const [analysisRevision, setAnalysisRevision] = useState(0);
  const [libraryScanStatus, setLibraryScanStatus] = useState<"idle" | "running" | "pausing" | "paused" | "completed">("idle");
  const [libraryScanProgress, setLibraryScanProgress] = useState({ processed: 0, total: 0, failed: 0, currentTitle: "" });
  const libraryScanQueueRef = useRef<string[]>([]);
  const libraryScanCheckpointRef = useRef<LibraryScanCheckpoint | null>(null);
  const libraryScanWorkerRef = useRef(false);
  const libraryScanPauseRequestedRef = useRef(false);

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const djMixEngineRef = useRef<VibraDjMixEngine | null>(null);
  const djPreparedTrackIdRef = useRef<string | null>(null);
  const djPreparingTrackIdRef = useRef<string | null>(null);
  const djCrossfadeStartedRef = useRef(false);
  const plannedNextTrackRef = useRef<TrackMeta | null>(null);
  const djTransitionEnabledRef = useRef(autoDjEnabled || partyMode);
  const djTransitionCheckRef = useRef<(audio: HTMLAudioElement) => void>(() => undefined);
  const playbackGainRef = useRef<GainNode | null>(null);
  const volumeRef = useRef(volume);
  const playbackPositionRef = useRef(0);
  const voicePlaybackSnapshotRef = useRef<{ wasPlaying: boolean; currentTime: number; audio: HTMLAudioElement | null } | null>(null);
  const backgroundPlaybackSnapshotRef = useRef<{ trackId: string | null; wasPlaying: boolean; currentTime: number; audio: HTMLAudioElement | null } | null>(null);
  const updatePlaybackSnapshotRef = useRef<{ trackId: string | null; wasPlaying: boolean; currentTime: number; audio: HTMLAudioElement; djTransitionEnabled: boolean } | null>(null);
  const backgroundResumeSuppressedRef = useRef(false);
  const backgroundRestoreInFlightRef = useRef(false);
  const autoDjSeekHoldDelayRef = useRef<number | null>(null);
  const autoDjSeekHoldIntervalRef = useRef<number | null>(null);
  const lastKnownPlayingRef = useRef(false);
  const lastPlaybackCheckpointAtRef = useRef(0);
  const equalizerFiltersRef = useRef<BiquadFilterNode[]>([]);
  const [audioAnalyser, setAudioAnalyser] = useState<AnalyserNode | null>(null);
  const currentUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressRafRef = useRef<number | null>(null);
  const loadGenerationRef = useRef(0);
  const manualSelectionGenerationRef = useRef(0);
  const cancelPendingLoadRef = useRef<(() => void) | null>(null);
  const autoAdvanceInProgressRef = useRef(false);
  const activeSequenceRef = useRef<string[] | null>(null);
  const tracksRef = useRef(tracks);
  const currentIdRef = useRef(currentId);
  const loadTrackRef = useRef<(id: string, autoPlay?: boolean, startTime?: number) => Promise<boolean>>(async () => false);
  const autoAdvanceRef = useRef<() => void>(() => undefined);
  const mediaSessionActionsRef = useRef({
    play: () => undefined,
    pause: () => undefined,
    next: () => undefined,
    previous: () => undefined,
  });
  tracksRef.current = tracks;
  currentIdRef.current = currentId;
  volumeRef.current = volume;

  // Apply user volume and temporary voice ducking at the final Web Audio output.
  // HTMLMediaElement.volume remains the fallback when Web Audio is unavailable.
  const applyVibraVolume = (factor: number) => {
    const effectiveVolume = calculateEffectiveAudioVolume(volumeRef.current, factor);
    const gain = playbackGainRef.current;
    const context = audioContextRef.current;
    const engine = djMixEngineRef.current;
    if (gain && context && context.state !== "closed") {
      const now = context.currentTime;
      // Duck only the music branch; the master fader controls music, DJ voice and FX.
      gain.gain.cancelScheduledValues(now);
      gain.gain.setTargetAtTime(factor, now, 0.04);
      engine?.setMasterVolume(volumeRef.current / 100);
      if (audioRef.current) audioRef.current.volume = 1;
      return;
    }
    if (audioRef.current) audioRef.current.volume = effectiveVolume;
  };

  const mood = MOODS.find((m) => m.mode === activeMode)!;
  const currentTrack = tracks.find((t) => t.id === currentId) ?? null;
  const plannedNextTrack = useMemo(
    () => selectNextAutoDjTrack(tracks, currentId, recentTrackIds, musicDirection),
    [tracks.length, currentId, recentTrackIds, musicDirection, analysisRevision],
  );
  plannedNextTrackRef.current = plannedNextTrack;
  // Auto DJ manages its own no-repeat rotation; manual repeat-one must not stop DJ transitions.
  djTransitionEnabledRef.current = autoDjEnabled || partyMode;

  djTransitionCheckRef.current = (audio) => {
    const engine = djMixEngineRef.current;
    const candidate = plannedNextTrackRef.current;
    if (!engine || !djTransitionEnabledRef.current || activeSequenceRef.current || audio !== engine.activeAudio || !Number.isFinite(audio.duration) || audio.duration <= 0) return;

    if (!engine.isTransitioning && djCrossfadeStartedRef.current) {
      djCrossfadeStartedRef.current = false;
      djPreparedTrackIdRef.current = null;
    }
    if (!candidate || candidate.id === currentIdRef.current) {
      if (djPreparedTrackIdRef.current) {
        engine.clearPreparedNext();
        djPreparedTrackIdRef.current = null;
      }
      setDjMixStatus("standby");
      return;
    }

    if (djPreparedTrackIdRef.current && djPreparedTrackIdRef.current !== candidate.id) {
      engine.clearPreparedNext();
      djPreparedTrackIdRef.current = null;
    }
    const fadeSeconds = Math.min(8, Math.max(1.5, audio.duration * 0.15));
    const remaining = audio.duration - audio.currentTime;

    if (
      remaining <= fadeSeconds &&
      djPreparedTrackIdRef.current === candidate.id &&
      !djCrossfadeStartedRef.current
    ) {
      djCrossfadeStartedRef.current = true;
      setDjMixStatus("mixing");
      const outgoingId = currentIdRef.current;
      const transitionSeconds = Math.max(0.5, Math.min(fadeSeconds, remaining));
      void engine.crossfadeToNext(transitionSeconds * 1000).then((started) => {
        if (!started) {
          djCrossfadeStartedRef.current = false;
          engine.clearPreparedNext();
          djPreparedTrackIdRef.current = null;
          setDjMixStatus("standby");
          return;
        }
        audioRef.current = engine.activeAudio;
        currentIdRef.current = candidate.id;
        setCurrentId(candidate.id);
        setRecentTrackIds((previous) => [candidate.id, ...previous.filter((id) => id !== candidate.id)].slice(0, 5000));
        hbgCore.setContext("music.currentTrack", candidate);
        hbgCore.setContext("music.currentTrackReason", explainAutoDjSelection(
          tracksRef.current.find((track) => track.id === outgoingId) ?? null,
          candidate,
          musicDirection,
        ));
        playbackPositionRef.current = engine.activeAudio.currentTime || 0;
        setCurrentTime(engine.activeAudio.currentTime || 0);
        setDuration(engine.activeAudio.duration || candidate.duration || 0);
        setProgress(0);
        djPreparedTrackIdRef.current = null;
        if (outgoingId !== currentIdRef.current) setIsPlaying(true);
        window.setTimeout(() => {
          if (!engine.isTransitioning && djTransitionEnabledRef.current) setDjMixStatus("standby");
        }, transitionSeconds * 1000 + 120);
      });
      return;
    }

    if (
      remaining <= fadeSeconds + 18 &&
      !djPreparedTrackIdRef.current &&
      djPreparingTrackIdRef.current !== candidate.id
    ) {
      djPreparingTrackIdRef.current = candidate.id;
      setDjMixStatus("preloading");
      void (async () => {
        try {
          const blob = await getAudioBlob(candidate.id);
          if (
            !blob ||
            !djTransitionEnabledRef.current ||
            plannedNextTrackRef.current?.id !== candidate.id ||
            currentIdRef.current === candidate.id
          ) return;
          const ready = await engine.prepareNext(blob);
          if (ready && plannedNextTrackRef.current?.id === candidate.id && djTransitionEnabledRef.current) {
            djPreparedTrackIdRef.current = candidate.id;
            setDjMixStatus("ready");
          } else if (ready) {
            engine.clearPreparedNext();
            setDjMixStatus("standby");
          }
        } catch {
          // A failed preload leaves the current deck playing; ended() uses normal auto-advance.
        } finally {
          if (djPreparingTrackIdRef.current === candidate.id) {
            djPreparingTrackIdRef.current = null;
            if (djPreparedTrackIdRef.current !== candidate.id) setDjMixStatus("standby");
          }
        }
      })();
    }
  };

  useEffect(() => {
    if (autoDjEnabled || partyMode) return;
    djMixEngineRef.current?.clearPreparedNext();
    djPreparedTrackIdRef.current = null;
    djPreparingTrackIdRef.current = null;
  }, [autoDjEnabled, partyMode]);

  useEffect(() => {
    hbgCore.setContext("music.currentTrack", currentTrack);
    hbgCore.setContext("music.isPlaying", isPlaying);
  }, [currentTrack, isPlaying]);
  useEffect(() => setDirectionInput(musicDirection.goal), [musicDirection.goal]);

  // Load all tracks from IndexedDB on mount
  useEffect(() => {
    getAllTrackMeta()
      .then((metas) => {
        const sorted = [...metas].sort((a, b) => a.importedAt - b.importedAt);
        setTracks(sorted);
      })
    .catch((cause) => {
      setTracks([]);
      setError(cause instanceof Error ? `No se pudo leer la biblioteca local: ${cause.message}` : "No se pudo leer la biblioteca local.");
    });
  }, []);

  // Restore an interrupted scan as PAUSED. Never resume analysis automatically on app launch.
  useEffect(() => {
    let cancelled = false;
    getAppState<LibraryScanCheckpoint>(LIBRARY_SCAN_CHECKPOINT_KEY)
      .then((checkpoint) => {
        if (cancelled || !checkpoint || checkpoint.queueIds.length === 0) return;
        libraryScanCheckpointRef.current = checkpoint;
        libraryScanQueueRef.current = [...checkpoint.queueIds];
        setLibraryScanProgress({
          processed: checkpoint.processed,
          total: checkpoint.total,
          failed: checkpoint.failed,
          currentTitle: "",
        });
        setLibraryScanStatus("paused");
      })
      .catch(() => {
        if (!cancelled) setError("No se pudo recuperar el progreso del escaneo anterior.");
      });
    return () => { cancelled = true; };
  }, []);

  // El análisis musical se ejecuta únicamente cuando el usuario lo inicia desde Centro de Escaneo.

  // Persist config; playback remains usable even when browser storage is unavailable.
  useEffect(() => {
    if (!writeStoredValue(STORAGE_KEYS.mood, activeMode)) setError("No se pudo guardar el modo musical en este dispositivo.");
  }, [activeMode]);
  useEffect(() => {
    hbgCore.setContext("music.volume", volume);
    applyVibraVolume(getCurrentAudioDuckingFactor());
    if (!writeStoredValue(STORAGE_KEYS.volume, String(volume))) setError("No se pudo guardar el volumen en este dispositivo.");
  }, [volume]);
  useEffect(() => {
    if (!writeStoredValue(STORAGE_KEYS.favorites, JSON.stringify([...favorites]))) setError("No se pudieron guardar los favoritos.");
  }, [favorites]);
  useEffect(() => {
    if (!writeStoredValue(STORAGE_KEYS.playlists, JSON.stringify(playlists))) setError("No se pudieron guardar las playlists.");
  }, [playlists]);
  useEffect(() => {
    if (currentId && !writeStoredValue(STORAGE_KEYS.trackId, currentId)) setError("No se pudo guardar la canción seleccionada.");
  }, [currentId]);

  useEffect(() => {
    if (tracks.length === 0) return;
    setNormalQueueIds((current) => {
      const available = new Set(tracks.map((track) => track.id));
      const retained = current.filter((id) => available.has(id));
      const additions = tracks.map((track) => track.id).filter((id) => !retained.includes(id));
      return [...retained, ...additions];
    });
  }, [tracks]);

  useEffect(() => {
    if (!writeStoredValue(STORAGE_KEYS.normalQueue, JSON.stringify(normalQueueIds))) {
      setError("No se pudo guardar el orden de la cola del reproductor.");
    }
  }, [normalQueueIds]);
  useEffect(() => {
    const saved =
      writeStoredValue("hbg_vibra_music_direction", JSON.stringify(musicDirection)) &&
      writeStoredValue(STORAGE_KEYS.autoDj, String(autoDjEnabled)) &&
      writeStoredValue(STORAGE_KEYS.partyMode, String(partyMode)) &&
      writeStoredValue(STORAGE_KEYS.shuffle, String(shuffleEnabled)) &&
      writeStoredValue(STORAGE_KEYS.repeat, repeatMode) &&
      writeStoredValue(STORAGE_KEYS.recentTrackIds, JSON.stringify(recentTrackIds));
    if (!saved) setError("No se pudieron guardar las preferencias de sesión musical.");
  }, [autoDjEnabled, musicDirection, partyMode, recentTrackIds, repeatMode, shuffleEnabled]);

  useEffect(() => {
    if (!writeStoredValue(STORAGE_KEYS.equalizer, JSON.stringify(eqValues))) {
      setError("No se pudo guardar la configuración del ecualizador.");
    }
    equalizerFiltersRef.current.forEach((filter, index) => {
      const band = EQ_BANDS[index];
      const value = eqValues[band] ?? 50;
      filter.gain.value = ((value - 50) / 50) * 12;
    });
  }, [eqValues]);

  // Load audio from IndexedDB and play
  const loadTrack = useCallback(async (id: string, autoPlay = false, startTime = 0): Promise<boolean> => {
    const requestId = ++loadGenerationRef.current;
    if (id) writeStoredValue(STORAGE_KEYS.trackId, id);
    writeStoredValue(STORAGE_KEYS.trackTime, String(Number.isFinite(startTime) ? Math.max(0, startTime) : 0));
    cancelPendingLoadRef.current?.();
    setError(null);
    setLoading(true);
    setProgress(0);
    setCurrentTime(0);
    setDuration(0);

    try {
      const blob = await getAudioBlob(id);
      if (requestId !== loadGenerationRef.current) return false;
      if (!blob) throw new Error("Archivo no encontrado en la biblioteca");

      const engine = djMixEngineRef.current;
      let audio = audioRef.current;
      if (!audio) throw new Error("El reproductor de audio no está disponible");

      if (engine) {
        engine.clearPreparedNext();
        djPreparedTrackIdRef.current = null;
        djPreparingTrackIdRef.current = null;
        djCrossfadeStartedRef.current = false;
        const loadedAudio = await engine.loadActive(blob, startTime, autoPlay);
        if (requestId !== loadGenerationRef.current) return false;
        if (!loadedAudio) throw new Error("No se pudo preparar la canción en el deck activo");
        audio = loadedAudio;
        audioRef.current = loadedAudio;
        currentUrlRef.current = null;
      } else {
        if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
        const url = URL.createObjectURL(blob);
        currentUrlRef.current = url;
        audio.src = url;
        applyVibraVolume(getCurrentAudioDuckingFactor());

        await new Promise<void>((resolve, reject) => {
          let settled = false;
          const cleanup = () => {
            if (settled) return;
            settled = true;
            clearTimeout(timeout);
            audio!.removeEventListener("canplay", onReady);
            audio!.removeEventListener("error", onErr);
            if (cancelPendingLoadRef.current === cancelLoad) cancelPendingLoadRef.current = null;
          };
          const timeout = setTimeout(() => {
            cleanup();
            reject(new Error("La canción tardó demasiado en cargar"));
          }, 12000);
          const onReady = () => { cleanup(); resolve(); };
          const onErr = () => { cleanup(); reject(new Error("Error al cargar el audio")); };
          const cancelLoad = () => { cleanup(); resolve(); };
          cancelPendingLoadRef.current = cancelLoad;
          audio!.addEventListener("canplay", onReady);
          audio!.addEventListener("error", onErr);
          audio!.load();
        });
        if (requestId !== loadGenerationRef.current) return false;
        if (startTime > 0 && isFinite(startTime)) audio.currentTime = startTime;
        if (autoPlay) {
          await audioContextRef.current?.resume();
          if (djMixEngineRef.current) await djMixEngineRef.current.resumeActive();
          else await audio.play();
          if (requestId !== loadGenerationRef.current) return false;
          setIsPlaying(true);
        }
      }

      setDuration(audio.duration || 0);
      return true;
    } catch (e) {
      if (requestId !== loadGenerationRef.current) return false;
      const msg = e instanceof Error ? e.message : "Error desconocido";
      setError(msg);
      setIsPlaying(audioRef.current?.paused === false);
      return false;
    } finally {
      if (requestId === loadGenerationRef.current) setLoading(false);
    }
  }, []);
  loadTrackRef.current = loadTrack;

  // Two-deck playback graph: both decks share EQ/analyser/master processing.
  // If Web Audio is unavailable, VIBRA keeps the single-element compatibility path.
  useEffect(() => {
    let context: AudioContext | null = null;
    let engine: VibraDjMixEngine | null = null;
    let audio: HTMLAudioElement;
    let filters: BiquadFilterNode[] = [];

    try {
      // Long-form music favors stable playback buffers over minimum interaction latency.
      context = new AudioContext({ latencyHint: "playback" });
      filters = EQ_BANDS.map((band, index) => {
        const filter = context!.createBiquadFilter();
        filter.frequency.value = EQ_FREQUENCIES[index];
        filter.type = index === 0 ? "lowshelf" : index === EQ_BANDS.length - 1 ? "highshelf" : "peaking";
        filter.Q.value = filter.type === "peaking" ? 1 : 0.7;
        filter.gain.value = ((eqValues[band] - 50) / 50) * 12;
        return filter;
      });
      const analyser = context.createAnalyser();
      analyser.fftSize = 64;
      const outputGain = context.createGain();
      outputGain.gain.value = getCurrentAudioDuckingFactor();

      engine = new VibraDjMixEngine(context);
      engine.setMasterVolume(volumeRef.current / 100);
      engine.connectMusicChain([...filters, analyser, outputGain]);
      djMixEngineRef.current = engine;
      audio = engine.activeAudio;
      audio.volume = 1;
      playbackGainRef.current = outputGain;
      audioContextRef.current = context;
      equalizerFiltersRef.current = filters;
      setAudioAnalyser(analyser);
    } catch {
      engine?.destroy();
      engine = null;
      djMixEngineRef.current = null;
      filters = [];
      playbackGainRef.current = null;
      equalizerFiltersRef.current = [];
      setAudioAnalyser(null);
      audio = new Audio();
      audio.preload = "auto";
      audio.volume = calculateEffectiveAudioVolume(volumeRef.current, getCurrentAudioDuckingFactor());
      audioContextRef.current = null;
      if (context) void context.close().catch(() => undefined);
    }

    audioRef.current = audio;
    const managedAudios = engine ? [...engine.allAudios] : [audio];
    const onTimeUpdate = (target: HTMLAudioElement) => {
      if (target !== audioRef.current) return;
      if (target.duration && isFinite(target.duration)) {
        playbackPositionRef.current = target.currentTime;
        setCurrentTime(target.currentTime);
        setProgress(target.currentTime / target.duration);
      }
      djTransitionCheckRef.current(target);
      const now = Date.now();
      if (!target.paused && now - lastPlaybackCheckpointAtRef.current >= 4000) {
        lastPlaybackCheckpointAtRef.current = now;
        const trackId = currentIdRef.current;
        if (trackId) writeStoredValue(STORAGE_KEYS.trackId, trackId);
        writeStoredValue(STORAGE_KEYS.trackTime, String(target.currentTime || 0));
        writeStoredValue(STORAGE_KEYS.resumeAfterInterruption, "true");
      }
    };
    const onDurationChange = (target: HTMLAudioElement) => {
      if (target === audioRef.current && isFinite(target.duration)) setDuration(target.duration);
    };
    const onEnded = (target: HTMLAudioElement) => {
      if (target !== audioRef.current) return;
      lastKnownPlayingRef.current = false;
      setIsPlaying(false);
      playbackPositionRef.current = 0;
      setProgress(0);
      setCurrentTime(0);
      writeStoredValue(STORAGE_KEYS.trackTime, "0");
      writeStoredValue(STORAGE_KEYS.resumeAfterInterruption, "false");
      autoAdvanceInProgressRef.current = false;
      const endedTrackId = currentIdRef.current;
      window.setTimeout(() => {
        if (audioRef.current !== target || currentIdRef.current !== endedTrackId) return;
        if (!target.ended) return;
        autoAdvanceRef.current();
      }, 0);
    };
    const onError = (target: HTMLAudioElement) => {
      if (target !== audioRef.current) return;
      setError("Error de reproducción — intenta reimportar el archivo");
      setIsPlaying(false);
    };
    const onPlay = (target: HTMLAudioElement) => {
      if (target !== audioRef.current) return;
      lastKnownPlayingRef.current = true;
      setIsPlaying(true);
    };
    const onPause = (target: HTMLAudioElement) => {
      if (target !== audioRef.current) return;
      playbackPositionRef.current = target.currentTime || playbackPositionRef.current;
      if (backgroundResumeSuppressedRef.current) lastKnownPlayingRef.current = false;
      setIsPlaying(false);
    };
    const listeners = managedAudios.map((target) => {
      const time = () => onTimeUpdate(target);
      const duration = () => onDurationChange(target);
      const ended = () => onEnded(target);
      const error = () => onError(target);
      const play = () => onPlay(target);
      const pause = () => onPause(target);
      target.addEventListener("timeupdate", time);
      target.addEventListener("durationchange", duration);
      target.addEventListener("ended", ended);
      target.addEventListener("error", error);
      target.addEventListener("play", play);
      target.addEventListener("pause", pause);
      return { target, time, duration, ended, error, play, pause };
    });

    return () => {
      for (const listener of listeners) {
        listener.target.removeEventListener("timeupdate", listener.time);
        listener.target.removeEventListener("durationchange", listener.duration);
        listener.target.removeEventListener("ended", listener.ended);
        listener.target.removeEventListener("error", listener.error);
        listener.target.removeEventListener("play", listener.play);
        listener.target.removeEventListener("pause", listener.pause);
      }
      if (engine) engine.destroy();
      else audio.pause();
      if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
      currentUrlRef.current = null;
      audioRef.current = null;
      djMixEngineRef.current = null;
      djPreparedTrackIdRef.current = null;
      djPreparingTrackIdRef.current = null;
      playbackGainRef.current = null;
      equalizerFiltersRef.current = [];
      setAudioAnalyser(null);
      const activeContext = audioContextRef.current;
      audioContextRef.current = null;
      if (activeContext) void activeContext.close().catch(() => undefined);
    };

  }, []);

  // Register VIBRA once. The callback reads the latest user volume through volumeRef.
  useEffect(() => registerAudioOutput("vibra.playback", applyVibraVolume), []);

  // Mobile speech capture can interrupt browser media focus. Remember whether VIBRA
  // was playing and restore that same media position when the complete voice session ends.
  useEffect(() => registerAudioSessionLifecycle("vibra.playback", {
    onStart: () => {
      djMixEngineRef.current?.setInteractionActive(true);
      const audio = audioRef.current;
      voicePlaybackSnapshotRef.current = audio
        ? { wasPlaying: !audio.paused && !audio.ended, currentTime: audio.currentTime || 0, audio }
        : null;
      void audioContextRef.current?.resume().catch(() => undefined);
    },
    onEnd: (shouldRestorePlayback) => {
      djMixEngineRef.current?.setInteractionActive(false);
      const snapshot = voicePlaybackSnapshotRef.current;
      voicePlaybackSnapshotRef.current = null;
      const audio = audioRef.current;
      if (!shouldRestorePlayback || !snapshot?.wasPlaying || !audio || !audio.paused || audio.ended) return;

      // If no deck transition occurred, recover a mobile browser's reset position.
      if (snapshot.audio === audio && audio.currentTime + 1 < snapshot.currentTime) {
        try {
          audio.currentTime = snapshot.currentTime;
          playbackPositionRef.current = snapshot.currentTime;
        } catch {
          // The media may no longer be seekable; still attempt an in-place resume.
        }
      }
      void (async () => {
        try {
          await audioContextRef.current?.resume();
          if (djMixEngineRef.current) await djMixEngineRef.current.resumeActive();
          else await audio.play();
        } catch {
          // The browser may retain audio focus until its capture pipeline fully closes.
          // The next explicit play command will retry without reloading the track.
        }
      })();
    },
    // Preserve the current song and position, fade out, then pause before the PWA reloads.
    onBeforeUpdate: async () => {
      const audio = audioRef.current;
      if (!audio) return;
      const snapshot = {
        trackId: currentIdRef.current,
        wasPlaying: !audio.paused && !audio.ended,
        currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : playbackPositionRef.current,
        audio,
        djTransitionEnabled: djTransitionEnabledRef.current,
      };
      updatePlaybackSnapshotRef.current = snapshot;
      if (snapshot.trackId) writeStoredValue(STORAGE_KEYS.trackId, snapshot.trackId);
      writeStoredValue(STORAGE_KEYS.trackTime, String(snapshot.currentTime));
      writeStoredValue(STORAGE_KEYS.resumeAfterInterruption, snapshot.wasPlaying ? "true" : "false");
      if (!snapshot.wasPlaying) return;

      djTransitionEnabledRef.current = false;
      const engine = djMixEngineRef.current;
      engine?.clearPreparedNext();
      djPreparedTrackIdRef.current = null;
      djPreparingTrackIdRef.current = null;
      if (engine) engine.setMasterVolume(0);
      else audio.volume = 0;

      await new Promise<void>((resolve) => window.setTimeout(resolve, 350));
      const activeAudio = audioRef.current ?? audio;
      const finalPosition = Number.isFinite(activeAudio.currentTime) ? activeAudio.currentTime : snapshot.currentTime;
      snapshot.currentTime = finalPosition;
      writeStoredValue(STORAGE_KEYS.trackTime, String(finalPosition));
      if (engine) engine.allAudios.forEach((deckAudio) => deckAudio.pause());
      else activeAudio.pause();
      setIsPlaying(false);
      await audioContextRef.current?.suspend().catch(() => undefined);
    },
    // If the update is cancelled before reload, restore the same playback session.
    onUpdateCancelled: async () => {
      const snapshot = updatePlaybackSnapshotRef.current;
      if (!snapshot) return;
      updatePlaybackSnapshotRef.current = null;
      djTransitionEnabledRef.current = snapshot.djTransitionEnabled;
      const audio = audioRef.current ?? snapshot.audio;
      const engine = djMixEngineRef.current;
      if (engine) engine.setMasterVolume(volumeRef.current / 100);
      else audio.volume = calculateEffectiveAudioVolume(volumeRef.current / 100, getCurrentAudioDuckingFactor());
      if (!snapshot.wasPlaying) return;

      await audioContextRef.current?.resume();
      if (engine) {
        const resumed = await engine.resumeActive();
        if (!resumed) throw new Error("No se pudo reanudar el audio después de cancelar la actualización.");
      } else {
        await audio.play();
      }
      setIsPlaying(!audio.paused);
    },
  }), []);

  const captureBackgroundPlayback = useCallback(() => {
    if (backgroundPlaybackSnapshotRef.current) return;
    const audio = audioRef.current;
    if (!audio) return;
    const snapshot = {
      trackId: currentIdRef.current,
      wasPlaying: (!audio.paused && !audio.ended) || (lastKnownPlayingRef.current && !audio.ended && !backgroundResumeSuppressedRef.current),
      currentTime: Number.isFinite(audio.currentTime) ? audio.currentTime : playbackPositionRef.current,
      audio,
    };
    backgroundPlaybackSnapshotRef.current = snapshot;
    if (snapshot.wasPlaying && !backgroundResumeSuppressedRef.current) {
      if (snapshot.trackId) writeStoredValue(STORAGE_KEYS.trackId, snapshot.trackId);
      writeStoredValue(STORAGE_KEYS.trackTime, String(snapshot.currentTime));
      writeStoredValue(STORAGE_KEYS.resumeAfterInterruption, "true");
    }
  }, []);

  const restoreBackgroundPlayback = useCallback(() => {
    const snapshot = backgroundPlaybackSnapshotRef.current;
    if (!snapshot || backgroundRestoreInFlightRef.current) return;
    // Do not consume the saved session while the PWA is still in the background.
    if (document.visibilityState === "hidden") return;
    if (!shouldRestorePlaybackAfterInterruption(
      snapshot,
      currentIdRef.current,
      backgroundResumeSuppressedRef.current,
    )) {
      backgroundPlaybackSnapshotRef.current = null;
      writeStoredValue(STORAGE_KEYS.resumeAfterInterruption, "false");
      return;
    }

    backgroundRestoreInFlightRef.current = true;
    void (async () => {
      try {
        // Android and iOS can release audio focus a moment after the page becomes visible.
        await new Promise<void>((resolve) => window.setTimeout(resolve, 250));
        if (document.visibilityState === "hidden") return;

        const engine = djMixEngineRef.current;
        const activeAudio = engine?.activeAudio ?? audioRef.current;
        if (!activeAudio || activeAudio.ended) {
          backgroundPlaybackSnapshotRef.current = null;
          writeStoredValue(STORAGE_KEYS.resumeAfterInterruption, "false");
          return;
        }
        if (activeAudio === snapshot.audio) {
          const recoveredTime = recoverPlaybackPosition(activeAudio.currentTime, snapshot.currentTime);
          if (recoveredTime > activeAudio.currentTime + 1) {
            try { activeAudio.currentTime = recoveredTime; } catch { /* Keep the current decoder position. */ }
          }
        }

        const context = audioContextRef.current;
        if (context?.state === "closed") throw new Error("El contexto de audio está cerrado.");
        await context?.resume();
        if (context && context.state !== "running") {
          throw new Error("El navegador todavía mantiene suspendido el contexto de audio.");
        }

        if (activeAudio.paused) {
          if (engine) {
            const resumed = await engine.resumeActive();
            if (!resumed) throw new Error("No se pudo recuperar el deck activo.");
          } else await activeAudio.play();
        }
        if (activeAudio.paused) throw new Error("El navegador no reanudó la reproducción.");

        // Consume the snapshot only after playback has really resumed. If the
        // browser rejects resume/play, focus and visibility events can retry it.
        if (backgroundPlaybackSnapshotRef.current === snapshot) {
          backgroundPlaybackSnapshotRef.current = null;
        }
        backgroundResumeSuppressedRef.current = false;
        lastKnownPlayingRef.current = true;
        writeStoredValue(STORAGE_KEYS.resumeAfterInterruption, "false");
        setIsPlaying(true);
      } catch {
        // Keep the in-memory snapshot: Android may grant audio focus on a later
        // focus/statechange event, even after the first resume attempt was rejected.
        writeStoredValue(STORAGE_KEYS.resumeAfterInterruption, "true");
        setError("VIBRA conservó tu canción, pero el sistema aún no liberó el audio. Se intentará recuperar al volver a primer plano; si no reanuda, toca REPRODUCIR.");
      } finally {
        backgroundRestoreInFlightRef.current = false;
      }
    })();
  }, []);

  // External apps (WhatsApp voice notes, calls, camera) can hide the installed PWA
  // and suspend Web Audio without going through HBG's in-app microphone session.
  useEffect(() => {
    const onVisibilityChange = () => {
      if (document.visibilityState === "hidden") captureBackgroundPlayback();
      else restoreBackgroundPlayback();
    };
    const onPageHide = () => captureBackgroundPlayback();
    const onPageShow = () => {
      if (document.visibilityState !== "hidden") restoreBackgroundPlayback();
    };
    const onFocus = () => restoreBackgroundPlayback();
    document.addEventListener("visibilitychange", onVisibilityChange);
    window.addEventListener("pagehide", onPageHide);
    window.addEventListener("pageshow", onPageShow);
    window.addEventListener("focus", onFocus);
    return () => {
      document.removeEventListener("visibilitychange", onVisibilityChange);
      window.removeEventListener("pagehide", onPageHide);
      window.removeEventListener("pageshow", onPageShow);
      window.removeEventListener("focus", onFocus);
    };
  }, [captureBackgroundPlayback, restoreBackgroundPlayback]);

  // Some mobile browsers report audio-focus recovery asynchronously. Retry the
  // preserved snapshot when the same AudioContext returns to the running state.
  useEffect(() => {
    const context = audioContextRef.current;
    if (!context) return;
    const onStateChange = () => {
      if (context.state === "running" && document.visibilityState !== "hidden") {
        restoreBackgroundPlayback();
      }
    };
    context.addEventListener("statechange", onStateChange);
    return () => context.removeEventListener("statechange", onStateChange);
  }, [restoreBackgroundPlayback]);

  // Restore the last track and its saved position if Android discarded the PWA process.
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || tracks.length === 0) return;
    const savedId = readStoredTrackId();
    const savedTime = Number(readStoredValue(STORAGE_KEYS.trackTime) ?? 0);
    const restoreTime = Number.isFinite(savedTime) && savedTime > 0 ? savedTime : 0;
    const trackToRestore = savedId && tracks.some((track) => track.id === savedId) ? savedId : tracks[0].id;
    const shouldResume = readStoredValue(STORAGE_KEYS.resumeAfterInterruption) === "true" && savedId === trackToRestore;
    setCurrentId(trackToRestore);
    restoredRef.current = true;
    void loadTrack(trackToRestore, false, trackToRestore === savedId ? restoreTime : 0).then(async (loaded) => {
      if (!loaded || !shouldResume) return;
      try {
        await audioContextRef.current?.resume();
        const engine = djMixEngineRef.current;
        if (engine) {
          const resumed = await engine.resumeActive();
          if (!resumed) throw new Error("El navegador no permitió reanudar el audio.");
        } else if (audioRef.current) await audioRef.current.play();
        if (audioRef.current && !audioRef.current.paused) {
          lastKnownPlayingRef.current = true;
          writeStoredValue(STORAGE_KEYS.resumeAfterInterruption, "false");
          setIsPlaying(true);
        }
      } catch {
        // Autoplay can be blocked after a process restart; the position remains ready for a tap.
        setError("Tu sesión anterior se recuperó. Toca REPRODUCIR para continuar desde donde quedó.");
      }
    });
  }, [tracks, loadTrack]);

  const resumePlayback = async (): Promise<boolean> => {
    const audio = audioRef.current;
    if (!audio) return false;

    if (audio.src && audio.src !== window.location.href) {
      try {
        await audioContextRef.current?.resume();
        if (djMixEngineRef.current) {
          const resumed = await djMixEngineRef.current.resumeActive();
          if (!resumed) throw new Error("resume failed");
        } else await audio.play();
        backgroundResumeSuppressedRef.current = false;
        writeStoredValue(STORAGE_KEYS.resumeAfterInterruption, "false");
        setIsPlaying(true);
        return true;
      } catch {
        setError("No se pudo reanudar la canción desde su posición actual.");
        return false;
      }
    }

    const id = currentIdRef.current;
    if (!id) return false;
    return loadTrackRef.current(id, true, playbackPositionRef.current);
  };

  const togglePlay = async () => {
    manualSelectionGenerationRef.current += 1;
    loadGenerationRef.current += 1;
    cancelPendingLoadRef.current?.();
    const audio = audioRef.current;
    if (!audio) return;
    if (!currentId && tracks.length > 0) {
      const id = tracks[0].id;
      if (await loadTrack(id, true)) {
        setCurrentId(id);
        setRecentTrackIds((prev) => [id, ...prev.filter((trackId) => trackId !== id)].slice(0, 5000));
      }
      return;
    }
    if (audio.src && audio.src !== window.location.href) {
      if (isPlaying) {
        backgroundResumeSuppressedRef.current = true;
        lastKnownPlayingRef.current = false;
        writeStoredValue(STORAGE_KEYS.resumeAfterInterruption, "false");
        if (djMixEngineRef.current) {
          djMixEngineRef.current.pauseAll();
          djPreparedTrackIdRef.current = null;
          djPreparingTrackIdRef.current = null;
          djCrossfadeStartedRef.current = false;
          setDjMixStatus("standby");
        } else audio.pause();
      } else {
        await resumePlayback();
      }
    } else if (currentId) {
      await loadTrack(currentId, true);
    }
  };

  const playTrack = async (id: string, preserveSequence = false, automatic = false) => {
    if (!automatic) manualSelectionGenerationRef.current += 1;
    if (!preserveSequence) activeSequenceRef.current = null;
    if (!tracksRef.current.some((track) => track.id === id)) {
      setError("La canción ya no está disponible en la biblioteca.");
      return false;
    }
    const previousTrack = tracksRef.current.find((track) => track.id === currentIdRef.current) ?? null;
    const playing = await loadTrackRef.current(id, true);
    if (!playing) return false;
    setCurrentId(id);
    setRecentTrackIds((prev) => [id, ...prev.filter((trackId) => trackId !== id)].slice(0, 5000));
    const selectedTrack = tracksRef.current.find((track) => track.id === id) ?? null;
    hbgCore.setContext("music.currentTrack", selectedTrack);
    if (!automatic) {
      hbgCore.setContext("music.currentTrackReason", "La canción fue seleccionada directamente desde la biblioteca o por una orden del usuario.");
    } else if (autoDjEnabled && selectedTrack) {
      hbgCore.setContext("music.currentTrackReason", explainAutoDjSelection(previousTrack, selectedTrack, musicDirection));
    }
    return true;
  };

  const playSequenceFrom = async (sequence: string[], startIndex: number, automatic = false) => {
    activeSequenceRef.current = null;
    const selectionGeneration = manualSelectionGenerationRef.current;
    for (let index = startIndex; index < sequence.length; index += 1) {
      if (automatic && selectionGeneration !== manualSelectionGenerationRef.current) return false;
      const id = sequence[index];
      if (!tracksRef.current.some((track) => track.id === id)) continue;
      if (await playTrack(id, true, automatic)) {
        if (automatic && selectionGeneration !== manualSelectionGenerationRef.current) return false;
        activeSequenceRef.current = sequence;
        return true;
      }
    }
    setError("No se pudieron cargar las canciones restantes de esta playlist.");
    return false;
  };

  const applyMusicDirection = () => {
    const nextDirection = interpretMusicDirection(directionInput, musicDirection);
    if (!nextDirection) {
      setError("Indica un objetivo musical para la sesión.");
      return;
    }
    setMusicDirection(nextDirection);
    setError(null);
  };

  autoAdvanceRef.current = () => {
    if (autoAdvanceInProgressRef.current) return;
    const availableTracks = tracksRef.current;
    const currentTrackId = currentIdRef.current;
    const activeSequence = activeSequenceRef.current;

    if (repeatMode === "one" && currentTrackId && !autoDjEnabled) {
      autoAdvanceInProgressRef.current = true;
      void playTrack(currentTrackId, true, true).finally(() => {
        autoAdvanceInProgressRef.current = false;
      });
      return;
    }

    if (activeSequence) {
      const nextId = selectNextPlaybackId(
        activeSequence,
        currentTrackId,
        shuffleEnabled,
        autoDjEnabled ? "off" : repeatMode,
        recentTrackIds,
      );
      if (nextId) {
        autoAdvanceInProgressRef.current = true;
        void (async () => {
          let started = false;
          try {
            started = await playSequenceFrom(activeSequence, activeSequence.indexOf(nextId), true);
          } catch (cause) {
            setError(cause instanceof Error ? cause.message : "No se pudo continuar la playlist.");
          }
          autoAdvanceInProgressRef.current = false;
          if (!started && autoDjEnabled) {
            activeSequenceRef.current = null;
            autoAdvanceRef.current();
          }
        })();
        return;
      }
      if (!autoDjEnabled) {
        activeSequenceRef.current = null;
        return;
      }
      activeSequenceRef.current = null;
    }

    if (!autoDjEnabled) {
      const nextId = selectNextPlaybackId(
        normalQueueIds.filter((id) => availableTracks.some((track) => track.id === id)),
        currentTrackId,
        shuffleEnabled,
        repeatMode,
        recentTrackIds,
      );
      if (nextId) {
        autoAdvanceInProgressRef.current = true;
        void playTrack(nextId, false, true).finally(() => {
          autoAdvanceInProgressRef.current = false;
        });
      }
      return;
    }

    autoAdvanceInProgressRef.current = true;
    const selectionGeneration = manualSelectionGenerationRef.current;
    const failedIds = new Set<string>();
    const attemptNext = async () => {
      try {
        while (true) {
          if (selectionGeneration !== manualSelectionGenerationRef.current) return;
          const candidates = availableTracks.filter((track) => !failedIds.has(track.id));
          // Auto DJ ranks rhythm first and randomizes among close matches.
          // A text mismatch is only a soft preference, never a reason to stop.
          const next = selectNextAutoDjTrack(candidates, currentTrackId, recentTrackIds, musicDirection);
          if (!next) {
            setError(
              availableTracks.length <= 1
                ? "Auto DJ necesita al menos dos canciones en la biblioteca para evitar repetir la misma pista."
                : "Auto DJ no pudo cargar una pista alternativa reproducible de la biblioteca."
            );
            return;
          }
          if (await loadTrackRef.current(next.id, true)) {
            if (selectionGeneration !== manualSelectionGenerationRef.current) return;
            setCurrentId(next.id);
            setRecentTrackIds((prev) => [
              next.id,
              ...prev.filter((id) => id !== next.id),
            ].slice(0, 5000));
            hbgCore.setContext("music.currentTrack", next);
            hbgCore.setContext("music.currentTrackReason", explainAutoDjSelection(
              availableTracks.find((track) => track.id === currentTrackId) ?? null,
              next,
              musicDirection,
            ));
            return;
          }
          failedIds.add(next.id);
        }
      } finally {
        autoAdvanceInProgressRef.current = false;
      }
    };
    void attemptNext();
  };

  const nextTrack = async (): Promise<boolean> => {
    if (autoDjEnabled && !activeSequenceRef.current) {
      const previousTrack = tracksRef.current.find((track) => track.id === currentIdRef.current) ?? null;
      const next = selectNextAutoDjTrack(tracksRef.current, currentIdRef.current, recentTrackIds, musicDirection);
      if (!next) return false;
      const playing = await playTrack(next.id);
      if (playing) hbgCore.setContext("music.currentTrackReason", explainAutoDjSelection(previousTrack, next, musicDirection));
      return playing;
    }
    const activeSequence = activeSequenceRef.current;
    const queue = activeSequence ?? normalQueueIds;
    const nextId = selectNextPlaybackId(
      queue,
      currentId,
      shuffleEnabled,
      repeatMode === "all" ? "all" : "off",
      recentTrackIds,
    );
    if (!nextId) return false;
    if (activeSequence) return playSequenceFrom(activeSequence, activeSequence.indexOf(nextId));
    return playTrack(nextId);
  };

  const prevTrack = async (): Promise<boolean> => {
    const audio = audioRef.current;
    if (audio && audio.currentTime > 3) {
      audio.currentTime = 0;
      return true;
    }
    const activeSequence = activeSequenceRef.current;
    const queue = activeSequence ?? normalQueueIds;
    const previousFromHistory = shuffleEnabled
      ? recentTrackIds.find((id, index) => index > 0 && id !== currentId && queue.includes(id))
      : undefined;
    const previousId = previousFromHistory ?? selectPreviousPlaybackId(
      queue,
      currentId,
      shuffleEnabled,
      repeatMode === "all" ? "all" : "off",
      recentTrackIds,
    );
    if (!previousId) return false;
    if (activeSequence) return playSequenceFrom(activeSequence, activeSequence.indexOf(previousId));
    return playTrack(previousId);
  };

  // Expose the active VIBRA track and four supported transport actions to
  // the operating system media controls (Android lock screen / notification).
  // The browser Media Session API has no standard repeat action; repeat remains
  // controlled in the in-app player until a native Android bridge exists.
  mediaSessionActionsRef.current = {
    play: () => { void resumePlayback(); },
    pause: () => {
      backgroundResumeSuppressedRef.current = true;
      lastKnownPlayingRef.current = false;
      writeStoredValue(STORAGE_KEYS.resumeAfterInterruption, "false");
      preventVoiceSessionPlaybackRestore();
      if (djMixEngineRef.current) {
        djMixEngineRef.current.pauseAll();
        djPreparedTrackIdRef.current = null;
        djPreparingTrackIdRef.current = null;
        djCrossfadeStartedRef.current = false;
        setDjMixStatus("standby");
      } else audioRef.current?.pause();
    },
    next: () => { void nextTrack(); },
    previous: () => { void prevTrack(); },
  };

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const mediaSession = navigator.mediaSession;
    const handlers: Array<[MediaSessionAction, () => void]> = [
      ["play", () => mediaSessionActionsRef.current.play()],
      ["pause", () => mediaSessionActionsRef.current.pause()],
      ["nexttrack", () => mediaSessionActionsRef.current.next()],
      ["previoustrack", () => mediaSessionActionsRef.current.previous()],
    ];
    for (const [action, handler] of handlers) {
      try { mediaSession.setActionHandler(action, handler); } catch {
        // Some browsers expose Media Session but omit individual actions.
      }
    }
    return () => {
      for (const [action] of handlers) {
        try { mediaSession.setActionHandler(action, null); } catch { /* unsupported */ }
      }
      mediaSession.metadata = null;
      mediaSession.playbackState = "none";
    };
  }, []);

  useEffect(() => {
    if (typeof navigator === "undefined" || !("mediaSession" in navigator)) return;
    const mediaSession = navigator.mediaSession;
    if (currentTrack && typeof MediaMetadata !== "undefined") {
      mediaSession.metadata = new MediaMetadata({
        title: currentTrack.title,
        artist: currentTrack.artist || "Artista desconocido",
        album: currentTrack.album || "VIBRA PRO",
      });
    } else {
      mediaSession.metadata = null;
    }
    mediaSession.playbackState = isPlaying ? "playing" : currentTrack ? "paused" : "none";
    if (duration > 0 && Number.isFinite(currentTime)) {
      try {
        mediaSession.setPositionState({
          duration,
          playbackRate: audioRef.current?.playbackRate || 1,
          position: Math.max(0, Math.min(currentTime, duration)),
        });
      } catch {
        // Position reporting is optional and varies across browsers.
      }
    }
  }, [currentTrack, isPlaying, currentTime, duration]);

  const playTrackSequence = async (trackIds: string[]) => {
    const sequence = trackIds.map((id) => tracks.find((track) => track.id === id)).filter((track): track is TrackMeta => Boolean(track));
    if (!sequence.length) {
      return { success: false, error: "La playlist no tiene canciones disponibles en la biblioteca." };
    }
    if (sequence.length !== trackIds.length) {
      return { success: false, error: "La playlist contiene canciones que ya no existen en la biblioteca." };
    }
    const playing = await playSequenceFrom(sequence.map((track) => track.id), 0);
    return playing
      ? { success: true, data: { playlist: sequence, track: sequence[0], isPlaying: true } }
      : { success: false, error: "La playlist fue encontrada, pero no se pudo iniciar el audio." };
  };

  // VIBRA exposes its real capabilities through HBG CORE. The handler is
  // registered only while this independent app is mounted; queued commands
  // are flushed by CORE when the user opens VIBRA.
  useEffect(() => {
    const result = (success: boolean, data?: unknown, error?: string): HBGActionResult => ({
      success,
      ...(data === undefined ? {} : { data }),
      ...(error ? { error } : {}),
    });

    const unregister = [
      hbgCore.registerAction("music.play", async () => {
        const alreadyPlaying = audioRef.current?.paused === false;
        const started = alreadyPlaying || await resumePlayback();
        const playing = audioRef.current?.paused === false;
        return result(started && playing, { isPlaying: playing }, started && playing ? undefined : "No se pudo reanudar la reproducción");
      }),
      hbgCore.registerAction("music.pause", () => {
        preventVoiceSessionPlaybackRestore();
        manualSelectionGenerationRef.current += 1;
        loadGenerationRef.current += 1;
        cancelPendingLoadRef.current?.();
        setLoading(false);
        audioRef.current?.pause();
        const paused = audioRef.current?.paused !== false;
        return result(paused, { isPlaying: !paused }, paused ? undefined : "No se pudo pausar");
      }),
      hbgCore.registerAction("music.next", async () => {
        const started = await nextTrack();
        return started
          ? result(true)
          : result(false, undefined, "No hay una siguiente canción disponible");
      }),
      hbgCore.registerAction("music.previous", async () => {
        const started = await prevTrack();
        return started
          ? result(true)
          : result(false, undefined, "No hay una canción anterior disponible");
      }),
      hbgCore.registerAction("music.shuffle", (payload) => {
        if (typeof payload?.enabled !== "boolean") {
          return result(false, undefined, "El estado de reproducción aleatoria no es válido.");
        }
        setShuffleEnabled(payload.enabled);
        return result(true, { enabled: payload.enabled });
      }),
      hbgCore.registerAction("music.repeat", (payload) => {
        const mode = payload?.mode;
        if (mode !== "off" && mode !== "all" && mode !== "one") {
          return result(false, undefined, "El modo de repetición no es válido.");
        }
        setRepeatMode(mode);
        return result(true, { mode });
      }),
      hbgCore.registerAction("music.mood", (payload) => {
        const mood = MOODS.find(({ mode }) => mode === payload?.mode);
        if (!mood) return result(false, undefined, "El modo de ánimo no es válido");
        setActiveMode(mood.mode);
        return result(true, { mode: mood.mode });
      }),
      hbgCore.registerAction("music.direct", (payload) => {
        const text = String(payload?.text ?? payload?.goal ?? "").trim();
        const nextDirection = interpretMusicDirection(text, musicDirection);
        if (!nextDirection) return result(false, undefined, "No entendí el objetivo musical solicitado.");
        setMusicDirection(nextDirection);
        return result(true, { ...nextDirection });
      }),
      hbgCore.registerAction("music.autoDj", async (payload) => {
        if (typeof payload?.enabled !== "boolean") {
          return result(false, undefined, "Indica si Auto DJ debe activarse o desactivarse.");
        }
        const enabled = payload.enabled;
        setAutoDjEnabled(enabled);
        if (enabled) setView("dj");
        else setPartyMode(false);
        if (enabled && audioRef.current?.paused !== false && tracks.length > 0) {
          if (audioRef.current?.src) {
            await togglePlay();
            if (audioRef.current && !audioRef.current.paused) return result(true, { enabled, isPlaying: true });
          }
          const next = selectNextAutoDjTrack(tracks, currentId, recentTrackIds, musicDirection);
          if (!next) return result(false, undefined, tracks.length <= 1
            ? "Auto DJ necesita al menos dos canciones en la biblioteca para evitar repetir la misma pista."
            : "No se pudo encontrar una pista alternativa reproducible en la biblioteca.");
          const previousTrack = tracks.find((track) => track.id === currentId) ?? null;
          const playing = await playTrack(next.id);
          if (!playing) return result(false, undefined, "Auto DJ no pudo cargar la canción seleccionada.");
          hbgCore.setContext("music.currentTrackReason", explainAutoDjSelection(previousTrack, next, musicDirection));
        }
        return result(true, { enabled });
      }),
      hbgCore.registerAction("music.party", async (payload) => {
        if (typeof payload?.enabled !== "boolean") {
          return result(false, undefined, "Indica si Modo Fiesta PRO debe activarse o desactivarse.");
        }
        const enabled = payload.enabled;
        setPartyMode(enabled);
        if (enabled) {
          setView("dj");
          setAutoDjEnabled(true);
          setMusicDirection((current) => ({ ...current, energy: "up" }));
          const autoDjResult = await hbgCore.dispatchAction("music.autoDj", { enabled: true });
          if (!autoDjResult.success) {
            return result(false, undefined, autoDjResult.error ?? "No se pudo iniciar Auto DJ para Modo Fiesta PRO.");
          }
        }
        return result(true, { enabled, autoDj: enabled || autoDjEnabled, view: enabled ? "dj" : undefined });
      }),
      hbgCore.registerAction("music.search", (payload) => {
        const query = normalizeMusicText(String(payload?.query ?? ""));
        if (!query) return result(false, undefined, "Escribe el nombre de una canción, artista o álbum.");
        const matches = tracks.filter((t) => normalizeMusicText(`${t.title} ${t.artist} ${t.album}`).includes(query));
        hbgCore.setContext("music.searchResults", matches);
        return result(true, { query, results: matches });
      }),
      hbgCore.registerAction("music.playTrack", async (payload) => {
        const requested = String(payload?.id ?? "");
        const index = Number(payload?.index);
        const context = hbgCore.getContext<TrackMeta[]>("music.searchResults") ?? [];
        const track = requested
          ? tracks.find((t) => t.id === requested)
          : Number.isInteger(index) ? context[index - 1] : undefined;
        if (!track) return result(false, undefined, "No encontré esa canción en la biblioteca");
        const playing = await playTrack(track.id);
        return playing
          ? result(true, { track, isPlaying: true })
          : result(false, undefined, "No se pudo iniciar la canción");
      }),
      hbgCore.registerAction("music.volume", (payload) => {
        const requested = Number(payload?.volume);
        if (!Number.isFinite(requested) || requested < 0 || requested > 100) {
          return result(false, undefined, "El volumen debe estar entre 0 y 100");
        }
        setVolume(requested);
        return result(true, { volume: requested });
      }),
      hbgCore.registerAction("music.favorite", (payload) => {
        const id = String(payload?.id ?? currentId ?? "");
        if (!tracks.some((t) => t.id === id)) return result(false, undefined, "No encontré esa canción");
        const mode = String(payload?.mode ?? "toggle");
        const currentlyFavorite = favorites.has(id);
        const nextFavorite = mode === "add" ? true : mode === "remove" ? false : !currentlyFavorite;
        if (nextFavorite !== currentlyFavorite) toggleFav(id);
        return result(true, { id, favorite: nextFavorite });
      }),
      hbgCore.registerAction("music.playlist", async (payload) => {
        const mode = String(payload?.mode ?? "play");
        const requestedName = String(payload?.name ?? "").trim();

        if (mode === "create") {
          if (!requestedName) return result(false, undefined, "Debes indicar un nombre para la playlist");
          if (playlists.some((playlist) => playlist.name.toLowerCase() === requestedName.toLowerCase())) {
            return result(false, undefined, `La playlist "${requestedName}" ya existe`);
          }
          const query = String(payload?.query ?? "").trim();
          const direction = query
            ? interpretMusicDirection(query, { goal: "", energy: "steady" }) ?? { goal: normalizeMusicText(query), energy: "steady" as const }
            : null;
          const matchedTrackIds = direction
            ? selectTracksForDirection(tracks, direction, 50).map((track) => track.id)
            : [];
          if (query && matchedTrackIds.length === 0) {
            return result(false, undefined, `No encontré canciones de "${query}" en la biblioteca; no creé una playlist vacía.`);
          }
          const colors = ["var(--neon-pink)", "var(--neon-cyan)", "var(--neon-green)", "#ff9100", "var(--neon-purple)"];
          const playlist: Playlist = {
            id: `playlist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: requestedName,
            trackIds: matchedTrackIds,
            color: colors[playlists.length % colors.length],
          };
          setPlaylists((prev) => [...prev, playlist]);
          return result(true, { playlist, matchedTracks: matchedTrackIds.length });
        }

        if (mode === "add") {
          const id = String(payload?.id ?? currentId ?? "");
          const playlist = playlists.find((candidate) => candidate.name.toLowerCase() === requestedName.toLowerCase() || candidate.id === requestedName);
          if (!playlist) return result(false, undefined, `No existe la playlist "${requestedName}"`);
          if (!tracks.some((track) => track.id === id)) return result(false, undefined, "No encontré la canción para agregar");
          if (playlist.trackIds.includes(id)) return result(true, { playlist, added: false });
          const updated = { ...playlist, trackIds: [...playlist.trackIds, id] };
          setPlaylists((prev) => prev.map((candidate) => candidate.id === playlist.id ? updated : candidate));
          return result(true, { playlist: updated, added: true });
        }

        if (mode === "remove") {
          const id = String(payload?.id ?? currentId ?? "");
          const playlist = playlists.find((candidate) => candidate.name.toLowerCase() === requestedName.toLowerCase() || candidate.id === requestedName);
          if (!playlist) return result(false, undefined, `No existe la playlist "${requestedName}"`);
          if (!playlist.trackIds.includes(id)) return result(false, undefined, "La canción actual no está en esa playlist");
          const updated = { ...playlist, trackIds: playlist.trackIds.filter((trackId) => trackId !== id) };
          setPlaylists((prev) => prev.map((candidate) => candidate.id === playlist.id ? updated : candidate));
          return result(true, { playlist: updated, removed: true });
        }

        if (mode === "move") {
          const id = String(payload?.id ?? "");
          const targetIndex = Number(payload?.index);
          const playlist = playlists.find((candidate) => candidate.name.toLowerCase() === requestedName.toLowerCase() || candidate.id === requestedName);
          if (!playlist) return result(false, undefined, `No existe la playlist "${requestedName}"`);
          if (!playlist.trackIds.includes(id) || !Number.isInteger(targetIndex) || targetIndex < 0 || targetIndex >= playlist.trackIds.length) {
            return result(false, undefined, "La canción o posición solicitada no es válida.");
          }
          const trackIds = playlist.trackIds.filter((trackId) => trackId !== id);
          trackIds.splice(targetIndex, 0, id);
          const updated = { ...playlist, trackIds };
          setPlaylists((prev) => prev.map((candidate) => candidate.id === playlist.id ? updated : candidate));
          return result(true, { playlist: updated });
        }

        if (mode === "replace") {
          const id = String(payload?.id ?? currentId ?? "");
          const replaceId = String(payload?.replaceId ?? "");
          const playlist = playlists.find((candidate) => candidate.name.toLowerCase() === requestedName.toLowerCase() || candidate.id === requestedName);
          if (!playlist) return result(false, undefined, `No existe la playlist "${requestedName}"`);
          if (!tracks.some((track) => track.id === id) || !playlist.trackIds.includes(replaceId)) {
            return result(false, undefined, "La canción que se va a reemplazar o la nueva canción no está disponible.");
          }
          if (playlist.trackIds.includes(id)) return result(false, undefined, "La canción nueva ya está en esa playlist.");
          const updated = { ...playlist, trackIds: playlist.trackIds.map((trackId) => trackId === replaceId ? id : trackId) };
          setPlaylists((prev) => prev.map((candidate) => candidate.id === playlist.id ? updated : candidate));
          return result(true, { playlist: updated, replaced: true });
        }

        const isFavorites = payload?.favorites === true || requestedName.toLowerCase() === "mis favoritos" || requestedName.toLowerCase() === "favoritos";
        if (isFavorites) {
          const favoriteIds = tracks.filter((track) => favorites.has(track.id)).map((track) => track.id);
          const favoriteResult = await playTrackSequence(favoriteIds);
          return result(favoriteResult.success, favoriteResult.data, favoriteResult.error);
        }

        const playlist = playlists.find((candidate) => candidate.name.toLowerCase() === requestedName.toLowerCase() || candidate.id === requestedName);
        if (!playlist) return result(false, undefined, `No existe la playlist "${requestedName}"`);
        const playlistResult = await playTrackSequence(playlist.trackIds);
        return result(playlistResult.success, { ...playlistResult.data as object, playlist }, playlistResult.error);
      }),
    ];
    return () => unregister.forEach((off) => off());
  }, [autoDjEnabled, currentId, favorites, isPlaying, musicDirection, nextTrack, normalQueueIds, playSequenceFrom, playTrack, playTrackSequence, prevTrack, recentTrackIds, tracks, togglePlay, volume]);

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const t = Number(e.target.value) / 100 * duration;
    audio.currentTime = t;
    playbackPositionRef.current = t;
    setCurrentTime(t);
    setProgress(t / duration);
  };

  const seekAutoDjBy = (direction: -1 | 1) => {
    if (!autoDjEnabled) return;
    const audio = djMixEngineRef.current?.activeAudio ?? audioRef.current;
    const total = audio?.duration || duration;
    if (!audio || !Number.isFinite(total) || total <= 0) return;
    const nextTime = Math.max(0, Math.min(Math.max(0, total - 0.25), audio.currentTime + direction * autoDjSeekStep));
    audio.currentTime = nextTime;
    playbackPositionRef.current = nextTime;
    setCurrentTime(nextTime);
    setProgress(total > 0 ? nextTime / total : 0);
    writeStoredValue(STORAGE_KEYS.trackTime, String(nextTime));
  };

  const stopAutoDjSeekHold = () => {
    if (autoDjSeekHoldDelayRef.current !== null) window.clearTimeout(autoDjSeekHoldDelayRef.current);
    if (autoDjSeekHoldIntervalRef.current !== null) window.clearInterval(autoDjSeekHoldIntervalRef.current);
    autoDjSeekHoldDelayRef.current = null;
    autoDjSeekHoldIntervalRef.current = null;
  };

  const startAutoDjSeekHold = (direction: -1 | 1) => {
    stopAutoDjSeekHold();
    seekAutoDjBy(direction);
    autoDjSeekHoldDelayRef.current = window.setTimeout(() => {
      autoDjSeekHoldIntervalRef.current = window.setInterval(() => seekAutoDjBy(direction), 300);
    }, 450);
  };

  useEffect(() => () => {
    if (autoDjSeekHoldDelayRef.current !== null) window.clearTimeout(autoDjSeekHoldDelayRef.current);
    if (autoDjSeekHoldIntervalRef.current !== null) window.clearInterval(autoDjSeekHoldIntervalRef.current);
  }, []);

  const persistLibraryScanCheckpoint = async (checkpoint: LibraryScanCheckpoint) => {
    libraryScanCheckpointRef.current = checkpoint;
    try {
      await saveAppState(LIBRARY_SCAN_CHECKPOINT_KEY, checkpoint);
    } catch {
      setError("No se pudo guardar el progreso del escaneo. Mantén VIBRA abierta hasta terminar.");
    }
  };

  const runLibraryScan = async () => {
    if (libraryScanWorkerRef.current) return;
    libraryScanWorkerRef.current = true;
    libraryScanPauseRequestedRef.current = false;
    setLibraryScanStatus("running");

    try {
      while (libraryScanQueueRef.current.length > 0 && !libraryScanPauseRequestedRef.current) {
        // Keep the current ID in the persisted queue until it finishes. If the app closes,
        // this song is safely retried on the next manual resume.
        const id = libraryScanQueueRef.current[0];
        const meta = tracksRef.current.find((track) => track.id === id);
        let failed = false;

        if (meta) {
          setLibraryScanProgress((previous) => ({ ...previous, currentTitle: meta.title }));
          try {
            const blob = await getAudioBlob(id);
            if (!blob) throw new Error("El archivo ya no está disponible en la biblioteca.");
            const analysis = await analyzeAudioBlob(blob);
            const enriched = { ...meta, ...analysis };
            await saveTrackMeta(enriched);
            setTracks((previous) => previous.map((track) => track.id === id ? enriched : track));
            setAnalysisRevision((previous) => previous + 1);
          } catch {
            failed = true;
          }
        }

        libraryScanQueueRef.current.shift();
        const previous = libraryScanCheckpointRef.current ?? {
          queueIds: [], processed: 0, total: libraryScanProgress.total, failed: 0, updatedAt: Date.now(),
        };
        const checkpoint: LibraryScanCheckpoint = {
          queueIds: [...libraryScanQueueRef.current],
          processed: Math.min(previous.total, previous.processed + 1),
          total: previous.total,
          failed: previous.failed + (failed ? 1 : 0),
          updatedAt: Date.now(),
        };
        setLibraryScanProgress({
          processed: checkpoint.processed,
          total: checkpoint.total,
          failed: checkpoint.failed,
          currentTitle: "",
        });
        await persistLibraryScanCheckpoint(checkpoint);
      }
    } finally {
      libraryScanWorkerRef.current = false;
      setLibraryScanProgress((previous) => ({ ...previous, currentTitle: "" }));
      if (libraryScanPauseRequestedRef.current && libraryScanQueueRef.current.length > 0) {
        setLibraryScanStatus("paused");
      } else {
        libraryScanQueueRef.current = [];
        libraryScanCheckpointRef.current = null;
        await deleteAppState(LIBRARY_SCAN_CHECKPOINT_KEY).catch(() => undefined);
        setLibraryScanStatus("completed");
      }
    }
  };

  const startLibraryScan = () => {
    if (libraryScanWorkerRef.current) return;
    if (libraryScanStatus === "paused" && libraryScanQueueRef.current.length > 0) {
      void runLibraryScan();
      return;
    }

    const pending = tracksRef.current.filter((track) =>
      track.beatStrength === undefined ||
      track.energyLevel === undefined ||
      track.impactStrength === undefined ||
      track.analyzedAt === undefined
    );
    if (pending.length === 0) {
      setLibraryScanProgress({ processed: tracksRef.current.length, total: tracksRef.current.length, failed: 0, currentTitle: "" });
      setLibraryScanStatus("completed");
      return;
    }

    libraryScanQueueRef.current = pending.map((track) => track.id);
    const checkpoint: LibraryScanCheckpoint = {
      queueIds: [...libraryScanQueueRef.current],
      processed: 0,
      total: pending.length,
      failed: 0,
      updatedAt: Date.now(),
    };
    libraryScanCheckpointRef.current = checkpoint;
    setLibraryScanProgress({ processed: 0, total: pending.length, failed: 0, currentTitle: "" });
    libraryScanPauseRequestedRef.current = false;
    void persistLibraryScanCheckpoint(checkpoint).then(() => runLibraryScan());
  };

  const pauseLibraryScan = () => {
    if (!libraryScanWorkerRef.current) return;
    libraryScanPauseRequestedRef.current = true;
    setLibraryScanStatus("pausing");
  };
  const handleImport = async (files: FileList | null) => {
    if (!files || files.length === 0) return;
    setImporting(true);
    setImportMsg(null);
    let imported = 0;
    let failed = 0;

    const supported = ["audio/mpeg", "audio/mp3", "audio/wav", "audio/ogg", "audio/flac", "audio/x-flac", "audio/aac", "audio/x-m4a", "audio/mp4"];

    for (const file of Array.from(files)) {
      try {
        if (!supported.includes(file.type) && !file.name.match(/\.(mp3|wav|ogg|flac|aac|m4a)$/i)) {
          failed++;
          continue;
        }
        const id = `track_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`;
        const { title, artist } = parseFilename(file.name);
        // File ya es un Blob: guardarlo directamente evita duplicar el archivo completo en RAM.
        const blob: Blob = file;
        const dur = await getAudioDuration(blob);

        const meta: TrackMeta = {
          id, title, artist, album: "", duration: dur,
          size: file.size, type: file.type || "audio/mpeg",
          importedAt: Date.now(),
        };

        await saveAudioBlob(id, blob);
        await saveTrackMeta(meta);
        setTracks((prev) => [...prev, meta]);
        // El análisis queda pendiente hasta que el usuario lo solicite en Centro de Escaneo.
        imported++;

        // Auto-select first imported track
        if (imported === 1) {
          setCurrentId(id);
          loadTrack(id, false);
        }
      } catch {
        failed++;
      }
    }

    setImportMsg(
      imported > 0
        ? `✓ ${imported} canción${imported > 1 ? "es" : ""} importada${imported > 1 ? "s" : ""}${failed > 0 ? ` · ${failed} no compatible${failed > 1 ? "s" : ""}` : ""}`
        : `✗ No se pudo importar — verifica el formato del archivo`
    );
    setTimeout(() => setImportMsg(null), 5000);
    setImporting(false);
  };

  const deleteTrack = async (id: string) => {
    try {
      if (id === currentId) {
        audioRef.current?.pause();
        setIsPlaying(false);
        setCurrentId(null);
        setProgress(0);
        setCurrentTime(0);
      }
      await deleteAudioBlob(id);
      await deleteTrackMeta(id);
      setTracks((prev) => prev.filter((t) => t.id !== id));
      setFavorites((prev) => { const n = new Set(prev); n.delete(id); return n; });
      setPlaylists((prev) => prev.map((playlist) => ({
        ...playlist,
        trackIds: playlist.trackIds.filter((trackId) => trackId !== id),
      })));
      activeSequenceRef.current = activeSequenceRef.current?.filter((trackId) => trackId !== id) ?? null;
      if (id === currentId) hbgCore.setContext("music.currentTrack", null);
    } catch (cause) {
      setError(cause instanceof Error ? `No se pudo eliminar la canción: ${cause.message}` : "No se pudo eliminar la canción.");
    }
  };

  const toggleFav = (id: string) => setFavorites((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const addPlaylist = () => {
    const name = newPlaylistName.trim();
    if (!name) return;
    if (playlists.some((playlist) => playlist.name.toLocaleLowerCase() === name.toLocaleLowerCase())) {
      setError(`La playlist "${name}" ya existe.`);
      return;
    }
    const query = newPlaylistQuery.trim();
    const direction = query
      ? interpretMusicDirection(query, { goal: "", energy: "steady" }) ?? { goal: query, energy: "steady" as const }
      : null;
    const selectedTracks = direction ? selectTracksForDirection(tracks, direction, 50) : [];
    if (query && selectedTracks.length === 0) {
      setError("No encontré canciones que coincidan en tu biblioteca. No creé una playlist vacía.");
      return;
    }
    const colors = ["var(--neon-pink)", "var(--neon-cyan)", "var(--neon-green)", "#ff9100", "var(--neon-purple)"];
    setPlaylists((prev) => [...prev, {
      id: `playlist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
      name,
      trackIds: selectedTracks.map((track) => track.id),
      color: colors[prev.length % colors.length],
    }]);
    setNewPlaylistName("");
    setNewPlaylistQuery("");
    setError(null);
  };

  const movePlaylistTrack = (playlistId: string, trackId: string, offset: -1 | 1) => {
    setPlaylists((prev) => prev.map((playlist) => {
      if (playlist.id !== playlistId) return playlist;
      const currentIndex = playlist.trackIds.indexOf(trackId);
      const targetIndex = currentIndex + offset;
      if (currentIndex < 0 || targetIndex < 0 || targetIndex >= playlist.trackIds.length) return playlist;
      const trackIds = [...playlist.trackIds];
      [trackIds[currentIndex], trackIds[targetIndex]] = [trackIds[targetIndex], trackIds[currentIndex]];
      return { ...playlist, trackIds };
    }));
  };

  const replacePlaylistTrack = (playlistId: string, previousId: string) => {
    if (!currentId || currentId === previousId) return;
    setPlaylists((prev) => prev.map((playlist) => {
      if (playlist.id !== playlistId) return playlist;
      if (!playlist.trackIds.includes(previousId) || playlist.trackIds.includes(currentId)) return playlist;
      return { ...playlist, trackIds: playlist.trackIds.map((id) => id === previousId ? currentId : id) };
    }));
  };

  const filteredTracks = tracks
    .filter((t) => !filterFavs || favorites.has(t.id))
    .filter((t) => !searchQ || t.title.toLowerCase().includes(searchQ.toLowerCase()) || t.artist.toLowerCase().includes(searchQ.toLowerCase()));

  const normalQueueTracks = useMemo(
    () => normalQueueIds.map((id) => tracks.find((track) => track.id === id)).filter((track): track is TrackMeta => Boolean(track)),
    [normalQueueIds, tracks],
  );

  const moveNormalQueueTrack = (trackId: string, direction: -1 | 1) => {
    setNormalQueueIds((current) => {
      const index = current.indexOf(trackId);
      const target = index + direction;
      if (index < 0 || target < 0 || target >= current.length) return current;
      const reordered = [...current];
      [reordered[index], reordered[target]] = [reordered[target], reordered[index]];
      return reordered;
    });
  };

  const progressPct = Math.round(progress * 100);
  const horasEscuchadas = Math.round(tracks.reduce((a, t) => a + t.duration, 0) / 60);

  const NAV_ITEMS: { id: ViewMode; label: string }[] = [
    { id: "player", label: "REPRODUCTOR" },
    { id: "dj", label: "DJ VIBRA" },
    { id: "library", label: "BIBLIOTECA" },
    { id: "playlists", label: "PLAYLISTS" },
    { id: "modes", label: "MODOS" },
    { id: "eq", label: "EQ PRO" },
    { id: "perfil", label: "PERFIL" },
    { id: "universo", label: "UNIVERSO HBG" },
    { id: "scan", label: "CENTRO DE ESCANEO" },
  ];

  return (
    <div>
      <div className="mod-header" style={{ "--mod-color": mood.color } as React.CSSProperties}>
        <span className="mod-icon" style={{ color: mood.color, filter: `drop-shadow(0 0 12px ${mood.color})` }}>◉</span>
        <div className="mod-title-group">
          <div className="mod-title">VIBRA PRO</div>
          <div className="mod-subtitle">// motor de audio · {mood.label} · {mood.bpm[0]}–{mood.bpm[1]} BPM</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6, alignItems: "center" }}>
          {importMsg && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: importMsg.startsWith("✓") ? "var(--neon-green)" : "var(--neon-pink)" }}>{importMsg}</span>}
          <span className="hbg-badge" style={{ background: `${mood.color}15`, borderColor: `${mood.color}50`, color: mood.color }}>{mood.icon} {mood.label}</span>
        </div>
      </div>

      {/* Sub-nav */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20, background: "var(--bg-deep)", padding: 4, borderRadius: 4, border: "1px solid var(--border-dim)", overflowX: "auto", scrollbarWidth: "thin" }}>
        {NAV_ITEMS.map((n) => (
          <button key={n.id} onClick={() => setView(n.id)}
            style={{ flex: "0 0 auto", minWidth: 74, padding: "7px 8px", fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.06em", background: view === n.id ? `${mood.color}18` : "transparent", border: `1px solid ${view === n.id ? mood.color : "transparent"}`, borderRadius: 3, color: view === n.id ? mood.color : "var(--text-muted)", cursor: "pointer", boxShadow: view === n.id ? `0 0 10px ${mood.color}25` : "none", transition: "all 0.15s" }}>
            {n.label}
          </button>
        ))}
      </div>

      {view !== "player" && currentTrack && (
        <div className="hbg-card" aria-label="Reproductor compacto" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 14, padding: "9px 12px" }}>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: mood.color, letterSpacing: "0.08em" }}>REPRODUCIENDO</div>
            <div title={currentTrack.title} style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentTrack.title}</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{currentTrack.artist || "Artista desconocido"}</div>
          </div>
          <button className="hbg-btn hbg-btn-ghost" onClick={togglePlay} disabled={loading} aria-label={isPlaying ? "Pausar música" : "Reanudar música"} style={{ minWidth: 38 }}>{isPlaying ? "⏸" : "▶"}</button>
          <button className="hbg-btn hbg-btn-ghost" onClick={() => setView("player")} style={{ fontSize: 9 }}>ABRIR</button>
        </div>
      )}

      {view === "dj" && (
        <section className={`hbg-card vibra-dj-console ${partyMode ? "is-party" : ""}`} aria-label="Consola DJ VIBRA">
          <header className="vibra-dj-header">
            <div>
              <div className="vibra-dj-eyebrow">VIBRA PRO / LIVE SESSION</div>
              <h2 className="vibra-dj-title">DJ CONSOLE</h2>
              <p className="vibra-dj-subtitle">Una sola cabina. Auto DJ dirige la sesión; Fiesta PRO eleva su energía.</p>
            </div>
            <div className={`vibra-dj-live ${isPlaying ? "is-live" : ""}`} aria-live="polite">
              <span className="vibra-dj-live-dot" />
              {isPlaying ? "EN VIVO" : "EN ESPERA"}
            </div>
          </header>

          <div className="vibra-dj-stage">
            <div className="vibra-dj-stage-top">
              <span>{partyMode ? "FIESTA PRO / HIGH ENERGY" : autoDjEnabled ? "AUTO DJ / SESSION CONTROL" : "MANUAL / SESSION READY"}</span>
              <span>{tracks.length} PISTAS LOCALES</span>
            </div>
            <div className="vibra-dj-spectrum">
              <VisualizerBars active={isPlaying} color={partyMode ? "var(--neon-pink)" : "var(--neon-cyan)"} analyser={audioAnalyser} />
            </div>
            <div className="vibra-dj-stage-foot">
              <span>{isPlaying ? "AUDIO ACTIVO" : "REPRODUCCIÓN DETENIDA"}</span>
              <span>{audioAnalyser ? "ESPECTRO REAL" : "ESPECTRO NO DISPONIBLE"}</span>
              <span>
                {djMixStatus === "mixing" ? "CROSSFADE EN CURSO" :
                  djMixStatus === "ready" ? "SIGUIENTE DECK LISTO" :
                    djMixStatus === "preloading" ? "PREPARANDO SIGUIENTE" :
                      djMixEngineRef.current ? "MIXER 2 DECKS LISTO" : "MIXER SIMPLE"}
              </span>
            </div>
          </div>

          <div className="vibra-dj-mode-grid">
            <button
              type="button"
              className={`vibra-dj-mode ${autoDjEnabled ? "is-active" : ""}`}
              aria-pressed={autoDjEnabled}
              onClick={() => {
                const enabled = !autoDjEnabled;
                void hbgCore.dispatchAction("music.autoDj", { enabled }).then((actionResult) => {
                  if (!actionResult.success) setError(actionResult.error ?? "No se pudo cambiar Auto DJ.");
                });
              }}
            >
              <span className="vibra-dj-mode-icon">◉</span>
              <span className="vibra-dj-mode-copy">
                <strong>AUTO DJ</strong>
                <small>{autoDjEnabled ? "CONDUCCIÓN AUTOMÁTICA ACTIVA" : "SELECCIÓN AUTOMÁTICA DESACTIVADA"}</small>
              </span>
              <span className="vibra-dj-mode-state">{autoDjEnabled ? "ON" : "OFF"}</span>
            </button>
            <button
              type="button"
              className={`vibra-dj-mode vibra-dj-party ${partyMode ? "is-active" : ""}`}
              aria-pressed={partyMode}
              onClick={() => {
                const enabled = !partyMode;
                void hbgCore.dispatchAction("music.party", { enabled }).then((actionResult) => {
                  if (!actionResult.success) setError(actionResult.error ?? "No se pudo activar Modo Fiesta PRO.");
                });
              }}
            >
              <span className="vibra-dj-mode-icon">✦</span>
              <span className="vibra-dj-mode-copy">
                <strong>FIESTA PRO</strong>
                <small>{partyMode ? "PERFIL DE FIESTA ACTIVO" : "ACTIVA EL PERFIL DE FIESTA"}</small>
              </span>
              <span className="vibra-dj-mode-state">{partyMode ? "ON" : "OFF"}</span>
            </button>
          </div>

          <div className="vibra-dj-direction-panel">
            <div className="vibra-dj-section-label">01 / DIRECCIÓN MUSICAL</div>
            <div className="vibra-dj-direction">
              <input
                className="hbg-input"
                aria-label="Objetivo musical"
                placeholder="Ej.: más para cantar, música viejita, más bailable..."
                value={directionInput}
                onChange={(event) => setDirectionInput(event.target.value)}
                onKeyDown={(event) => { if (event.key === "Enter") applyMusicDirection(); }}
              />
              <button className="hbg-btn hbg-btn-primary" onClick={applyMusicDirection}>APLICAR</button>
            </div>
            <div className="vibra-dj-direction-meta">
              <span>OBJETIVO: <strong>{musicDirection.goal || "LIBRE"}</strong></span>
              <span>ENERGÍA: <strong>{musicDirection.energy === "up" ? "ALTA" : "ESTABLE"}</strong></span>
              {musicDirection.vocalFocus && <span>PRIORIDAD VOCAL</span>}
            </div>
          </div>

          <div className="vibra-dj-track-grid">
            <div className="vibra-dj-track">
              <span className="vibra-dj-section-label">02 / SONANDO AHORA</span>
              <strong title={currentTrack?.title ?? "Sin canción"}>{currentTrack?.title ?? "Sin canción seleccionada"}</strong>
              <small>{currentTrack?.artist || (currentTrack ? "Artista desconocido" : "Importa música para iniciar")}</small>
              <small>{formatDjAnalysis(currentTrack)}</small>
            </div>
            <div className="vibra-dj-track vibra-dj-track-next">
              <span className="vibra-dj-section-label">03 / SIGUIENTE CANDIDATA</span>
              <strong title={plannedNextTrack?.title ?? "Buscando alternativa"}>{plannedNextTrack?.title ?? (tracks.length <= 1 ? "Agrega otra canción" : "Buscando alternativa rítmica")}</strong>
              <small>{plannedNextTrack?.artist || (plannedNextTrack ? "Artista desconocido" : tracks.length <= 1 ? "Se necesitan dos pistas para evitar repetir" : "Auto DJ amplía la búsqueda dentro de tu biblioteca")}</small>
              <small>{formatDjAnalysis(plannedNextTrack)}</small>
            </div>
          </div>

          {autoDjEnabled && (
            <div className="vibra-dj-direction-panel" aria-label="Avance y retroceso de Auto DJ">
              <div className="vibra-dj-section-label">04 / NAVEGACIÓN DE PISTA</div>
              <div style={{ display: "flex", alignItems: "center", gap: 8, flexWrap: "wrap" }}>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>PASO:</span>
                <button type="button" className={autoDjSeekStep === 5 ? "hbg-btn hbg-btn-primary" : "hbg-btn hbg-btn-ghost"} aria-pressed={autoDjSeekStep === 5} onClick={() => { stopAutoDjSeekHold(); setAutoDjSeekStep(5); }}>5 SEG</button>
                <button type="button" className={autoDjSeekStep === 10 ? "hbg-btn hbg-btn-primary" : "hbg-btn hbg-btn-ghost"} aria-pressed={autoDjSeekStep === 10} onClick={() => { stopAutoDjSeekHold(); setAutoDjSeekStep(10); }}>10 SEG</button>
                <button type="button" className="hbg-btn hbg-btn-ghost" aria-label={`Retroceder ${autoDjSeekStep} segundos`} disabled={!currentTrack || loading} onPointerDown={(event) => { event.preventDefault(); startAutoDjSeekHold(-1); }} onPointerUp={stopAutoDjSeekHold} onPointerLeave={stopAutoDjSeekHold} onPointerCancel={stopAutoDjSeekHold}>−{autoDjSeekStep} SEG</button>
                <button type="button" className="hbg-btn hbg-btn-ghost" aria-label={`Adelantar ${autoDjSeekStep} segundos`} disabled={!currentTrack || loading} onPointerDown={(event) => { event.preventDefault(); startAutoDjSeekHold(1); }} onPointerUp={stopAutoDjSeekHold} onPointerLeave={stopAutoDjSeekHold} onPointerCancel={stopAutoDjSeekHold}>+{autoDjSeekStep} SEG</button>
              </div>
              <small style={{ display: "block", marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>Mantén presionado para avanzar o retroceder continuamente. Solo afecta la canción actual de Auto DJ.</small>
            </div>
          )}

          <div className="vibra-dj-controls">
            <button type="button" className="hbg-btn hbg-btn-primary" onClick={togglePlay} disabled={!currentTrack || loading}>
              {isPlaying ? "Ⅱ PAUSAR" : "▶ REPRODUCIR"}
            </button>
            <button type="button" className="hbg-btn hbg-btn-ghost" onClick={() => plannedNextTrack && void playTrack(plannedNextTrack.id, false, true)} disabled={!plannedNextTrack || loading}>
              CARGAR SIGUIENTE
            </button>
            <button type="button" className="hbg-btn hbg-btn-ghost" onClick={() => setView("player")}>
              ABRIR REPRODUCTOR
            </button>
          </div>

          <p className="vibra-dj-footnote">
            Auto DJ usa la biblioteca del reproductor, estima BPM, fuerza del pulso, energía e impacto y prioriza compatibilidad rítmica. Prepara el siguiente deck y realiza crossfade cuando Web Audio está disponible; el beatmatching con sincronización de tempo y el análisis ambiental aún no están implementados.
          </p>
        </section>
      )}

      {/* Hidden file input */}
      <input
        ref={fileInputRef}
        type="file"
        accept=".mp3,.wav,.ogg,.flac,.aac,.m4a,audio/*"
        multiple
        style={{ display: "none" }}
        onChange={(e) => handleImport(e.target.files)}
        onClick={(e) => { (e.target as HTMLInputElement).value = ""; }}
      />

      {/* PLAYER */}
      {view === "player" && (
        <div style={{ width: "100%", maxWidth: 680, margin: "0 auto", boxSizing: "border-box" }}>
          <div className="hbg-card hbg-card-accent" style={{ "--card-color": mood.color, width: "100%", boxSizing: "border-box" } as React.CSSProperties}>
            {/* Visualizer */}
            <div style={{ background: "var(--bg-deep)", borderRadius: 3, marginBottom: 14, overflow: "hidden" }}>
              <VisualizerBars active={isPlaying} color={mood.color} analyser={audioAnalyser} />
            </div>

            {/* Track info */}
            {currentTrack ? (
              <div style={{ textAlign: "center", marginBottom: 14 }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: isPlaying ? mood.color : "var(--text-primary)", textShadow: isPlaying ? `0 0 16px ${mood.color}` : "none", marginBottom: 4, letterSpacing: "0.06em", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                  {currentTrack.title}
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>{currentTrack.artist || "Artista desconocido"}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>
                  {formatDuration(currentTrack.duration)}
                  {currentTrack.type && ` · ${currentTrack.type.replace("audio/", "").toUpperCase()}`}
                </div>
              </div>
            ) : (
              <div style={{ textAlign: "center", marginBottom: 14 }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 13, color: "var(--text-muted)", marginBottom: 6 }}>Sin música importada</div>
                <button className="hbg-btn hbg-btn-primary" onClick={() => fileInputRef.current?.click()} style={{ margin: "0 auto" }}>
                  ↑ IMPORTAR MÚSICA
                </button>
              </div>
            )}

            {/* Error */}
            {error && (
              <div style={{ background: "rgba(255,64,129,0.08)", border: "1px solid rgba(255,64,129,0.3)", borderRadius: 3, padding: "8px 12px", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--neon-pink)", marginBottom: 10 }}>
                ⚠ {error}
              </div>
            )}

            {/* Progress bar */}
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10, width: "100%", minWidth: 0, boxSizing: "border-box" }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", minWidth: 32 }}>
                {formatDuration(currentTime)}
              </span>
              <input
                type="range" min={0} max={100} value={progressPct}
                onChange={seek}
                style={{ flex: 1, minWidth: 0, accentColor: mood.color, cursor: "pointer", height: 4 }}
                disabled={!currentTrack || loading}
              />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", minWidth: 32 }}>
                {formatDuration(duration > 0 ? duration : (currentTrack?.duration ?? 0))}
              </span>
            </div>

            {/* Controls */}
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <button className="hbg-btn hbg-btn-ghost" style={{ padding: "7px 12px" }} onClick={() => void prevTrack()} disabled={!currentTrack || tracks.length < 2}>⏮</button>
              <button
                className="hbg-btn"
                style={{ padding: "9px 22px", background: `${mood.color}20`, borderColor: mood.color, color: mood.color, fontSize: 20, boxShadow: isPlaying ? `0 0 20px ${mood.color}40` : "none", opacity: loading ? 0.6 : 1 }}
                onClick={togglePlay}
                disabled={loading}
              >
                {loading ? "◎" : isPlaying ? "⏸" : "▶"}
              </button>
              <button className="hbg-btn hbg-btn-ghost" style={{ padding: "7px 12px" }} onClick={() => void nextTrack()} disabled={!currentTrack || tracks.length < 2}>⏭</button>
              <button className="hbg-btn hbg-btn-ghost" style={{ padding: "7px 12px" }} onClick={() => currentId && toggleFav(currentId)}>
                <span style={{ color: currentId && favorites.has(currentId) ? "#ffd740" : undefined }}>
                  {currentId && favorites.has(currentId) ? "★" : "☆"}
                </span>
              </button>
            </div>

            <div style={{ display: "flex", justifyContent: "center", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
              <button
                className="hbg-btn hbg-btn-ghost"
                aria-pressed={shuffleEnabled}
                onClick={() => setShuffleEnabled((enabled) => !enabled)}
                style={{ fontSize: 9, borderColor: shuffleEnabled ? mood.color : undefined, color: shuffleEnabled ? mood.color : undefined }}
              >
                🔀 ALEATORIO {shuffleEnabled ? "ON" : "OFF"}
              </button>
              <button
                className="hbg-btn hbg-btn-ghost"
                aria-pressed={repeatMode !== "off"}
                onClick={() => setRepeatMode((mode) => mode === "off" ? "all" : mode === "all" ? "one" : "off")}
                style={{ fontSize: 9, borderColor: repeatMode !== "off" ? mood.color : undefined, color: repeatMode !== "off" ? mood.color : undefined }}
              >
                {repeatMode === "off" ? "🔁 REPETIR OFF" : repeatMode === "all" ? "🔁 REPETIR TODO" : "🔂 REPETIR UNA"}
              </button>
            </div>

            {/* Volume */}
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>🔉</span>
              <input type="range" min={0} max={100} value={volume}
                onChange={(e) => setVolume(Number(e.target.value))}
                style={{ flex: 1, accentColor: mood.color, cursor: "pointer" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: mood.color, minWidth: 32 }}>{volume}%</span>
            </div>
            {!autoDjEnabled && (
              <div style={{ marginTop: 16, borderTop: "1px solid var(--border-dim)", paddingTop: 12 }}>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700 }}>COLA DEL REPRODUCTOR</span>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{normalQueueTracks.length} CANCIONES</span>
                </div>
                <div style={{ maxHeight: 260, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
                  {normalQueueTracks.map((track, index) => (
                    <div key={track.id} style={{ display: "flex", alignItems: "center", gap: 8, padding: "7px 8px", borderRadius: 3, border: "1px solid var(--border-dim)", background: track.id === currentId ? "rgba(0, 220, 255, 0.08)" : "transparent" }}>
                      <button type="button" className="hbg-btn hbg-btn-ghost" style={{ minWidth: 26, padding: "3px 5px", fontSize: 9 }} onClick={() => void playTrack(track.id)} aria-label={"Reproducir " + track.title}>▶</button>
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: track.id === currentId ? mood.color : "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{index + 1}. {track.title}</div>
                        <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{track.artist || "Artista desconocido"}</div>
                      </div>
                      <button type="button" className="hbg-btn hbg-btn-ghost" style={{ minWidth: 27, padding: "3px 6px" }} onClick={() => moveNormalQueueTrack(track.id, -1)} disabled={index === 0} aria-label={"Subir " + track.title}>↑</button>
                      <button type="button" className="hbg-btn hbg-btn-ghost" style={{ minWidth: 27, padding: "3px 6px" }} onClick={() => moveNormalQueueTrack(track.id, 1)} disabled={index === normalQueueTracks.length - 1} aria-label={"Bajar " + track.title}>↓</button>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>

          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <button className="hbg-btn hbg-btn-ghost" style={{ flex: 1, justifyContent: "center", fontSize: 9 }} onClick={() => fileInputRef.current?.click()} disabled={importing}>
              {importing ? "◎ IMPORTANDO..." : "↑ IMPORTAR MÚSICA"}
            </button>
            <button className="hbg-btn hbg-btn-ghost" style={{ flex: 1, justifyContent: "center", fontSize: 9 }} onClick={() => setView("library")}>
              ⬡ BIBLIOTECA ({tracks.length})
            </button>
            <button className="hbg-btn hbg-btn-ghost" style={{ flex: 1, justifyContent: "center", fontSize: 9 }} onClick={() => setView("modes")}>
              ◆ {mood.label}
            </button>
          </div>
        </div>
      )}

      {/* CENTRO DE ESCANEO */}
      {view === "scan" && (
        <section className="hbg-card" aria-label="Centro de Escaneo">
          <div className="section-title">// CENTRO DE ESCANEO</div>
          <p style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", lineHeight: 1.6 }}>
            Los análisis se ejecutan únicamente cuando tú los inicias. VIBRA procesa una canción a la vez y guarda sus resultados para reutilizarlos.
          </p>
          <div className="hbg-card" style={{ marginTop: 12, border: "1px solid var(--border-dim)" }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 700, marginBottom: 6 }}>ANALIZAR BIBLIOTECA</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginBottom: 12 }}>
              Calcula BPM, pulso, energía, impacto y tonalidad de las canciones que todavía no tienen un análisis completo.
            </div>
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
              <button className="hbg-btn hbg-btn-primary" onClick={startLibraryScan} disabled={libraryScanStatus === "running" || libraryScanStatus === "pausing" || tracks.length === 0}>
                {libraryScanStatus === "paused" ? "▶ REANUDAR" : libraryScanStatus === "completed" ? "↻ REVISAR PENDIENTES" : "▶ ESCANEAR BIBLIOTECA"}
              </button>
              <button className="hbg-btn hbg-btn-ghost" onClick={pauseLibraryScan} disabled={libraryScanStatus !== "running"}>PAUSAR</button>
            </div>
            <div style={{ marginTop: 12, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }} aria-live="polite">
              {libraryScanStatus === "running" && "ANALIZANDO: " + (libraryScanProgress.currentTitle || "preparando...")}
              {libraryScanStatus === "pausing" && "TERMINANDO LA CANCIÓN ACTUAL PARA PAUSAR..."}
              {libraryScanStatus === "paused" && "ESCANEO PAUSADO · PUEDES REANUDARLO"}
              {libraryScanStatus === "completed" && "ESCANEO TERMINADO · " + libraryScanProgress.failed + " ERROR(ES)"}
              {libraryScanStatus === "idle" && "LISTO · NO SE HA INICIADO NINGÚN ESCANEO"}
            </div>
            <div style={{ height: 6, marginTop: 8, borderRadius: 4, background: "var(--bg-deep)", overflow: "hidden" }}>
              <div style={{ height: "100%", width: (libraryScanProgress.total ? (libraryScanProgress.processed / libraryScanProgress.total) * 100 : 0) + "%", background: mood.color, transition: "width 0.2s ease" }} />
            </div>
            <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
              {libraryScanProgress.processed} / {libraryScanProgress.total} canciones · {libraryScanProgress.failed} errores
            </div>
          </div>
          <div className="hbg-card" style={{ marginTop: 10, opacity: 0.75 }}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700 }}>ESCANEAR DISPOSITIVO Y DUPLICADOS</div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 5 }}>
              Estas dos operaciones se incorporarán en sus módulos propios. Todavía no se ejecutan desde esta pantalla.
            </div>
          </div>
        </section>
      )}
      {/* LIBRARY */}
      {view === "library" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input className="hbg-input" style={{ flex: 1 }} placeholder="// buscar en biblioteca..." value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
            <button className="hbg-btn hbg-btn-primary" onClick={() => fileInputRef.current?.click()} disabled={importing} style={{ whiteSpace: "nowrap" }}>
              {importing ? "◎" : "↑ IMPORTAR"}
            </button>
          </div>

          <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
            <button className="hbg-badge" style={{ cursor: "pointer", background: !filterFavs ? `${mood.color}18` : undefined, borderColor: !filterFavs ? mood.color : "var(--border-dim)", color: !filterFavs ? mood.color : "var(--text-muted)" }} onClick={() => setFilterFavs(false)}>TODAS</button>
            <button className="hbg-badge" style={{ cursor: "pointer", background: filterFavs ? `${mood.color}18` : undefined, borderColor: filterFavs ? mood.color : "var(--border-dim)", color: filterFavs ? mood.color : "var(--text-muted)" }} onClick={() => setFilterFavs(true)}>★ FAVORITAS</button>
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginLeft: "auto", alignSelf: "center" }}>{filteredTracks.length} de {tracks.length} canciones</span>
          </div>

          {tracks.length === 0 ? (
            <div className="hbg-card" style={{ textAlign: "center", padding: "30px 20px" }}>
              <div style={{ fontSize: 36, marginBottom: 12 }}>◉</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 13, color: "var(--text-muted)", marginBottom: 12 }}>BIBLIOTECA VACÍA</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginBottom: 16 }}>Importa archivos MP3, WAV, OGG o FLAC</div>
              <button className="hbg-btn hbg-btn-primary" onClick={() => fileInputRef.current?.click()}>↑ IMPORTAR MÚSICA</button>
            </div>
          ) : (
            <div className="hbg-list">
              {filteredTracks.map((t, idx) => (
                <div key={t.id} className="hbg-list-item"
                  style={{ cursor: "pointer", borderColor: t.id === currentId ? mood.color : undefined, background: t.id === currentId ? `${mood.color}08` : undefined }}
                  onClick={() => playTrack(t.id)}>
                  <div style={{ color: t.id === currentId ? mood.color : "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10, minWidth: 20 }}>
                    {t.id === currentId && isPlaying ? "♪" : (idx + 1)}
                  </div>
                  <div style={{ flex: 1, overflow: "hidden" }}>
                    <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: t.id === currentId ? mood.color : "var(--text-primary)", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{t.title}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                      {t.artist} · {t.type.replace("audio/", "").toUpperCase()} · {(t.size / 1024 / 1024).toFixed(1)} MB
                    </div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); toggleFav(t.id); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: favorites.has(t.id) ? "#ffd740" : "var(--text-muted)", flexShrink: 0 }}>
                    {favorites.has(t.id) ? "★" : "☆"}
                  </button>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", flexShrink: 0 }}>{formatDuration(t.duration)}</span>
                  <button onClick={(e) => { e.stopPropagation(); deleteTrack(t.id); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 11, color: "var(--text-muted)", flexShrink: 0, padding: "0 4px" }} title="Eliminar">✕</button>
                </div>
              ))}
            </div>
          )}

          {importMsg && (
            <div style={{ marginTop: 12, padding: "8px 12px", background: "rgba(0,229,255,0.06)", border: "1px solid rgba(0,229,255,0.2)", borderRadius: 3, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--neon-cyan)" }}>
              {importMsg}
            </div>
          )}
        </div>
      )}

      {/* PLAYLISTS */}
      {view === "playlists" && (
        <div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 8, marginBottom: 14 }}>
            <input className="hbg-input" style={{ flex: "1 1 180px" }} aria-label="Nombre de la playlist" placeholder="Nombre de la playlist..." value={newPlaylistName} onChange={(e) => setNewPlaylistName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPlaylist()} />
            <input className="hbg-input" style={{ flex: "1 1 180px" }} aria-label="Estilo o intención musical de la playlist" placeholder="Estilo o intención (opcional)..." value={newPlaylistQuery} onChange={(e) => setNewPlaylistQuery(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPlaylist()} />
            <button className="hbg-btn hbg-btn-primary" onClick={addPlaylist} disabled={!newPlaylistName.trim()}>+ CREAR</button>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginBottom: 10 }}>
            Si indicas un estilo, época o intención, VIBRA selecciona hasta 50 canciones disponibles de tu biblioteca local.
          </div>
          {playlists.length === 0 ? (
            <div className="hbg-card" style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", textAlign: "center", padding: "20px" }}>// crea tu primera playlist</div>
          ) : (
            <div className="hbg-grid hbg-grid-2" style={{ gap: 10 }}>
              {playlists.map((pl) => (
                <div key={pl.id} className="hbg-card hbg-card-accent" style={{ "--card-color": pl.color } as React.CSSProperties}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 700, color: pl.color, marginBottom: 6, letterSpacing: "0.08em" }}>{pl.name}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>{pl.trackIds.length} canciones</div>
                  {pl.trackIds.map((id, trackIndex) => {
                    const track = tracks.find((candidate) => candidate.id === id);
                    return (
                      <div key={id} style={{ display: "flex", alignItems: "center", gap: 6, marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 9 }}>
                        <span style={{ flex: 1, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap", color: "var(--text-secondary)" }}>
                          {track ? `${track.title} · ${track.artist}` : "Canción no disponible"}
                        </span>
                        <button
                          className="hbg-btn hbg-btn-ghost"
                          aria-label={`Quitar ${track?.title ?? "canción"} de ${pl.name}`}
                          style={{ fontSize: 8, padding: "2px 5px" }}
                          onClick={() => setPlaylists((prev) => prev.map((candidate) =>
                            candidate.id === pl.id
                              ? { ...candidate, trackIds: candidate.trackIds.filter((trackId) => trackId !== id) }
                              : candidate
                          ))}
                        >
                          QUITAR
                        </button>
                        <button
                          className="hbg-btn hbg-btn-ghost"
                          aria-label={`Subir ${track?.title ?? "canción"} en ${pl.name}`}
                          style={{ fontSize: 8, padding: "2px 5px" }}
                          onClick={() => movePlaylistTrack(pl.id, id, -1)}
                          disabled={trackIndex === 0}
                        >
                          ↑
                        </button>
                        <button
                          className="hbg-btn hbg-btn-ghost"
                          aria-label={`Bajar ${track?.title ?? "canción"} en ${pl.name}`}
                          style={{ fontSize: 8, padding: "2px 5px" }}
                          onClick={() => movePlaylistTrack(pl.id, id, 1)}
                          disabled={trackIndex === pl.trackIds.length - 1}
                        >
                          ↓
                        </button>
                        <button
                          className="hbg-btn hbg-btn-ghost"
                          aria-label={`Sustituir canción por la actual en ${pl.name}`}
                          style={{ fontSize: 8, padding: "2px 5px" }}
                          onClick={() => replacePlaylistTrack(pl.id, id)}
                          disabled={!currentId || currentId === id || pl.trackIds.includes(currentId)}
                        >
                          SUSTITUIR
                        </button>
                      </div>
                    );
                  })}
                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    <button
                      className="hbg-btn hbg-btn-ghost"
                      style={{ fontSize: 9, padding: "4px 8px" }}
                      onClick={() => {
                        if (!currentId) return;
                        if (pl.trackIds.includes(currentId)) {
                          setError("La canción actual ya está en esta playlist.");
                          return;
                        }
                        setPlaylists((prev) => prev.map((candidate) => candidate.id === pl.id
                          ? { ...candidate, trackIds: [...candidate.trackIds, currentId] }
                          : candidate
                        ));
                      }}
                      disabled={!currentId}
                    >
                      + ACTUAL
                    </button>
                    <button
                      className="hbg-btn hbg-btn-ghost"
                      style={{ fontSize: 9, padding: "4px 8px" }}
                      onClick={() => {
                        void playTrackSequence(pl.trackIds).then((result) => {
                          if (!result.success) setError(result.error ?? "No se pudo reproducir la playlist.");
                        });
                        setView("player");
                      }}
                      disabled={pl.trackIds.length === 0}
                    >
                      ▶ PLAY
                    </button>
                    <button className="hbg-btn hbg-btn-danger" style={{ fontSize: 9, padding: "4px 8px" }} onClick={() => setPlaylists(p => p.filter(x => x.id !== pl.id))}>✕</button>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* MODES */}
      {view === "modes" && (
        <div>
          <div className="section-title">// seleccionar modo de ánimo</div>
          <div className="hbg-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 8 }}>
            {MOODS.map((m) => (
              <button key={m.mode} className="hbg-card"
                style={{ cursor: "pointer", textAlign: "left", padding: "12px 14px", border: `1px solid ${activeMode === m.mode ? m.color : "var(--border-dim)"}`, background: activeMode === m.mode ? `${m.color}10` : "var(--bg-card)", boxShadow: activeMode === m.mode ? `0 0 16px ${m.color}25` : "none" }}
                onClick={() => setActiveMode(m.mode)}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 16, color: m.color, filter: activeMode === m.mode ? `drop-shadow(0 0 6px ${m.color})` : "none" }}>{m.icon}</span>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: activeMode === m.mode ? m.color : "var(--text-primary)" }}>{m.label}</span>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{m.bpm[0]}–{m.bpm[1]} BPM</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* EQ PRO */}
      {view === "eq" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>// ecualizador de audio — 10 bandas</div>
            <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 9 }} onClick={() => setEqValues(Object.fromEntries(EQ_BANDS.map((b) => [b, 50])))}>RESET</button>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginBottom: 12 }}>
            {audioAnalyser ? "El ecualizador procesa el audio local mediante filtros Web Audio y conserva sus ajustes en este dispositivo." : "Este navegador no habilitó Web Audio; la reproducción sigue disponible, pero el ecualizador y el espectro no están activos."}
          </div>
          <div className="hbg-card" style={{ background: "var(--bg-deep)" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", height: 180, padding: "16px 8px 8px" }}>
              {EQ_BANDS.map((band) => {
                const val = eqValues[band];
                const db = ((val - 50) / 50 * 12).toFixed(1);
                return (
                  <div key={band} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: val !== 50 ? mood.color : "var(--text-muted)" }}>
                      {Number(db) > 0 ? "+" : ""}{db}
                    </span>
                    <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <input type="range" min={0} max={100} value={val}
                        onChange={(e) => setEqValues((prev) => ({ ...prev, [band]: Number(e.target.value) }))}
                        style={{ writingMode: "vertical-lr", direction: "rtl", width: "100%", height: "100%", accentColor: mood.color, cursor: "pointer" } as React.CSSProperties} />
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>{band}</span>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* PERFIL */}
      {view === "perfil" && (
        <div>
          <div className="hbg-grid hbg-grid-3" style={{ gap: 10, marginBottom: 16 }}>
            {[
              { label: "CANCIONES EN BIBLIOTECA", value: tracks.length, color: "var(--neon-pink)" },
              { label: "FAVORITAS", value: favorites.size, color: "#ffd740" },
              { label: "DURACIÓN TOTAL (MIN)", value: horasEscuchadas, color: "var(--neon-cyan)" },
            ].map((stat) => (
              <div key={stat.label} className="hbg-card hbg-card-accent" style={{ "--card-color": stat.color } as React.CSSProperties}>
                <div className="card-label">{stat.label}</div>
                <div className="card-value" style={{ color: stat.color, textShadow: `0 0 12px ${stat.color}`, fontSize: 22 }}>{stat.value}</div>
              </div>
            ))}
          </div>

          <div className="hbg-grid hbg-grid-2" style={{ gap: 10 }}>
            <div className="hbg-card">
              <div className="section-title">// modo activo</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: mood.color, textShadow: `0 0 14px ${mood.color}`, marginBottom: 8 }}>{mood.label}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>BPM sugerido: {mood.bpm[0]}–{mood.bpm[1]}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>Playlists: {playlists.length}</div>
            </div>
            <div className="hbg-card">
              <div className="section-title">// reproductores compatibles</div>
              {["MP3", "WAV", "OGG", "FLAC", "AAC", "M4A"].map((fmt) => (
                <div key={fmt} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                  <span style={{ width: 6, height: 6, borderRadius: "50%", background: "var(--neon-green)", display: "inline-block" }} />
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>{fmt}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* UNIVERSO HBG */}
      {view === "universo" && (
        <UniversoScreen currentApp="vibra" appColor={mood.color} mood={activeMode} />
      )}
    </div>
  );
}
