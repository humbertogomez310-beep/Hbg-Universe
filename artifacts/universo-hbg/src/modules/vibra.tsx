import { useState, useEffect, useRef } from "react";
import { hbgCore } from "../core/hbgCore";
import { UniversoScreen } from "../components/UniversoScreen";

type MoodMode = "party" | "focus" | "creative" | "chill" | "nostalgia" | "sad" | "happy" | "normal";
type ViewMode = "splash" | "player" | "library" | "playlists" | "modes" | "eq" | "perfil" | "universo";
type PlayerState = "stopped" | "playing" | "paused";

interface Track {
  title: string;
  artist: string;
  duration: string;
  bpm: number;
  genre: string;
}

interface Playlist {
  id: string;
  name: string;
  tracks: number[];
  color: string;
}

const STORAGE_KEYS = {
  volume: "hbg_vibra_volume",
  mood: "hbg_vibra_mood",
  track: "hbg_vibra_track",
  favorites: "hbg_vibra_favorites",
  playlists: "hbg_vibra_playlists",
};

const MOODS = [
  { mode: "party" as MoodMode, label: "PARTY", color: "var(--neon-pink)", bpm: [120, 160] as [number,number], icon: "⚡" },
  { mode: "focus" as MoodMode, label: "FOCUS", color: "var(--neon-cyan)", bpm: [60, 90] as [number,number], icon: "◎" },
  { mode: "creative" as MoodMode, label: "CREATIVE", color: "#ff9100", bpm: [80, 110] as [number,number], icon: "◈" },
  { mode: "chill" as MoodMode, label: "CHILL", color: "var(--neon-green)", bpm: [50, 75] as [number,number], icon: "◉" },
  { mode: "nostalgia" as MoodMode, label: "NOSTALGIA", color: "#b388ff", bpm: [70, 100] as [number,number], icon: "◇" },
  { mode: "sad" as MoodMode, label: "SAD", color: "#42a5f5", bpm: [45, 70] as [number,number], icon: "◑" },
  { mode: "happy" as MoodMode, label: "HAPPY", color: "#ffd740", bpm: [100, 140] as [number,number], icon: "◐" },
  { mode: "normal" as MoodMode, label: "NORMAL", color: "var(--neon-purple)", bpm: [90, 120] as [number,number], icon: "◆" },
];

const MOCK_TRACKS: Track[] = [
  { title: "Deep Neural Flow", artist: "HBG Audio Lab", duration: "4:32", bpm: 85, genre: "Lofi" },
  { title: "Neon Protocol", artist: "Cyber Collective", duration: "3:58", bpm: 128, genre: "Electrónica" },
  { title: "Instinto Prime", artist: "UNIVERSO HBG", duration: "5:11", bpm: 93, genre: "Indie" },
  { title: "Terminador Beat", artist: "AI Orchestra", duration: "3:22", bpm: 140, genre: "Trap" },
  { title: "Memoria Infinite", artist: "DJEngine X", duration: "6:04", bpm: 72, genre: "Ambient" },
  { title: "Sync Pulse", artist: "MoodEngine", duration: "4:17", bpm: 110, genre: "Funk" },
  { title: "Lobo en la Ciudad", artist: "UNIVERSO HBG", duration: "3:45", bpm: 96, genre: "Pop" },
  { title: "Nostalgia Core", artist: "HBG Retro", duration: "4:58", bpm: 78, genre: "Retro" },
];

const EQ_BANDS = [
  { hz: "60", label: "60Hz" }, { hz: "170", label: "170Hz" }, { hz: "310", label: "310Hz" },
  { hz: "600", label: "600Hz" }, { hz: "1k", label: "1kHz" }, { hz: "3k", label: "3kHz" },
  { hz: "6k", label: "6kHz" }, { hz: "12k", label: "12kHz" }, { hz: "14k", label: "14kHz" }, { hz: "16k", label: "16kHz" },
];

const AMBIENT_SOUNDS = [
  { id: "rain", label: "LLUVIA", icon: "🌧" }, { id: "ocean", label: "MAR", icon: "🌊" },
  { id: "forest", label: "BOSQUE", icon: "🌲" }, { id: "white", label: "RUIDO BLANCO", icon: "📡" },
];

