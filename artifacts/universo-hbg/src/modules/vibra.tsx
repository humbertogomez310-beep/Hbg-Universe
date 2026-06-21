import { useState, useEffect, useRef } from "react";

type MoodMode = "party" | "focus" | "creative" | "chill" | "nostalgia" | "sad" | "happy" | "normal";
type ViewMode = "player" | "library" | "eq" | "modes" | "universo";
type PlayerState = "stopped" | "playing" | "paused";

interface MoodProfile {
  mode: MoodMode;
  label: string;
  color: string;
  bpm: [number, number];
  genres: string[];
  description: string;
  icon: string;
}

interface Track {
  title: string;
  artist: string;
  duration: string;
  bpm: number;
  genre: string;
}

const MOODS: MoodProfile[] = [
  { mode: "party", label: "PARTY", color: "var(--neon-pink)", bpm: [120, 160], genres: ["Electrónica", "Trap"], description: "Máxima energía — mueve el ambiente", icon: "⚡" },
  { mode: "focus", label: "FOCUS", color: "var(--neon-cyan)", bpm: [60, 90], genres: ["Lofi", "Ambient"], description: "Concentración profunda — deep work", icon: "◎" },
  { mode: "creative", label: "CREATIVE", color: "#ff9100", bpm: [80, 110], genres: ["Indie", "Soul"], description: "Flow creativo — la chispa encendida", icon: "◈" },
  { mode: "chill", label: "CHILL", color: "var(--neon-green)", bpm: [50, 75], genres: ["Reggae", "Acoustic"], description: "Relajación activa — fluye sin parar", icon: "◉" },
  { mode: "nostalgia", label: "NOSTALGIA", color: "#b388ff", bpm: [70, 100], genres: ["Retro", "80s Pop"], description: "Memorias que inspiran — tiempo eterno", icon: "◇" },
  { mode: "sad", label: "SAD", color: "#42a5f5", bpm: [45, 70], genres: ["Acoustic", "Balada"], description: "Procesar emociones — lluvia interior", icon: "◑" },
  { mode: "happy", label: "HAPPY", color: "#ffd740", bpm: [100, 140], genres: ["Pop", "Funk"], description: "Vibración alta — luz y movimiento", icon: "◐" },
  { mode: "normal", label: "NORMAL", color: "var(--neon-purple)", bpm: [90, 120], genres: ["Variado"], description: "Modo equilibrado — todo funciona", icon: "◆" },
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
  { hz: "60", label: "60Hz", defaultVal: 50 },
  { hz: "170", label: "170Hz", defaultVal: 50 },
  { hz: "310", label: "310Hz", defaultVal: 55 },
  { hz: "600", label: "600Hz", defaultVal: 50 },
  { hz: "1k", label: "1kHz", defaultVal: 52 },
  { hz: "3k", label: "3kHz", defaultVal: 48 },
  { hz: "6k", label: "6kHz", defaultVal: 50 },
  { hz: "12k", label: "12kHz", defaultVal: 53 },
  { hz: "14k", label: "14kHz", defaultVal: 50 },
  { hz: "16k", label: "16kHz", defaultVal: 47 },
];

function VisualizerBars({ active, color }: { active: boolean; color: string }) {
  const [heights, setHeights] = useState<number[]>(new Array(28).fill(4));
  useEffect(() => {
    if (!active) { setHeights(new Array(28).fill(4)); return; }
    const id = setInterval(() => setHeights(() => Array.from({ length: 28 }, () => Math.random() * 52 + 4)), 80);
    return () => clearInterval(id);
  }, [active]);
  return (
    <div style={{ display: "flex", alignItems: "flex-end", gap: 2, height: 60, padding: "0 4px" }}>
      {heights.map((h, i) => (
        <div key={i} style={{ flex: 1, height: `${h}px`, background: color, borderRadius: "1px 1px 0 0", boxShadow: active ? `0 0 4px ${color}` : "none", transition: "height 0.08s ease", opacity: 0.65 + (i % 3) * 0.1 }} />
      ))}
    </div>
  );
}

