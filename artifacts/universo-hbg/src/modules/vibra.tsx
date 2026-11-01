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

  const audioRef = useRef<HTMLAudioElement | null>(null);
  const currentUrlRef = useRef<string | null>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);
  const progressRafRef = useRef<number | null>(null);

  const mood = MOODS.find((m) => m.mode === activeMode)!;
  const currentTrack = tracks.find((t) => t.id === currentId) ?? null;

  // Load all tracks from IndexedDB on mount
  useEffect(() => {
    getAllTrackMeta()
      .then((metas) => {
        const sorted = [...metas].sort((a, b) => a.importedAt - b.importedAt);
        setTracks(sorted);
      })
      .catch(() => setTracks([]));
  }, []);

  // Persist config
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.mood, activeMode); }, [activeMode]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.volume, String(volume)); if (audioRef.current) audioRef.current.volume = volume / 100; }, [volume]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify([...favorites])); }, [favorites]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.playlists, JSON.stringify(playlists)); }, [playlists]);
  useEffect(() => { if (currentId) localStorage.setItem(STORAGE_KEYS.trackId, currentId); }, [currentId]);

  // Load audio from IndexedDB and play
  const loadTrack = useCallback(async (id: string, autoPlay = false, startTime = 0) => {
    setError(null);
    setLoading(true);
    setProgress(0);
    setCurrentTime(0);
    setDuration(0);

    try {
      const blob = await getAudioBlob(id);
      if (!blob) throw new Error("Archivo no encontrado en la biblioteca");

      // Revoke previous URL
      if (currentUrlRef.current) URL.revokeObjectURL(currentUrlRef.current);
      const url = URL.createObjectURL(blob);
      currentUrlRef.current = url;

      const audio = audioRef.current!;
      audio.src = url;
      audio.volume = volume / 100;
      audio.load();

      await new Promise<void>((resolve, reject) => {
        const onReady = () => { cleanup(); resolve(); };
        const onErr = () => { cleanup(); reject(new Error("Error al cargar el audio")); };
        const cleanup = () => { audio.removeEventListener("canplay", onReady); audio.removeEventListener("error", onErr); };
        audio.addEventListener("canplay", onReady);
        audio.addEventListener("error", onErr);
      });

      setDuration(audio.duration || 0);
      if (startTime > 0 && isFinite(startTime)) audio.currentTime = startTime;

      if (autoPlay) {
        await audio.play();
        setIsPlaying(true);
      }
    } catch (e) {
      const msg = e instanceof Error ? e.message : "Error desconocido";
      setError(msg);
      setIsPlaying(false);
    } finally {
      setLoading(false);
    }
  }, [volume]);

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
      // Auto-advance
      setTracks((prev) => {
        setCurrentId((cid) => {
          const idx = prev.findIndex((t) => t.id === cid);
          if (idx >= 0 && idx < prev.length - 1) {
            const nextId = prev[idx + 1].id;
            setTimeout(() => loadTrack(nextId, true), 100);
            return nextId;
          }
          return cid;
        });
        return prev;
      });
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
  }, [loadTrack]);

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
    const audio = audioRef.current;
    if (!audio) return;
    if (!currentId && tracks.length > 0) {
      const id = tracks[0].id;
      setCurrentId(id);
      await loadTrack(id, true);
      return;
    }
    if (audio.src && audio.src !== window.location.href) {
      if (isPlaying) { audio.pause(); }
      else { try { await audio.play(); } catch (e) { setError("No se pudo reproducir — intenta de nuevo"); } }
    } else if (currentId) {
      await loadTrack(currentId, true);
    }
  };

  const playTrack = async (id: string) => {
    setCurrentId(id);
    await loadTrack(id, true);
  };

  const nextTrack = () => {
    const idx = tracks.findIndex((t) => t.id === currentId);
    if (idx >= 0 && idx < tracks.length - 1) playTrack(tracks[idx + 1].id);
  };

  const prevTrack = () => {
    const audio = audioRef.current;
    // If more than 3s in, restart; otherwise go prev
    if (audio && audio.currentTime > 3) { audio.currentTime = 0; return; }
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
    await playTrack(sequence[0].id);
    const playing = audioRef.current?.paused === false;
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
        audioRef.current?.pause();
        const paused = audioRef.current?.paused !== false;
        return result(paused, { isPlaying: !paused }, paused ? undefined : "No se pudo pausar");
      }),
      hbgCore.registerAction("music.next", async () => {
        const idx = tracks.findIndex((t) => t.id === currentId);
        if (idx < 0 || idx >= tracks.length - 1) return result(false, undefined, "No hay una siguiente canción");
        await playTrack(tracks[idx + 1].id);
        return result(audioRef.current?.paused === false, { track: tracks[idx + 1] }, "No se pudo iniciar la siguiente canción");
      }),
      hbgCore.registerAction("music.previous", async () => {
        const audio = audioRef.current;
        if (audio && audio.currentTime > 3) {
          audio.currentTime = 0;
          return result(true, { currentTime: 0 });
        }
        const idx = tracks.findIndex((t) => t.id === currentId);
        if (idx <= 0) return result(false, undefined, "No hay una canción anterior");
        await playTrack(tracks[idx - 1].id);
        return result(audioRef.current?.paused === false, { track: tracks[idx - 1] }, "No se pudo iniciar la canción anterior");
      }),
      hbgCore.registerAction("music.mood", (payload) => {
        const mood = MOODS.find(({ mode }) => mode === payload?.mode);
        if (!mood) return result(false, undefined, "El modo de ánimo no es válido");
        setActiveMode(mood.mode);
        return result(true, { mode: mood.mode });
      }),
      hbgCore.registerAction("music.search", (payload) => {
        const query = String(payload?.query ?? "").trim().toLowerCase();
        const matches = tracks.filter((t) => `${t.title} ${t.artist} ${t.album}`.toLowerCase().includes(query));
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
        await playTrack(track.id);
        const playing = audioRef.current?.paused === false;
        return result(playing, { track, isPlaying: playing }, playing ? undefined : "No se pudo iniciar la canción");
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
          const colors = ["var(--neon-pink)", "var(--neon-cyan)", "var(--neon-green)", "#ff9100", "var(--neon-purple)"];
          const playlist: Playlist = {
            id: `playlist_${Date.now()}_${Math.random().toString(36).slice(2, 7)}`,
            name: requestedName,
            trackIds: [],
            color: colors[playlists.length % colors.length],
          };
          setPlaylists((prev) => [...prev, playlist]);
          return result(true, { playlist });
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
  }, [currentId, favorites, isPlaying, playTrack, tracks, togglePlay, volume]);

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
  };

  const toggleFav = (id: string) => setFavorites((prev) => { const n = new Set(prev); n.has(id) ? n.delete(id) : n.add(id); return n; });

  const addPlaylist = () => {
    if (!newPlaylistName.trim()) return;
    const colors = ["var(--neon-pink)", "var(--neon-cyan)", "var(--neon-green)", "#ff9100", "var(--neon-purple)"];
    setPlaylists((prev) => [...prev, { id: Date.now().toString(), name: newPlaylistName.trim(), trackIds: [], color: colors[prev.length % colors.length] }]);
    setNewPlaylistName("");
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
                  <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                    <button
                      className="hbg-btn hbg-btn-ghost"
                      style={{ fontSize: 9, padding: "4px 8px" }}
                      onClick={() => {
                        void playTrackSequence(pl.trackIds);
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
