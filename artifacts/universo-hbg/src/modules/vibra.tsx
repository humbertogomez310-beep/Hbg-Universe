import { useState, useEffect, useRef, useCallback } from "react";
import { UniversoScreen } from "../components/UniversoScreen";
import { hbgCore, type HBGActionResult } from "../core/hbgCore";
import {
  saveAudioBlob,
  getAudioBlob,
  saveTrackMeta,
  getAllTrackMeta,
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
  selectNextTrack,
  type MusicDirection,
} from "./musicDirector";

type MoodMode = "party" | "focus" | "creative" | "chill" | "nostalgia" | "sad" | "happy" | "normal";
type ViewMode = "player" | "library" | "playlists" | "modes" | "eq" | "perfil" | "universo";

interface Playlist {
  id: string;
  name: string;
  trackIds: string[];
  color: string;
}

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
};

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

function VisualizerBars({ active, color }: { active: boolean; color: string }) {
  const [heights, setHeights] = useState<number[]>(() => Array(24).fill(4));
  useEffect(() => {
    if (!active) { setHeights(Array(24).fill(4)); return; }
    const id = setInterval(() => {
      setHeights(Array.from({ length: 24 }, () => Math.random() * 50 + 4));
    }, 90);
    return () => clearInterval(id);
  }, [active]);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 56, padding: "0 4px" }}>
      {heights.map((h, i) => (
        <div key={i} style={{ flex: 1, height: `${h}px`, background: color, borderRadius: "1px 1px 0 0", boxShadow: active ? `0 0 4px ${color}` : "none", transition: "height 0.09s ease", opacity: 0.75 }} />
      ))}
    </div>
  );
}