export function VibraModule() {
  const [activeMode, setActiveMode] = useState<MoodMode>("focus");
  const [view, setView] = useState<ViewMode>("player");
  const [playerState, setPlayerState] = useState<PlayerState>("stopped");
  const [currentTrack, setCurrentTrack] = useState(0);
  const [volume, setVolume] = useState(80);
  const [progress, setProgress] = useState(0);
  const [eqValues, setEqValues] = useState<Record<string, number>>(() =>
    Object.fromEntries(EQ_BANDS.map((b) => [b.hz, b.defaultVal]))
  );
  const [favorites, setFavorites] = useState<Set<number>>(new Set([0, 2]));
  const [partyLights, setPartyLights] = useState(false);
  const [ambientMode, setAmbientMode] = useState<string | null>(null);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [partyColor, setPartyColor] = useState("#ff4081");

  const mood = MOODS.find((m) => m.mode === activeMode)!;
  const track = MOCK_TRACKS[currentTrack];
  const isPlaying = playerState === "playing";

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => setProgress((p) => { if (p >= 100) { setCurrentTrack((c) => (c + 1) % MOCK_TRACKS.length); return 0; } return p + 0.3; }), 200);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => { if (intervalRef.current) clearInterval(intervalRef.current); };
  }, [isPlaying, currentTrack]);

  useEffect(() => {
    if (!partyLights) return;
    const colors = ["#ff4081", "#7c4dff", "#00e5ff", "#69ff47", "#ffd740"];
    const id = setInterval(() => setPartyColor(colors[Math.floor(Math.random() * colors.length)]), 400);
    return () => clearInterval(id);
  }, [partyLights]);

  const togglePlay = () => setPlayerState((s) => s === "playing" ? "paused" : "playing");
  const stop = () => { setPlayerState("stopped"); setProgress(0); };
  const nextTrack = () => { setCurrentTrack((i) => (i + 1) % MOCK_TRACKS.length); setProgress(0); setPlayerState("playing"); };
  const prevTrack = () => { setCurrentTrack((i) => (i - 1 + MOCK_TRACKS.length) % MOCK_TRACKS.length); setProgress(0); };
  const toggleFav = (i: number) => setFavorites((prev) => { const n = new Set(prev); n.has(i) ? n.delete(i) : n.add(i); return n; });

  const AMBIENT_SOUNDS = [
    { id: "rain", label: "LLUVIA", icon: "🌧" },
    { id: "ocean", label: "MAR", icon: "🌊" },
    { id: "forest", label: "BOSQUE", icon: "🌲" },
    { id: "white", label: "RUIDO BLANCO", icon: "📡" },
  ];

  const NAV_ITEMS: { id: ViewMode; label: string; icon: string }[] = [
    { id: "player", label: "REPRODUCTOR", icon: "◉" },
    { id: "library", label: "BIBLIOTECA", icon: "▤" },
    { id: "modes", label: "MODOS", icon: "◈" },
    { id: "eq", label: "ECUALIZADOR", icon: "≋" },
    { id: "universo", label: "UNIVERSO HBG", icon: "⬡" },
  ];

  return (
    <div style={{ background: partyLights ? `${partyColor}08` : undefined, transition: "background 0.4s" }}>
      <div className="mod-header" style={{ "--mod-color": mood.color } as React.CSSProperties}>
        <span className="mod-icon" style={{ color: mood.color, filter: `drop-shadow(0 0 12px ${mood.color})` }}>◉</span>
        <div className="mod-title-group">
          <div className="mod-title">VIBRA PRO</div>
          <div className="mod-subtitle">// motor de audio 44100Hz · modo: {mood.label}</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button className="hbg-btn hbg-btn-ghost" style={{ padding: "6px 10px", fontSize: 9 }} onClick={() => setPartyLights(l => !l)}>
            {partyLights ? "💡 LIGHTS ON" : "💡 LIGHTS OFF"}
          </button>
          <span className="hbg-badge" style={{ background: `${mood.color}15`, borderColor: `${mood.color}50`, color: mood.color }}>
            {mood.icon} {mood.label}
          </span>
        </div>
      </div>

      {/* Sub-nav */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20, background: "var(--bg-deep)", padding: 4, borderRadius: 4, border: "1px solid var(--border-dim)" }}>
        {NAV_ITEMS.map((n) => (
          <button key={n.id} onClick={() => setView(n.id)}
            style={{
              flex: 1, padding: "7px 4px", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.08em",
              background: view === n.id ? `${mood.color}20` : "transparent",
              border: `1px solid ${view === n.id ? mood.color : "transparent"}`,
              borderRadius: 3, color: view === n.id ? mood.color : "var(--text-muted)", cursor: "pointer",
              boxShadow: view === n.id ? `0 0 10px ${mood.color}30` : "none", transition: "all 0.15s",
            }}>
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
              <div style={{ fontFamily: "var(--font-display)", fontSize: 17, fontWeight: 700, color: isPlaying ? mood.color : "var(--text-primary)", textShadow: isPlaying ? `0 0 16px ${mood.color}` : "none", marginBottom: 4, letterSpacing: "0.06em" }}>
                {track.title}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>{track.artist}</div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>{track.bpm} BPM · {track.duration} · {track.genre}</div>
            </div>
            <div className="hbg-progress" style={{ marginBottom: 14 }}>
              <div className="hbg-progress-bar" style={{ "--bar-color": mood.color, width: `${progress}%` } as React.CSSProperties} />
            </div>
            <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 10 }}>
              <button className="hbg-btn hbg-btn-ghost" style={{ padding: "7px 12px" }} onClick={prevTrack}>⏮</button>
              <button className="hbg-btn" style={{ padding: "9px 22px", background: `${mood.color}20`, borderColor: mood.color, color: mood.color, fontSize: 18, boxShadow: isPlaying ? `0 0 20px ${mood.color}40` : "none" }} onClick={togglePlay}>
                {isPlaying ? "⏸" : "▶"}
              </button>
              <button className="hbg-btn hbg-btn-ghost" style={{ padding: "7px 12px" }} onClick={stop}>⏹</button>
              <button className="hbg-btn hbg-btn-ghost" style={{ padding: "7px 12px" }} onClick={nextTrack}>⏭</button>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 12 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>🔉</span>
              <input type="range" min={0} max={100} value={volume} onChange={(e) => setVolume(Number(e.target.value))} style={{ flex: 1, accentColor: mood.color, cursor: "pointer" }} />
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: mood.color, minWidth: 32 }}>{volume}%</span>
            </div>
          </div>
          <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
            <button className="hbg-btn hbg-btn-ghost" style={{ flex: 1, justifyContent: "center" }}>↑ IMPORTAR AUDIO</button>
            <button className="hbg-btn hbg-btn-ghost" style={{ flex: 1, justifyContent: "center" }}>↗ TRANSMITIR VIBRACIÓN</button>
            <button className="hbg-btn hbg-btn-ghost" style={{ flex: 1, justifyContent: "center" }}>⬡ DJ ENGINE</button>
          </div>
        </div>
      )}

      {/* LIBRARY */}
      {view === "library" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input className="hbg-input" style={{ flex: 1 }} placeholder="// buscar en biblioteca..." />
            <button className="hbg-btn hbg-btn-primary">↑ IMPORTAR</button>
          </div>
          <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
            {["TODOS", "FAVORITOS", "RECIENTES"].map((f) => (
              <span key={f} className="hbg-badge hbg-badge-cyan" style={{ cursor: "pointer" }}>{f}</span>
            ))}
          </div>
          <div className="hbg-list">
            {MOCK_TRACKS.map((t, i) => (
              <div key={i} className="hbg-list-item" style={{ cursor: "pointer", borderColor: i === currentTrack ? mood.color : undefined, background: i === currentTrack ? `${mood.color}08` : undefined }} onClick={() => { setCurrentTrack(i); setProgress(0); setPlayerState("playing"); setView("player"); }}>
                <div style={{ color: i === currentTrack ? mood.color : "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 12, minWidth: 20 }}>{i + 1}</div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: i === currentTrack ? mood.color : "var(--text-primary)" }}>{t.title}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>{t.artist} · {t.genre} · {t.bpm} BPM</div>
                </div>
                <button onClick={(e) => { e.stopPropagation(); toggleFav(i); }} style={{ background: "none", border: "none", cursor: "pointer", fontSize: 14, color: favorites.has(i) ? "#ffd740" : "var(--text-muted)" }}>
                  {favorites.has(i) ? "★" : "☆"}
                </button>
                <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>{t.duration}</span>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* MODES */}
      {view === "modes" && (
        <div>
          <div className="section-title">// seleccionar modo de ánimo</div>
          <div className="hbg-grid" style={{ gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 24 }}>
            {MOODS.map((m) => (
              <button key={m.mode} className={`hbg-card ${activeMode === m.mode ? "hbg-card-accent" : ""}`}
                style={{ "--card-color": m.color, cursor: "pointer", textAlign: "left", border: activeMode === m.mode ? `1px solid ${m.color}` : undefined, boxShadow: activeMode === m.mode ? `0 0 16px ${m.color}25` : undefined, padding: "12px 14px" } as React.CSSProperties}
                onClick={() => setActiveMode(m.mode)}>
                <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
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
                  <button key={a.id} className="hbg-card"
                    style={{ cursor: "pointer", textAlign: "center", background: ambientMode === a.id ? "rgba(105,255,71,0.08)" : undefined, borderColor: ambientMode === a.id ? "var(--neon-green)" : undefined, padding: 12 }}
                    onClick={() => setAmbientMode(ambientMode === a.id ? null : a.id)}>
                    <div style={{ fontSize: 20, marginBottom: 4 }}>{a.icon}</div>
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

      {/* EQ */}
      {view === "eq" && (
        <div>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
            <div className="section-title" style={{ marginBottom: 0 }}>// ecualizador pro — 10 bandas</div>
            <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 9 }} onClick={() => setEqValues(Object.fromEntries(EQ_BANDS.map((b) => [b.hz, 50])))}>
              RESET
            </button>
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
                    <div style={{ flex: 1, width: "100%", display: "flex", alignItems: "center", justifyContent: "center", position: "relative" }}>
                      <input type="range" min={0} max={100} value={val} orient="vertical"
                        onChange={(e) => setEqValues((prev) => ({ ...prev, [band.hz]: Number(e.target.value) }))}
                        style={{ writingMode: "vertical-lr", direction: "rtl", width: "100%", height: "100%", accentColor: mood.color, cursor: "pointer" } as React.CSSProperties} />
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 8, color: "var(--text-muted)" }}>{band.label}</span>
                  </div>
                );
              })}
            </div>
            <div style={{ display: "flex", gap: 8, marginTop: 12, justifyContent: "center" }}>
              {["FLAT", "BASS BOOST", "VOCAL BOOST", "TREBLE BOOST"].map((preset) => (
                <button key={preset} className="hbg-badge hbg-badge-cyan" style={{ cursor: "pointer" }}
                  onClick={() => {
                    if (preset === "BASS BOOST") setEqValues({ "60": 80, "170": 70, "310": 60, "600": 50, "1k": 48, "3k": 46, "6k": 48, "12k": 50, "14k": 50, "16k": 50 });
                    else if (preset === "VOCAL BOOST") setEqValues({ "60": 42, "170": 45, "310": 48, "600": 60, "1k": 70, "3k": 72, "6k": 65, "12k": 55, "14k": 50, "16k": 48 });
                    else if (preset === "TREBLE BOOST") setEqValues({ "60": 45, "170": 47, "310": 49, "600": 50, "1k": 53, "3k": 60, "6k": 70, "12k": 78, "14k": 80, "16k": 75 });
                    else setEqValues(Object.fromEntries(EQ_BANDS.map((b) => [b.hz, 50])));
                  }}>
                  {preset}
                </button>
              ))}
            </div>
          </div>
        </div>
      )}

      {/* UNIVERSO HBG */}
      {view === "universo" && (
        <div>
          <div className="section-title">// universo hbg — aplicaciones del ecosistema</div>
          <div className="hbg-grid hbg-grid-2" style={{ gap: 12 }}>
            {[
              { id: "instinto" as ModuleId, label: "INSTINTO", icon: "⬡", color: "var(--neon-cyan)", desc: "Módulo de creatividad y notas" },
              { id: "terminador" as ModuleId, label: "TERMINADOR IA", icon: "⬢", color: "var(--neon-green)", desc: "Agente de automatización" },
              { id: "universo" as ModuleId, label: "HBG CORE", icon: "◈", color: "var(--neon-purple)", desc: "Cerebro del ecosistema" },
            ].map((app) => (
              <div key={app.id} className="hbg-card hbg-card-accent" style={{ "--card-color": app.color, cursor: "pointer" } as React.CSSProperties} onClick={() => hbgCore.setModule(app.id)}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 8 }}>
                  <span style={{ fontSize: 22, color: app.color, filter: `drop-shadow(0 0 8px ${app.color})` }}>{app.icon}</span>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 700, letterSpacing: "0.12em", color: app.color }}>{app.label}</span>
                </div>
                <div className="card-body">{app.desc}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--neon-green)", marginTop: 10 }}>🟢 ONLINE → ABRIR</div>
              </div>
            ))}
            <div className="hbg-card">
              <div className="section-title">// share engine</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button className="hbg-btn hbg-btn-primary w-full">↗ COMPARTIR APP</button>
                <button className="hbg-btn hbg-btn-ghost w-full">♫ TRANSMITIR VIBRACIÓN</button>
                <button className="hbg-btn hbg-btn-ghost w-full">↓ EXPORTAR PLAYLIST</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