function VisualizerBars({ active, color }: { active: boolean; color: string }) {
  const [heights, setHeights] = useState<number[]>(new Array(28).fill(4));
  useEffect(() => {
    if (!active) { setHeights(new Array(28).fill(4)); return; }
    const id = setInterval(() => setHeights(Array.from({ length: 28 }, () => Math.random() * 52 + 4)), 80);
    return () => clearInterval(id);
  }, [active]);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 60, padding: "0 4px" }}>
      {heights.map((h, i) => <div key={i} style={{ flex: 1, height: `${h}px`, background: color, borderRadius: "1px 1px 0 0", boxShadow: active ? `0 0 4px ${color}` : "none", transition: "height 0.08s ease", opacity: 0.7 }} />)}
    </div>
  );
}

export function VibraModule() {
  const [splashDone, setSplashDone] = useState(() => !!localStorage.getItem(STORAGE_KEYS.mood));
  const [view, setView] = useState<ViewMode>(splashDone ? "player" : "splash");
  const [activeMode, setActiveMode] = useState<MoodMode>(() => (localStorage.getItem(STORAGE_KEYS.mood) as MoodMode) || "focus");
  const [playerState, setPlayerState] = useState<PlayerState>("stopped");
  const [currentTrack, setCurrentTrack] = useState(() => Number(localStorage.getItem(STORAGE_KEYS.track) ?? 0));
  const [volume, setVolume] = useState(() => Number(localStorage.getItem(STORAGE_KEYS.volume) ?? 80));
  const [progress, setProgress] = useState(0);
  const [eqValues, setEqValues] = useState<Record<string, number>>(() => Object.fromEntries(EQ_BANDS.map((b) => [b.hz, 50])));
  const [favorites, setFavorites] = useState<Set<number>>(() => {
    try { return new Set(JSON.parse(localStorage.getItem(STORAGE_KEYS.favorites) ?? "[]")); } catch { return new Set([0, 2]); }
  });
  const [playlists, setPlaylists] = useState<Playlist[]>(() => {
    try { return JSON.parse(localStorage.getItem(STORAGE_KEYS.playlists) ?? "null") ?? [{ id: "1", name: "Mis favoritos", tracks: [0, 2], color: "var(--neon-pink)" }]; } catch { return []; }
  });
  const [partyLights, setPartyLights] = useState(false);
  const [ambientMode, setAmbientMode] = useState<string | null>(null);
  const [partyColor, setPartyColor] = useState("var(--neon-pink)");
  const [newPlaylistName, setNewPlaylistName] = useState("");
  const [searchQ, setSearchQ] = useState("");
  const [filterMode, setFilterMode] = useState<"todos" | "favoritos">("todos");
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const mood = MOODS.find((m) => m.mode === activeMode)!;
  const track = MOCK_TRACKS[currentTrack];
  const isPlaying = playerState === "playing";

  // Persist state
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.mood, activeMode); }, [activeMode]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.volume, String(volume)); }, [volume]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.track, String(currentTrack)); }, [currentTrack]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.favorites, JSON.stringify([...favorites])); }, [favorites]);
  useEffect(() => { localStorage.setItem(STORAGE_KEYS.playlists, JSON.stringify(playlists)); }, [playlists]);

  // Progress
  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => setProgress((p) => { if (p >= 100) { setCurrentTrack((c) => (c + 1) % MOCK_TRACKS.length); return 0; } return p + 0.3; }), 200);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying]);

  // Party lights
  useEffect(() => {
    if (!partyLights) return;
    const colors = ["var(--neon-pink)", "var(--neon-purple)", "var(--neon-cyan)", "var(--neon-green)", "var(--neon-yellow, #ffd740)"];
    const id = setInterval(() => setPartyColor(colors[Math.floor(Math.random() * colors.length)]), 400);
    return () => clearInterval(id);
  }, [partyLights]);

  // Splash timeout
  useEffect(() => {
    if (!splashDone) {
      const t = setTimeout(() => { setSplashDone(true); setView("player"); }, 2200);
      return () => clearTimeout(t);
    }
  }, [splashDone]);

  const togglePlay = () => setPlayerState((s) => s === "playing" ? "paused" : "playing");
  const stop = () => { setPlayerState("stopped"); setProgress(0); };
  const nextTrack = () => { setCurrentTrack((i) => (i + 1) % MOCK_TRACKS.length); setProgress(0); setPlayerState("playing"); };
  const prevTrack = () => { setCurrentTrack((i) => (i - 1 + MOCK_TRACKS.length) % MOCK_TRACKS.length); setProgress(0); };
  const toggleFav = (i: number) => setFavorites((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });

  const addPlaylist = () => {
    if (!newPlaylistName.trim()) return;
    const colors = ["var(--neon-pink)", "var(--neon-cyan)", "var(--neon-green)", "#ff9100", "var(--neon-purple)"];
    setPlaylists((prev) => [...prev, { id: Date.now().toString(), name: newPlaylistName, tracks: [], color: colors[prev.length % colors.length] }]);
    setNewPlaylistName("");
  };

  const filteredTracks = MOCK_TRACKS.filter((t, i) => {
    if (filterMode === "favoritos" && !favorites.has(i)) return false;
    if (searchQ && !t.title.toLowerCase().includes(searchQ.toLowerCase()) && !t.artist.toLowerCase().includes(searchQ.toLowerCase())) return false;
    return true;
  });

  const horasEscuchadas = 47;
  const topGenre = "Lofi";

  const NAV_ITEMS: { id: ViewMode; label: string }[] = [
    { id: "player", label: "REPRODUCTOR" },
    { id: "library", label: "BIBLIOTECA" },
    { id: "playlists", label: "PLAYLISTS" },
    { id: "modes", label: "MODOS" },
    { id: "eq", label: "EQ PRO" },
    { id: "perfil", label: "PERFIL" },
    { id: "universo", label: "UNIVERSO HBG" },
  ];

  if (view === "splash") {
    return (
      <div style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", height: 400, gap: 20 }}>
        <div style={{ fontSize: 60, filter: "drop-shadow(0 0 20px var(--neon-pink))", animation: "pulse-dot 1.5s infinite" }}>◉</div>
        <div style={{ fontFamily: "var(--font-display)", fontSize: 20, fontWeight: 900, color: "var(--neon-pink)", letterSpacing: "0.2em", textShadow: "0 0 20px var(--neon-pink)" }}>VIBRA PRO</div>
        <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>// motor de audio v1.0 — cargando...</div>
        <div style={{ width: 200, height: 3, background: "var(--bg-hover)", borderRadius: 2, overflow: "hidden" }}>
          <div style={{ height: "100%", background: "var(--neon-pink)", animation: "slide-in 2s ease forwards", width: "100%", transform: "translateX(-100%)" }} />
        </div>
      </div>
    );
  }

  return (
    <div style={{ background: partyLights ? `color-mix(in srgb, ${partyColor} 4%, transparent)` : undefined, transition: "background 0.4s" }}>
      <div className="mod-header" style={{ "--mod-color": mood.color } as React.CSSProperties}>
        <span className="mod-icon" style={{ color: mood.color, filter: `drop-shadow(0 0 12px ${mood.color})` }}>◉</span>
        <div className="mod-title-group">
          <div className="mod-title">VIBRA PRO</div>
          <div className="mod-subtitle">// motor de audio 44100Hz · {mood.label} · {mood.bpm[0]}–{mood.bpm[1]} BPM</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button className="hbg-btn hbg-btn-ghost" style={{ padding: "6px 10px", fontSize: 9 }} onClick={() => setPartyLights(l => !l)}>
            {partyLights ? "💡 LIGHTS ON" : "💡 LIGHTS"}
          </button>
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

      {/* PLAYER */}
      {view === "player" && (
        <div>
          <div className="hbg-card hbg-card-accent" style={{ "--card-color": mood.color } as React.CSSProperties}>
            <div style={{ background: "var(--bg-deep)", borderRadius: 3, marginBottom: 14, overflow: "hidden" }}>
              <VisualizerBars active={isPlaying} color={partyLights ? partyColor : mood.color} />
            </div>
            <div style={{ textAlign: "center", marginBottom: 14 }}>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 16, fontWeight: 700, color: isPlaying ? mood.color : "var(--text-primary)", textShadow: isPlaying ? `0 0 16px ${mood.color}` : "none", marginBottom: 4, letterSpacing: "0.06em" }}>{track.title}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>{track.artist}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>{track.bpm} BPM · {track.duration} · {track.genre}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                {Math.floor(progress / 100 * 272)}s
              </span>
              <div className="hbg-progress" style={{ flex: 1, marginTop: 0 }}>
                <div className="hbg-progress-bar" style={{ "--bar-color": mood.color, width: `${progress}%` } as React.CSSProperties} />
              </div>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>{track.duration}</span>
            </div>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10, marginBottom: 12 }}>
              <button className="hbg-btn hbg-btn-ghost" style={{ padding: "7px 12px" }} onClick={prevTrack}>⏮</button>
              <button className="hbg-btn" style={{ padding: "9px 22px", background: `${mood.color}20`, borderColor: mood.color, color: mood.color, fontSize: 18, boxShadow: isPlaying ? `0 0 20px ${mood.color}40` : "none" }} onClick={togglePlay}>
                {isPlaying ? "⏸" : "▶"}
              </button>
              <button className="hbg-btn hbg-btn-ghost" style={{ padding: "7px 12px" }} onClick={stop}>⏹</button>
              <button className="hbg-btn hbg-btn-ghost" style={{ padding: "7px 12px" }} onClick={nextTrack}>⏭</button>
              <button className="hbg-btn hbg-btn-ghost" style={{ padding: "7px 12px" }} onClick={() => toggleFav(currentTrack)}>
                <span style={{ color: favorites.has(currentTrack) ? "#ffd740" : undefined }}>{favorites.has(currentTrack) ? "★" : "☆"}</span>
              </button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>🔉</span>
              <input type="range" min={0} max={100} value={volume} onChange={(e) => setVolume(Number(e.target.value))} style={{ flex: 1, accentColor: mood.color, cursor: "pointer" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: mood.color, minWidth: 32 }}>{volume}%</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
            <button className="hbg-btn hbg-btn-ghost" style={{ flex: 1, justifyContent: "center", fontSize: 9 }} onClick={() => hbgCore.setModule("universo")}>⬡ DJ ENGINE</button>
            <button className="hbg-btn hbg-btn-ghost" style={{ flex: 1, justifyContent: "center", fontSize: 9 }}>↗ TRANSMITIR</button>
            <button className="hbg-btn hbg-btn-ghost" style={{ flex: 1, justifyContent: "center", fontSize: 9 }}>↑ IMPORTAR</button>
          </div>
        </div>
      )}

      {/* LIBRARY */}
      {view === "library" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
            <input className="hbg-input" style={{ flex: 1 }} placeholder="// buscar en biblioteca..." value={searchQ} onChange={(e) => setSearchQ(e.target.value)} />
            <button className="hbg-btn hbg-btn-primary" style={{ fontSize: 9 }}>↑ IMPORTAR</button>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
            {(["todos", "favoritos"] as const).map((f) => (
              <button key={f} onClick={() => setFilterMode(f)}
                className="hbg-badge"
                style={{ cursor: "pointer", background: filterMode === f ? `${mood.color}18` : undefined, borderColor: filterMode === f ? mood.color : "var(--border-dim)", color: filterMode === f ? mood.color : "var(--text-muted)" }}>
                {f.toUpperCase()}
              </button>
            ))}
            <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginLeft: "auto", alignSelf: "center" }}>{filteredTracks.length} pistas</span>
          </div>
          <div className="hbg-list">
            {filteredTracks.map((t, rawIdx) => {
              const i = MOCK_TRACKS.indexOf(t);
              return (
                <div key={i} className="hbg-list-item" style={{ cursor: "pointer", borderColor: i === currentTrack ? mood.color : undefined, background: i === currentTrack ? `${mood.color}08` : undefined }} onClick={() => { setCurrentTrack(i); setProgress(0); setPlayerState("playing"); setView("player"); }}>
                  <div style={{ color: i === currentTrack ? mood.color : "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 11, minWidth: 20 }}>{rawIdx + 1}</div>
                  <div style={{ flex: 1 }}>
                    <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: i === currentTrack ? mood.color : "var(--text-primary)" }}>{t.title}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{t.artist} · {t.genre} · {t.bpm} BPM</div>
                  </div>
                  <button onClick={(e) => { e.stopPropagation(); toggleFav(i); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: favorites.has(i) ? "#ffd740" : "var(--text-muted)" }}>
                    {favorites.has(i) ? "★" : "☆"}
                  </button>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>{t.duration}</span>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* PLAYLISTS */}
      {view === "playlists" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input className="hbg-input" style={{ flex: 1 }} placeholder="Nombre de la playlist..." value={newPlaylistName} onChange={(e) => setNewPlaylistName(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addPlaylist()} />
            <button className="hbg-btn hbg-btn-primary" onClick={addPlaylist}>+ NUEVA</button>
          </div>
          <div className="hbg-grid hbg-grid-2" style={{ gap: 10 }}>
            {playlists.map((pl) => (
              <div key={pl.id} className="hbg-card hbg-card-accent" style={{ "--card-color": pl.color, cursor: "pointer" } as React.CSSProperties}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 700, color: pl.color, marginBottom: 6, letterSpacing: "0.08em" }}>{pl.name}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>{pl.tracks.length} pistas</div>
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 9, padding: "4px 8px" }}>▶ PLAY</button>
                  <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 9, padding: "4px 8px" }}>↓ EXPORTAR</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODES */}
      {view === "modes" && (
        <div>
          <div className="section-title">// seleccionar modo de ánimo</div>
          <div className="hbg-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 20 }}>
            {MOODS.map((m) => (
              <button key={m.mode} className="hbg-card"
                style={{ "--card-color": m.color, cursor: "pointer", textAlign: "left", padding: "12px 14px", border: `1px solid ${activeMode === m.mode ? m.color : "var(--border-dim)"}`, background: activeMode === m.mode ? `${m.color}10` : "var(--bg-card)", boxShadow: activeMode === m.mode ? `0 0 16px ${m.color}25` : "none" } as React.CSSProperties}
                onClick={() => setActiveMode(m.mode)}>
                <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 4 }}>
                  <span style={{ fontSize: 16, color: m.color, filter: activeMode === m.mode ? `drop-shadow(0 0 6px ${m.color})` : "none" }}>{m.icon}</span>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 9, fontWeight: 700, letterSpacing: "0.1em", color: activeMode === m.mode ? m.color : "var(--text-primary)" }}>{m.label}</span>
                </div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{m.bpm[0]}–{m.bpm[1]} BPM</div>
              </button>
            ))}
          </div>

          <div className="hbg-grid hbg-grid-2" style={{ gap: 12 }}>
            <div className="hbg-card">
              <div className="section-title">// modo descanso</div>
              <div className="hbg-grid hbg-grid-2" style={{ gap: 8 }}>
                {AMBIENT_SOUNDS.map((a) => (
                  <button key={a.id} className="hbg-card" style={{ cursor: "pointer", textAlign: "center", background: ambientMode === a.id ? "rgba(105,255,71,0.08)" : undefined, borderColor: ambientMode === a.id ? "var(--neon-green)" : undefined, padding: 12 }} onClick={() => setAmbientMode(ambientMode === a.id ? null : a.id)}>
                    <div style={{ fontSize: 22, marginBottom: 4 }}>{a.icon}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: ambientMode === a.id ? "var(--neon-green)" : "var(--text-muted)" }}>{a.label}</div>
                  </button>
                ))}
              </div>
            </div>
            <div className="hbg-card">
              <div className="section-title">// modo enfoque</div>
              <div className="hbg-list" style={{ gap: 8 }}>
                {[{ label: "RUIDO BLANCO", icon: "📡" }, { label: "INSTRUMENTAL", icon: "🎵" }, { label: "BINAURAL 40Hz", icon: "◎" }].map((f) => (
                  <button key={f.label} className="hbg-list-item" style={{ cursor: "pointer", background: "none", border: "1px solid var(--border-dim)", borderRadius: 3, width: "100%", justifyContent: "flex-start" }}>
                    <span>{f.icon}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>{f.label}</span>
                  </button>
                ))}
              </div>
            </div>
          </div>
        </div>
      )}

      {/* EQ PRO */}
      {view === "eq" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>// ecualizador pro — 10 bandas</div>
            <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 9 }} onClick={() => setEqValues(Object.fromEntries(EQ_BANDS.map((b) => [b.hz, 50])))}>RESET</button>
          </div>
          <div className="hbg-card" style={{ background: "var(--bg-deep)" }}>
            <div style={{ display: "flex", gap: 12, alignItems: "flex-end", height: 180, padding: "16px 8px 8px" }}>
              {EQ_BANDS.map((band) => {
                const val = eqValues[band.hz];
                const dbVal = ((val - 50) / 50 * 12).toFixed(1);
                return (
                  <div key={band.hz} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 6 }}>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: val !== 50 ? mood.color : "var(--text-muted)", transition: "color 0.2s" }}>
                      {Number(dbVal) > 0 ? "+" : ""}{dbVal}
                    </span>
                    <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "center", justifyContent: "center" }}>
                      <input type="range" min={0} max={100} value={val}
                        onChange={(e) => setEqValues((prev) => ({ ...prev, [band.hz]: Number(e.target.value) }))}
                        style={{ writingMode: "vertical-lr", direction: "rtl", width: "100%", height: "100%", accentColor: mood.color, cursor: "pointer" } as React.CSSProperties} />
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>{band.label}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 6, marginTop: 12, justifyContent: "center", flexWrap: "wrap" }}>
              {[{ name: "FLAT", vals: null }, { name: "BASS BOOST", vals: { "60": 80, "170": 70, "310": 60, "600": 50, "1k": 48, "3k": 46, "6k": 48, "12k": 50, "14k": 50, "16k": 50 } }, { name: "VOCAL", vals: { "60": 42, "170": 45, "310": 48, "600": 60, "1k": 70, "3k": 72, "6k": 65, "12k": 55, "14k": 50, "16k": 48 } }, { name: "TREBLE", vals: { "60": 45, "170": 47, "310": 49, "600": 50, "1k": 53, "3k": 60, "6k": 70, "12k": 78, "14k": 80, "16k": 75 } }].map((preset) => (
                <button key={preset.name} className="hbg-badge hbg-badge-cyan" style={{ cursor: "pointer" }} onClick={() => setEqValues(preset.vals ?? Object.fromEntries(EQ_BANDS.map((b) => [b.hz, 50])))}>
                  {preset.name}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* PERFIL */}
      {view === "perfil" && (
        <div>
          <div className="hbg-grid hbg-grid-3" style={{ gap: 10, marginBottom: 16 }}>
            {[
              { label: "HORAS ESCUCHADAS", value: `${horasEscuchadas}h`, color: "var(--neon-pink)" },
              { label: "CANCIONES FAVORITAS", value: `${favorites.size}`, color: "#ffd740" },
              { label: "PLAYLISTS", value: `${playlists.length}`, color: "var(--neon-cyan)" },
            ].map((stat) => (
              <div key={stat.label} className="hbg-card hbg-card-accent" style={{ "--card-color": stat.color } as React.CSSProperties}>
                <div className="card-label">{stat.label}</div>
                <div className="card-value" style={{ color: stat.color, textShadow: `0 0 12px ${stat.color}`, fontSize: 22 }}>{stat.value}</div>
              </div>
            ))}
          </div>
          <div className="hbg-grid hbg-grid-2" style={{ gap: 10 }}>
            <div className="hbg-card">
              <div className="section-title">// géneros favoritos</div>
              {["Lofi", "Indie", "Ambient", "Electrónica", "Trap"].map((g, i) => (
                <div key={g} style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)", minWidth: 16 }}>{i + 1}.</span>
                  <div className="hbg-progress" style={{ flex: 1, marginTop: 0 }}>
                    <div className="hbg-progress-bar" style={{ "--bar-color": mood.color, width: `${90 - i * 14}%` } as React.CSSProperties} />
                  </div>
                  <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)", minWidth: 80 }}>{g}</span>
                </div>
              ))}
            </div>
            <div className="hbg-card">
              <div className="section-title">// modo más usado</div>
              <div style={{ fontFamily: "var(--font-display)", fontSize: 22, fontWeight: 700, color: mood.color, textShadow: `0 0 14px ${mood.color}`, marginBottom: 8 }}>{mood.label}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>Género top: {topGenre}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>BPM promedio: {Math.round((mood.bpm[0] + mood.bpm[1]) / 2)}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 4 }}>Sesión actual: activa</div>
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
