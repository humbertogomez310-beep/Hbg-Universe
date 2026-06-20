import { useState, useEffect, useRef } from "react";

type MoodMode = "party" | "focus" | "creative" | "chill" | "normal";
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

const MOODS: MoodProfile[] = [
  {
    mode: "party",
    label: "PARTY",
    color: "var(--neon-pink)",
    bpm: [120, 160],
    genres: ["Electrónica", "Reggaeton", "Trap"],
    description: "Máxima energía — mueve el ambiente",
    icon: "⚡",
  },
  {
    mode: "focus",
    label: "FOCUS",
    color: "var(--neon-cyan)",
    bpm: [60, 90],
    genres: ["Lofi", "Ambient", "Jazz Instrumental"],
    description: "Concentración profunda — deep work",
    icon: "◎",
  },
  {
    mode: "creative",
    label: "CREATIVE",
    color: "var(--neon-orange, #ff9100)",
    bpm: [80, 110],
    genres: ["Indie", "Soul", "Alternativo"],
    description: "Flow creativo — la chispa encendida",
    icon: "◈",
  },
  {
    mode: "chill",
    label: "CHILL",
    color: "var(--neon-green)",
    bpm: [50, 75],
    genres: ["Reggae", "Acoustic", "Bossa Nova"],
    description: "Relajación activa — fluye sin parar",
    icon: "◉",
  },
  {
    mode: "normal",
    label: "NORMAL",
    color: "var(--neon-purple)",
    bpm: [90, 120],
    genres: ["Pop", "Variado"],
    description: "Modo equilibrado — todo funciona",
    icon: "◇",
  },
];

const MOCK_TRACKS = [
  { title: "Deep Neural Flow", artist: "HBG Audio Lab", duration: "4:32", bpm: 85 },
  { title: "Neon Protocol", artist: "Cyber Collective", duration: "3:58", bpm: 128 },
  { title: "Instinto Prime", artist: "UNIVERSO HBG", duration: "5:11", bpm: 93 },
  { title: "Terminador Beat", artist: "AI Orchestra", duration: "3:22", bpm: 140 },
  { title: "Memoria Infinite", artist: "DJEngine X", duration: "6:04", bpm: 72 },
  { title: "Sync Pulse", artist: "MoodEngine", duration: "4:17", bpm: 110 },
];

function VisualizerBars({ active, color }: { active: boolean; color: string }) {
  const [heights, setHeights] = useState<number[]>(new Array(32).fill(4));

  useEffect(() => {
    if (!active) {
      setHeights(new Array(32).fill(4));
      return;
    }
    const id = setInterval(() => {
      setHeights((prev) =>
        prev.map(() => (active ? Math.random() * 56 + 4 : 4))
      );
    }, 80);
    return () => clearInterval(id);
  }, [active]);

  return (
    <div
      style={{
        display: "flex",
        alignItems: "flex-end",
        gap: 2,
        height: 64,
        padding: "0 4px",
      }}
    >
      {heights.map((h, i) => (
        <div
          key={i}
          style={{
            flex: 1,
            height: `${h}px`,
            background: color,
            borderRadius: "1px 1px 0 0",
            boxShadow: active ? `0 0 4px ${color}` : "none",
            transition: "height 0.08s ease",
            opacity: 0.7 + (i % 4) * 0.075,
          }}
        />
      ))}
    </div>
  );
}