export function VibraModule() {
  // Restore persisted values
  const [activeMode, setActiveMode] = useState<MoodMode>(() => (localStorage.getItem(STORAGE_KEYS.mood) as MoodMode) || "focus");
  const [volume, setVolume] = useState(() => Number(localStorage.getItem(STORAGE_KEYS.volume) ?? 80));
  const [favorites, setFavorites] = useState<Set<string>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.favorites) ?? "[]")); } catch { return new Set(); }
  });
  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.playlists) ?? "[]"); } catch { return []; }
  });
  const [musicDirection, setMusicDirection] = useState<MusicDirection>(() => readMusicDirection(localStorage));
  const [autoDjEnabled, setAutoDjEnabled] = useState(() => localStorage.getItem(STORAGE_KEYS.autoDj) === "true");
  const [partyMode, setPartyMode] = useState(() => localStorage.getItem(STORAGE_KEYS.partyMode) === "true");
  const [voiceCaptureActive, setVoiceCaptureActive] = useState(false);
  const [recentTrackIds, setRecentTrackIds] = useState<string[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.recentTrackIds) ?? "[]"); } catch { return []; }
  });

  const [view, setView] = useState<ViewMode>("player");
  const [tracks, setTracks] = useState<TrackMeta[]>([]);
  const [currentId, setCurrentId] = useState<string | null>(() => localStorage.getItem(STORAGE_KEYS.trackId));
  const [isPlaying, setIsPlaying] = useState(false);
  const [progress, setProgress] = useState(0); // 0–1
  const [currentTime, setCurrentTime] = useState(0);
  const [duration, setDuration] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [importing, setImporting] = useState(false);
  const [importMsg, setImportMsg] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [searchQ, setSearchQ] = useState("");
  const [eqValues, setEqValues] = useState<Record<string, number>>(() => Object.fromEntries(EQ_BANDS.map((b) => [b, 50])));
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [filterFavs, setFilterFavs] = useState(false);
  const [directionInput, setDirectionInput] = useState(() => musicDirection.goal);

  const audioRef = useRef<HTMLAudioElement | null>(null);
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
  tracksRef.current = tracks;
  currentIdRef.current = currentId;

  const mood = MOODS.find((m) => m.mode === activeMode)!;
  const currentTrack = tracks.find((t) => t.id === currentId) ?? null;
  const plannedNextTrack = selectNextTrack(tracks, currentId, recentTrackIds, musicDirection);

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

  // Persist config
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.mood, activeMode); }, [activeMode]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.volume, String(volume)); if (audioRef.current) audioRef.current.volume = (volume / 100) * (voiceCaptureActive ? 0.25 : 1); }, [volume, voiceCaptureActive]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify([...favorites])); }, [favorites]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.playlists, JSON.stringify(playlists)); }, [playlists]);
  useEffect(() => { if (currentId) localStorage.setItem(STORAGE_KEYS.trackId, currentId); }, [currentId]);
  useEffect(() => {
    try {
      localStorage.setItem("hbg_vibra_music_direction", JSON.stringify(musicDirection));
      localStorage.setItem(STORAGE_KEYS.autoDj, String(autoDjEnabled));
      localStorage.setItem(STORAGE_KEYS.partyMode, String(partyMode));
      localStorage.setItem(STORAGE_KEYS.recentTrackIds, JSON.stringify(recentTrackIds));
    } catch {
      setError("No se pudieron guardar las preferencias de sesión musical.");
    }
  }, [autoDjEnabled, musicDirection, partyMode, recentTrackIds]);

  // Load audio from IndexedDB and play
  const loadTrack = useCallback(async (id: string, autoPlay = false, startTime = 0): Promise<boolean> => {
    const requestId = ++loadGenerationRef.current;
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

      // Revoke previous URL
      if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
      const url = URL.createObjectURL(blob);
      currentUrlRef.current = url;

      const audio = audioRef.current!;
      if (!audio) throw new Error("El reproductor de audio no está disponible");
      audio.src = url;
      audio.volume = (volume / 100) * (voiceCaptureActive ? 0.25 : 1);

      await new Promise<void>((resolve, reject) => {
        let settled = false;
        const cleanup = () => {
          if (settled) return;
          settled = true;
          clearTimeout(timeout);
          audio.removeEventListener("canplay", onReady);
          audio.removeEventListener("error", onErr);
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
        audio.addEventListener("canplay", onReady);
        audio.addEventListener("error", onErr);
        audio.load();
      });
      if (requestId !== loadGenerationRef.current) return false;

      setDuration(audio.duration || 0);
      if (startTime > 0 && isFinite(startTime)) audio.currentTime = startTime;

      if (autoPlay) {
        await audio.play();
        if (requestId !== loadGenerationRef.current) return false;
        setIsPlaying(true);
      }
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
  }, [volume, voiceCaptureActive]);
  loadTrackRef.current = loadTrack;

  // Setup audio element event listeners
  useEffect(() => {
    const audio = new Audio();
    audio.preload = "auto";
    audioRef.current = audio;

    const onTimeUpdate = () => {
      if (audio.duration && isFinite(audio.duration)) {
        setCurrentTime(audio.currentTime);
        setProgress(audio.currentTime / audio.duration);
      }
    };
    const onDurationChange = () => { if (isFinite(audio.duration)) setDuration(audio.duration); };
    const onEnded = () => {
      setIsPlaying(false);
      setProgress(0);
      setCurrentTime(0);
      autoAdvanceRef.current();
    };
    const onError = () => {
      setError("Error de reproducción — intenta reimportar el archivo");
      setIsPlaying(false);
    };
    const onPlay = () => setIsPlaying(true);
    const onPause = () => setIsPlaying(false);

    audio.addEventListener("timeupdate", onTimeUpdate);
    audio.addEventListener("durationchange", onDurationChange);
    audio.addEventListener("ended", onEnded);
    audio.addEventListener("error", onError);
    audio.addEventListener("play", onPlay);
    audio.addEventListener("pause", onPause);

    return () => {
      audio.pause();
      audio.removeEventListener("timeupdate", onTimeUpdate);
      audio.removeEventListener("durationchange", onDurationChange);
      audio.removeEventListener("ended", onEnded);
      audio.removeEventListener("error", onError);
      audio.removeEventListener("play", onPlay);
      audio.removeEventListener("pause", onPause);
      if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
      audioRef.current = null;
    };
  }, []);

  // Restore last track on mount (after tracks load)
  const restoredRef = useRef(false);
  useEffect(() => {
    if (restoredRef.current || tracks.length === 0) return;
    const savedId = localStorage.getItem(STORAGE_KEYS.trackId);
    if (savedId && tracks.find((t) => t.id === savedId)) {
      setCurrentId(savedId);
      loadTrack(savedId, false, 0);
      restoredRef.current = true;
    } else if (tracks.length > 0) {
      setCurrentId(tracks[0].id);
      loadTrack(tracks[0].id, false, 0);
      restoredRef.current = true;
    }
  }, [tracks, loadTrack]);

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
        setRecentTrackIds((prev) => [id, ...prev.filter((trackId) => trackId !== id)].slice(0, 20));
      }
      return;
    }
    if (audio.src && audio.src !== window.location.href) {
      if (isPlaying) { audio.pause(); }
      else { try { await audio.play(); } catch (e) { setError("No se pudo reproducir — intenta de nuevo"); } }
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
    const playing = await loadTrackRef.current(id, true);
    if (!playing) return false;
    setCurrentId(id);
    setRecentTrackIds((prev) => [id, ...prev.filter((trackId) => trackId !== id)].slice(0, 20));
    hbgCore.setContext("music.currentTrack", tracksRef.current.find((track) => track.id === id) ?? null);
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
    if (activeSequence) {
      const nextSequenceIndex = activeSequence.indexOf(currentTrackId ?? "") + 1;
      if (nextSequenceIndex < activeSequence.length) {
        autoAdvanceInProgressRef.current = true;
        void (async () => {
          let started = false;
          try {
            started = await playSequenceFrom(activeSequence, nextSequenceIndex, true);
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
      const currentIndex = availableTracks.findIndex((track) => track.id === currentTrackId);
      const next = availableTracks[currentIndex + 1];
      if (next) {
        autoAdvanceInProgressRef.current = true;
        void playTrack(next.id).finally(() => { autoAdvanceInProgressRef.current = false; });
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
          const next = selectNextTrack(candidates, currentTrackId, recentTrackIds, musicDirection);
          if (!next) {
            setError(
              musicDirection.goal
                ? `Auto DJ no encontró canciones de "${musicDirection.goal}" en los metadatos de la biblioteca.`
                : "Auto DJ no encontró otra canción disponible en la biblioteca."
            );
            return;
          }
          if (await loadTrackRef.current(next.id, true)) {
            if (selectionGeneration !== manualSelectionGenerationRef.current) return;
            setCurrentId(next.id);
            setRecentTrackIds((prev) => [
              ...(currentTrackId ? [currentTrackId] : []),
              ...prev.filter((id) => id !== currentTrackId),
            ].slice(0, 20));
            hbgCore.setContext("music.currentTrack", next);
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

  const nextTrack = async () => {
    const activeSequence = activeSequenceRef.current;
    if (activeSequence) {
      const currentIndex = activeSequence.indexOf(currentId ?? "");
      if (currentIndex >= 0 && currentIndex < activeSequence.length - 1) {
        return playSequenceFrom(activeSequence, currentIndex + 1);
      }
      return false;
    }
    const idx = tracks.findIndex((t) => t.id === currentId);
    if (idx >= 0 && idx < tracks.length - 1) return playTrack(tracks[idx + 1].id);
    return false;
  };

  const prevTrack = () => {
    const audio = audioRef.current;
    // If more than 3s in, restart; otherwise go prev
    if (audio && audio.currentTime > 3) { audio.currentTime = 0; return; }
    const activeSequence = activeSequenceRef.current;
    if (activeSequence) {
      const currentIndex = activeSequence.indexOf(currentId ?? "");
      if (currentIndex > 0) void playSequenceFrom(activeSequence, currentIndex - 1);
      return;
    }
    const idx = tracks.findIndex((t) => t.id === currentId);
    if (idx > 0) playTrack(tracks[idx - 1].id);
  };

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
        const before = isPlaying;
        await togglePlay();
        const playing = audioRef.current?.paused === false;
        return result(!before ? playing : !playing, { isPlaying: playing }, playing === !before ? undefined : "No se pudo cambiar la reproducción");
      }),
      hbgCore.registerAction("music.pause", () => {
        manualSelectionGenerationRef.current += 1;
        loadGenerationRef.current += 1;
        cancelPendingLoadRef.current?.();
        setLoading(false);
        audioRef.current?.pause();
        const paused = audioRef.current?.paused !== false;
        return result(paused, { isPlaying: !paused }, paused ? undefined : "No se pudo pausar");
      }),
      hbgCore.registerAction("music.next", async () => {
        const sequence = activeSequenceRef.current;
        const sequenceIndex = sequence?.indexOf(currentId ?? "") ?? -1;
        const idx = tracks.findIndex((t) => t.id === currentId);
        const next = sequence && sequenceIndex >= 0
          ? tracks.find((track) => track.id === sequence[sequenceIndex + 1])
          : tracks[idx + 1];
        if (!next) return result(false, undefined, "No hay una siguiente canción");
        const started = await nextTrack();
        return started
          ? result(true, { track: next })
          : result(false, undefined, "No se pudo iniciar la siguiente canción");
      }),
      hbgCore.registerAction("music.previous", async () => {
        const audio = audioRef.current;
        if (audio && audio.currentTime > 3) {
          audio.currentTime = 0;
          return result(true, { currentTime: 0 });
        }
        const sequence = activeSequenceRef.current;
        const sequenceIndex = sequence?.indexOf(currentId ?? "") ?? -1;
        const idx = tracks.findIndex((t) => t.id === currentId);
        const previous = sequence && sequenceIndex > 0
          ? tracks.find((track) => track.id === sequence[sequenceIndex - 1])
          : sequence ? undefined : tracks[idx - 1];
        if (!previous) return result(false, undefined, "No hay una canción anterior");
        const started = sequence ? await playSequenceFrom(sequence, sequenceIndex - 1) : await playTrack(previous.id);
        return started
          ? result(true, { track: previous })
          : result(false, undefined, "No se pudo iniciar la canción anterior");
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
        if (enabled && audioRef.current?.paused !== false && tracks.length > 0) {
          if (audioRef.current?.src) {
            await togglePlay();
            if (audioRef.current && !audioRef.current.paused) return result(true, { enabled, isPlaying: true });
          }
          const next = selectNextTrack(tracks, currentId, recentTrackIds, musicDirection);
          if (!next) return result(false, undefined, `No hay canciones disponibles para "${musicDirection.goal}".`);
          const playing = await playTrack(next.id);
          if (!playing) return result(false, undefined, "Auto DJ no pudo cargar la canción seleccionada.");
        }
        return result(true, { enabled });
      }),
      hbgCore.registerAction("music.party", (payload) => {
        if (typeof payload?.enabled !== "boolean") {
          return result(false, undefined, "Indica si Modo Fiesta PRO debe activarse o desactivarse.");
        }
        const enabled = payload.enabled;
        setPartyMode(enabled);
        if (enabled) {
          setAutoDjEnabled(true);
          setMusicDirection((current) => ({ ...current, energy: "up" }));
        }
        return result(true, { enabled, autoDj: enabled || autoDjEnabled });
      }),
      hbgCore.registerAction("music.voiceCapture", (payload) => {
        if (typeof payload?.active !== "boolean") {
          return result(false, undefined, "El estado de captura de voz no es válido.");
        }
        setVoiceCaptureActive(payload.active);
        if (audioRef.current) {
          audioRef.current.volume = (volume / 100) * (payload.active ? 0.25 : 1);
        }
        return result(true, { active: payload.active, duckingApplied: Boolean(audioRef.current) });
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
          const query = normalizeMusicText(String(payload?.query ?? ""));
          const matchedTrackIds = query
            ? tracks
                .filter((track) => normalizeMusicText(`${track.title} ${track.artist} ${track.album}`).includes(query))
                .map((track) => track.id)
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
  }, [autoDjEnabled, currentId, favorites, isPlaying, musicDirection, nextTrack, playSequenceFrom, playTrack, playTrackSequence, prevTrack, recentTrackIds, tracks, togglePlay, volume]);

  const seek = (e: React.ChangeEvent<HTMLInputElement>) => {
    const audio = audioRef.current;
    if (!audio || !duration) return;
    const t = Number(e.target.value) / 100 * duration;
    audio.currentTime = t;
    setCurrentTime(t);
    setProgress(t / duration);
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
        const blob = new Blob([await file.arrayBuffer()], { type: file.type || "audio/mpeg" });
        const dur = await getAudioDuration(blob);

        const meta: TrackMeta = {
          id, title, artist, album: "", duration: dur,
          size: file.size, type: file.type || "audio/mpeg",
          importedAt: Date.now(),
        };

        await saveAudioBlob(id, blob);
        await saveTrackMeta(meta);
        setTracks((prev) => [...prev, meta]);
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
    if (!newPlaylistName.trim()) return;
    const colors = ["var(--neon-pink)", "var(--neon-cyan)", "var(--neon-green)", "#ff9100", "var(--neon-purple)"];
    setPlaylists((prev) => [...prev, { id: Date.now().toString(), name: newPlaylistName.trim(), trackIds: [], color: colors[prev.length % colors.length] }]);
    setNewPlaylistName("");
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

  const progressPct = Math.round(progress * 100);
  const horasEscuchadas = Math.round(tracks.reduce((a, t) => a + t.duration, 0) / 60);

  const NAV_ITEMS: { id: ViewMode; label: string }[] = [
    { id: "player", label: "REPRODUCTOR" },
    { id: "library", label: "BIBLIOTECA" },
    { id: "playlists", label: "PLAYLISTS" },
    { id: "modes", label: "MODOS" },
    { id: "eq", label: "EQ PRO" },
    { id: "perfil", label: "PERFIL" },
    { id: "universo", label: "UNIVERSO HBG" },
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
      <div style={{ display: "flex", gap: 2, marginBottom: 20, background: "var(--bg-deep)", padding: 4, borderRadius: 4, border: "1px solid var(--border-dim)" }}>
        {NAV_ITEMS.map((n) => (
          <button key={n.id} onClick={() => setView(n.id)}
            style={{ flex: 1, padding: "7px 4px", fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.06em", background: view === n.id ? `${mood.color}18` : "transparent", border: `1px solid ${view === n.id ? mood.color : "transparent"}`, borderRadius: 3, color: view === n.id ? mood.color : "var(--text-muted)", cursor: "pointer", boxShadow: view === n.id ? `0 0 10px ${mood.color}25` : "none", transition: "all 0.15s" }}>
            {n.label}
          </button>
        ))}
      </div>

      <section className="hbg-card" aria-label="Dirección musical" style={{ marginBottom: 14 }}>
        <div className="section-title">// DJ VIBRA · DIRECCIÓN MUSICAL</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 8 }}>
          <input
            className="hbg-input"
            style={{ flex: 1 }}
            aria-label="Objetivo musical"
            placeholder="Ej.: música romántica, canciones para cantar..."
            value={directionInput}
            onChange={(event) => setDirectionInput(event.target.value)}
            onKeyDown={(event) => { if (event.key === "Enter") applyMusicDirection(); }}
          />
          <button className="hbg-btn hbg-btn-primary" onClick={applyMusicDirection}>APLICAR</button>
        </div>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
          <button
            className="hbg-btn hbg-btn-ghost"
            aria-pressed={autoDjEnabled}
            onClick={() => setAutoDjEnabled((enabled) => !enabled)}
          >
            AUTO DJ: {autoDjEnabled ? "ACTIVO" : "INACTIVO"}
          </button>
          <button
            className="hbg-btn hbg-btn-ghost"
            aria-pressed={partyMode}
            onClick={() => {
              const enabled = !partyMode;
              setPartyMode(enabled);
              if (enabled) {
                setAutoDjEnabled(true);
                setMusicDirection((current) => ({ ...current, energy: "up" }));
              }
            }}
          >
            FIESTA PRO: {partyMode ? "ACTIVA" : "INACTIVA"}
          </button>
          <span style={{ alignSelf: "center", fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-secondary)" }}>
            Objetivo: {musicDirection.goal || "sin fijar"} · Preferencia de energía: {musicDirection.energy === "up" ? "más alta" : "estable"}
            {plannedNextTrack ? ` · Siguiente candidata: ${plannedNextTrack.title}` : ""}
          </span>
        </div>
        <div style={{ marginTop: 7, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
          Selección local por coincidencia con título, artista o álbum. No se infieren géneros ni BPM; energía, Karaoke y adaptación ambiental no están implementados.
        </div>
      </section>

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
        <div>
          <div className="hbg-card hbg-card-accent" style={{ "--card-color": mood.color } as React.CSSProperties}>
            {/* Visualizer */}
            <div style={{ background: "var(--bg-deep)", borderRadius: 3, marginBottom: 14, overflow: "hidden" }}>
              <VisualizerBars active={isPlaying} color={mood.color} />
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
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", minWidth: 32 }}>
                {formatDuration(currentTime)}
              </span>
              <input
                type="range" min={0} max={100} value={progressPct}
                onChange={seek}
                style={{ flex: 1, accentColor: mood.color, cursor: "pointer", height: 4 }}
                disabled={!currentTrack || loading}
              />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", minWidth: 32 }}>
                {formatDuration(duration)}
              </span>
            </div>

            {/* Controls */}
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <button className="hbg-btn hbg-btn-ghost" style={{ padding: "7px 12px" }} onClick={prevTrack} disabled={!currentTrack || tracks.length < 2}>⏮</button>
              <button
                className="hbg-btn"
                style={{ padding: "9px 22px", background: `${mood.color}20`, borderColor: mood.color, color: mood.color, fontSize: 20, boxShadow: isPlaying ? `0 0 20px ${mood.color}40` : "none", opacity: loading ? 0.6 : 1 }}
                onClick={togglePlay}
                disabled={loading}
              >
                {loading ? "◎" : isPlaying ? "⏸" : "▶"}
              </button>
              <button className="hbg-btn hbg-btn-ghost" style={{ padding: "7px 12px" }} onClick={nextTrack} disabled={!currentTrack || tracks.length < 2}>⏭</button>
              <button className="hbg-btn hbg-btn-ghost" style={{ padding: "7px 12px" }} onClick={() => currentId && toggleFav(currentId)}>
                <span style={{ color: currentId && favorites.has(currentId) ? "#ffd740" : undefined }}>
                  {currentId && favorites.has(currentId) ? "★" : "☆"}
                </span>
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
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input className="hbg-input" style={{ flex: 1 }} placeholder="Nombre de la playlist..." value={newPlaylistName} onChange={(e) => setNewPlaylistName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPlaylist()} />
            <button className="hbg-btn hbg-btn-primary" onClick={addPlaylist} disabled={!newPlaylistName.trim()}>+ CREAR</button>
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
            <div className="section-title" style={{ marginBottom: 0 }}>// ecualizador visual — 10 bandas</div>
            <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 9 }} onClick={() => setEqValues(Object.fromEntries(EQ_BANDS.map((b) => [b, 50])))}>RESET</button>
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginBottom: 12 }}>
            ⓘ Ecualizador visual — en navegador web la reproducción no requiere EQ de software para funcionar correctamente.
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