export function VibraModule() {
  const [activeMode, setActiveMode] = useState<MoodMode>("focus");
  const [playerState, setPlayerState] = useState<PlayerState>("stopped");
  const [currentTrack, setCurrentTrack] = useState(0);
  const [volume, setVolume] = useState(80);
  const [progress, setProgress] = useState(0);
  const intervalRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const mood = MOODS.find((m) => m.mode === activeMode)!;
  const track = MOCK_TRACKS[currentTrack];
  const isPlaying = playerState === "playing";

  useEffect(() => {
    if (isPlaying) {
      intervalRef.current = setInterval(() => {
        setProgress((p) => {
          if (p >= 100) {
            nextTrack();
            return 0;
          }
          return p + 0.3;
        });
      }, 200);
    } else {
      if (intervalRef.current) clearInterval(intervalRef.current);
    }
    return () => {
      if (intervalRef.current) clearInterval(intervalRef.current);
    };
  }, [isPlaying, currentTrack]);

  const togglePlay = () => {
    setPlayerState((s) => (s === "playing" ? "paused" : "playing"));
  };

  const stop = () => {
    setPlayerState("stopped");
    setProgress(0);
  };

  const nextTrack = () => {
    setCurrentTrack((i) => (i + 1) % MOCK_TRACKS.length);
    setProgress(0);
    if (playerState !== "playing") setPlayerState("playing");
  };

  const prevTrack = () => {
    setCurrentTrack((i) => (i - 1 + MOCK_TRACKS.length) % MOCK_TRACKS.length);
    setProgress(0);
  };

  const selectTrack = (i: number) => {
    setCurrentTrack(i);
    setProgress(0);
    setPlayerState("playing");
  };

  return (
    <div>
      <div className="mod-header" style={{ "--mod-color": mood.color } as React.CSSProperties}>
        <span className="mod-icon" style={{ color: mood.color, filter: `drop-shadow(0 0 12px ${mood.color})` }}>
          ◉
        </span>
        <div className="mod-title-group">
          <div className="mod-title" style={{ color: "var(--text-primary)" }}>VIBRA PRO</div>
          <div className="mod-subtitle">// motor de audio 44100Hz — modo: {mood.label}</div>
        </div>
        <div className="hbg-badge" style={{ marginLeft: "auto", background: `${mood.color}15`, borderColor: `${mood.color}50`, color: mood.color }}>
          {mood.icon} {mood.label}
        </div>
      </div>

      {/* Mood Selector */}
      <div className="section-title">// seleccionar modo</div>
      <div className="hbg-grid hbg-grid-3" style={{ gap: 8, marginBottom: 20 }}>
        {MOODS.map((m) => (
          <button
            key={m.mode}
            className={`hbg-card ${activeMode === m.mode ? "hbg-card-accent" : ""}`}
            style={{
              "--card-color": m.color,
              cursor: "pointer",
              textAlign: "left",
              border: activeMode === m.mode ? `1px solid ${m.color}` : undefined,
              boxShadow: activeMode === m.mode ? `0 0 20px ${m.color}25` : undefined,
              padding: "12px 14px",
            } as React.CSSProperties}
            onClick={() => setActiveMode(m.mode)}
          >
            <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 4 }}>
              <span style={{ fontSize: 16, color: m.color, filter: activeMode === m.mode ? `drop-shadow(0 0 6px ${m.color})` : "none" }}>
                {m.icon}
              </span>
              <span
                style={{
                  fontFamily: "var(--font-display)",
                  fontSize: 10,
                  fontWeight: 700,
                  letterSpacing: "0.12em",
                  color: activeMode === m.mode ? m.color : "var(--text-primary)",
                }}
              >
                {m.label}
              </span>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
              {m.bpm[0]}–{m.bpm[1]} BPM
            </div>
          </button>
        ))}
      </div>

      {/* Player */}
      <div className="hbg-card hbg-card-accent" style={{ "--card-color": mood.color, marginBottom: 20 } as React.CSSProperties}>
        {/* Visualizer */}
        <div style={{ background: "var(--bg-deep)", borderRadius: 3, marginBottom: 16, overflow: "hidden" }}>
          <VisualizerBars active={isPlaying} color={mood.color} />
        </div>

        {/* Track info */}
        <div style={{ textAlign: "center", marginBottom: 16 }}>
          <div
            style={{
              fontFamily: "var(--font-display)",
              fontSize: 16,
              fontWeight: 700,
              color: isPlaying ? mood.color : "var(--text-primary)",
              textShadow: isPlaying ? `0 0 16px ${mood.color}` : "none",
              marginBottom: 4,
              letterSpacing: "0.06em",
            }}
          >
            {track.title}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-secondary)" }}>
            {track.artist}
          </div>
          <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 3 }}>
            {track.bpm} BPM · {track.duration}
          </div>
        </div>

        {/* Progress */}
        <div className="hbg-progress" style={{ marginBottom: 16 }}>
          <div
            className="hbg-progress-bar"
            style={{ "--bar-color": mood.color, width: `${progress}%` } as React.CSSProperties}
          />
        </div>

        {/* Controls */}
        <div style={{ display: "flex", justifyContent: "center", alignItems: "center", gap: 12 }}>
          <button className="hbg-btn hbg-btn-ghost" style={{ padding: "8px 14px" }} onClick={prevTrack}>
            ⏮
          </button>
          <button
            className="hbg-btn"
            style={{
              padding: "10px 24px",
              background: `${mood.color}20`,
              borderColor: mood.color,
              color: mood.color,
              fontSize: 18,
              boxShadow: isPlaying ? `0 0 20px ${mood.color}40` : "none",
            }}
            onClick={togglePlay}
          >
            {isPlaying ? "⏸" : "▶"}
          </button>
          <button className="hbg-btn hbg-btn-ghost" style={{ padding: "8px 14px" }} onClick={stop}>
            ⏹
          </button>
          <button className="hbg-btn hbg-btn-ghost" style={{ padding: "8px 14px" }} onClick={nextTrack}>
            ⏭
          </button>
        </div>

        {/* Volume */}
        <div style={{ display: "flex", alignItems: "center", gap: 10, marginTop: 14 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>🔉</span>
          <input
            type="range"
            min={0}
            max={100}
            value={volume}
            onChange={(e) => setVolume(Number(e.target.value))}
            style={{
              flex: 1,
              accentColor: mood.color,
              cursor: "pointer",
            }}
          />
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: mood.color, minWidth: 32 }}>
            {volume}%
          </span>
        </div>
      </div>

      {/* Playlist */}
      <div className="section-title">// playlist — {MOCK_TRACKS.length} pistas</div>
      <div className="hbg-list">
        {MOCK_TRACKS.map((t, i) => (
          <div
            key={i}
            className="hbg-list-item"
            style={{
              cursor: "pointer",
              borderColor: i === currentTrack ? mood.color : undefined,
              background: i === currentTrack ? `${mood.color}08` : undefined,
            }}
            onClick={() => selectTrack(i)}
          >
            <div
              className="hbg-list-dot"
              style={{
                color: i === currentTrack ? mood.color : "var(--text-muted)",
                boxShadow: i === currentTrack ? `0 0 8px ${mood.color}` : "none",
                background: i === currentTrack ? mood.color : "var(--text-muted)",
              }}
            />
            <div style={{ flex: 1 }}>
              <div style={{
                fontFamily: "var(--font-ui)",
                fontSize: 13,
                color: i === currentTrack ? mood.color : "var(--text-primary)",
              }}>
                {t.title}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", marginTop: 2 }}>
                {t.artist} · {t.bpm} BPM
              </div>
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
              {t.duration}
            </div>
            {i === currentTrack && isPlaying && (
              <span style={{ color: mood.color, fontSize: 12 }}>▶</span>
            )}
          </div>
        ))}
      </div>

      {/* Mood info */}
      <div className="hbg-card mt-6" style={{ "--card-color": mood.color } as React.CSSProperties}>
        <div className="section-title">// perfil de modo — {mood.label}</div>
        <div className="card-body">{mood.description}</div>
        <div style={{ display: "flex", gap: 8, marginTop: 12, flexWrap: "wrap" }}>
          {mood.genres.map((g) => (
            <span
              key={g}
              className="hbg-badge"
              style={{ background: `${mood.color}12`, borderColor: `${mood.color}40`, color: mood.color }}
            >
              {g}
            </span>
          ))}
        </div>
      </div>
    </div>
  );
}
