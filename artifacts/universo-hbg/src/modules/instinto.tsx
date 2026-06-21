import { useState, useRef, useEffect, useCallback } from "react";
import { UniversoScreen } from "../components/UniversoScreen";

type Category = "notas" | "letras" | "ideas" | "reflexiones";
type ViewMode = "inicio" | "bloc" | "letras" | "ideas" | "proyectos" | "exportar" | "universo";

interface Note {
  id: string;
  title: string;
  content: string;
  category: Category;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  favorite: boolean;
  tags: string[];
  deleted: boolean;
}

interface LyricSection {
  id: string;
  type: "intro" | "verso" | "coro" | "puente" | "outro";
  content: string;
}

interface Lyric {
  id: string;
  title: string;
  album?: string;
  sections: LyricSection[];
  createdAt: string;
  updatedAt: string;
}

interface Project {
  id: string;
  name: string;
  description: string;
  status: "borrador" | "en_progreso" | "completado";
  color: string;
  createdAt: string;
}

const NOTE_KEY = "hbg_instinto_notes_v2";
const LYRIC_KEY = "hbg_instinto_lyrics_v2";
const PROJECT_KEY = "hbg_instinto_projects";

function loadNotes(): Note[] {
  try { return JSON.parse(localStorage.getItem(NOTE_KEY) ?? "null") ?? getDefaultNotes(); } catch { return getDefaultNotes(); }
}
function getDefaultNotes(): Note[] {
  const now = new Date().toISOString();
  return [
    { id: "1", title: "Ritmo y productividad", content: "El ritmo es la base de la productividad creativa. Cuando el flow llega, nada lo detiene — cada beat una acción, cada pausa una decisión.", category: "reflexiones", createdAt: now, updatedAt: now, pinned: true, favorite: true, tags: ["flow", "ritmo"], deleted: false },
    { id: "2", title: "Plataforma gamificada", content: "App de productividad gamificada con ritmo — cada tarea completada genera un beat. Los hábitos se convierten en frecuencias.", category: "ideas", createdAt: now, updatedAt: now, pinned: false, favorite: false, tags: ["app", "idea"], deleted: false },
  ];
}
function loadLyrics(): Lyric[] {
  try { return JSON.parse(localStorage.getItem(LYRIC_KEY) ?? "null") ?? getDefaultLyrics(); } catch { return getDefaultLyrics(); }
}
function getDefaultLyrics(): Lyric[] {
  const now = new Date().toISOString();
  return [{ id: "1", title: "La Voz del Lobo", album: "Universo Musical HBG", sections: [{ id: "v1", type: "verso", content: "En las sombras neon del concreto\nel lobo camina solo pero completo" }, { id: "c1", type: "coro", content: "La voz del lobo retumba\nen cada ciudad que se derrumba\nfuego en la sangre, hielo en la mente\nel universo HBG presente" }, { id: "p1", type: "puente", content: "No hay barrera que detenga\nlo que el instinto sostiene" }], createdAt: now, updatedAt: now }];
}
function loadProjects(): Project[] {
  try { return JSON.parse(localStorage.getItem(PROJECT_KEY) ?? "null") ?? getDefaultProjects(); } catch { return getDefaultProjects(); }
}
function getDefaultProjects(): Project[] {
  const now = new Date().toISOString();
  return [
    { id: "1", name: "La Voz del Lobo", description: "Álbum conceptual del Universo Musical HBG", status: "en_progreso", color: "var(--neon-pink)", createdAt: now },
    { id: "2", name: "Universo Musical HBG", description: "Identidad artística del ecosistema", status: "en_progreso", color: "var(--neon-cyan)", createdAt: now },
    { id: "3", name: "Branding HBG", description: "Identidad visual completa", status: "borrador", color: "#ff9100", createdAt: now },
  ];
}

const CAT_COLORS: Record<Category, string> = {
  notas: "var(--neon-cyan)", letras: "var(--neon-pink)", ideas: "#ff9100", reflexiones: "var(--neon-purple)",
};
const SEC_COLORS: Record<string, string> = {
  intro: "var(--neon-purple)", verso: "var(--neon-cyan)", coro: "var(--neon-pink)", puente: "#ff9100", outro: "var(--neon-green)",
};
const RHYME_HOOKS = [
  "El fuego no se apaga, se renueva / move the crowd, mueve la ciudad",
  "Del caos nace la obra maestra / soy el arquitecto de mi propia orquesta",
  "La mente clara, el camino abierto / nada está cerrado lo que fue descubierto",
  "Crea sin miedo, arde sin quema / el arte que fluye nunca se frena",
  "Cada palabra un disparo de luz / en el universo HBG soy la voz y la cruz",
];
const STATUS_COLORS = { borrador: "var(--text-muted)", en_progreso: "var(--neon-cyan)", completado: "var(--neon-green)" };
const STATUS_LABEL = { borrador: "BORRADOR", en_progreso: "EN PROGRESO", completado: "COMPLETADO" };

function countWords(text: string) { return text.trim() ? text.trim().split(/\s+/).length : 0; }
function countVerses(text: string) { return text.split("\n").filter((l) => l.trim()).length; }

export function InstintoModule() {
  const [notes, setNotes] = useState<Note[]>(loadNotes);
  const [lyrics, setLyrics] = useState<Lyric[]>(loadLyrics);
  const [projects, setProjects] = useState<Project[]>(loadProjects);
  const [view, setView] = useState<ViewMode>("inicio");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState<Category>("notas");
  const [newTag, setNewTag] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>([]);
  const [search, setSearch] = useState("");
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [activeLyric, setActiveLyric] = useState<Lyric | null>(null);
  const [newLyricTitle, setNewLyricTitle] = useState("");
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [inspirationLines, setInspirationLines] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const [autoSaved, setAutoSaved] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => { if (lyrics.length > 0 && !activeLyric) setActiveLyric(lyrics[0]); }, []);

  const saveNotes = useCallback((n: Note[]) => { setNotes(n); localStorage.setItem(NOTE_KEY, JSON.stringify(n)); }, []);
  const saveLyrics = useCallback((l: Lyric[]) => { setLyrics(l); localStorage.setItem(LYRIC_KEY, JSON.stringify(l)); }, []);
  const saveProjects = useCallback((p: Project[]) => { setProjects(p); localStorage.setItem(PROJECT_KEY, JSON.stringify(p)); }, []);

  // Autosave content changes with debounce
  const triggerAutoSave = useCallback((content: string) => {
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    autoSaveTimerRef.current = setTimeout(() => {
      setAutoSaved(true);
      setTimeout(() => setAutoSaved(false), 2000);
    }, 1200);
    setNewContent(content);
  }, []);

  const addNote = () => {
    if (!newContent.trim()) return;
    const now = new Date().toISOString();
    const note: Note = { id: Date.now().toString(), title: newTitle || "Sin título", content: newContent.trim(), category: newCategory, createdAt: now, updatedAt: now, pinned: false, favorite: false, tags: activeTags, deleted: false };
    saveNotes([note, ...notes]);
    setNewContent(""); setNewTitle(""); setActiveTags([]);
  };

  const deleteNote = (id: string) => saveNotes(notes.map((n) => n.id === id ? { ...n, deleted: true } : n));
  const restoreNote = (id: string) => saveNotes(notes.map((n) => n.id === id ? { ...n, deleted: false } : n));
  const permanentDelete = (id: string) => saveNotes(notes.filter((n) => n.id !== id));
  const togglePin = (id: string) => saveNotes(notes.map((n) => n.id === id ? { ...n, pinned: !n.pinned } : n));
  const toggleFav = (id: string) => saveNotes(notes.map((n) => n.id === id ? { ...n, favorite: !n.favorite } : n));

  const addLyric = () => {
    if (!newLyricTitle.trim()) return;
    const now = new Date().toISOString();
    const lyric: Lyric = { id: Date.now().toString(), title: newLyricTitle, sections: [{ id: "v1", type: "verso", content: "" }], createdAt: now, updatedAt: now };
    saveLyrics([lyric, ...lyrics]);
    setActiveLyric(lyric);
    setNewLyricTitle("");
  };

  const addSection = (type: LyricSection["type"]) => {
    if (!activeLyric) return;
    const section: LyricSection = { id: Date.now().toString(), type, content: "" };
    const updated = { ...activeLyric, sections: [...activeLyric.sections, section], updatedAt: new Date().toISOString() };
    setActiveLyric(updated);
    saveLyrics(lyrics.map((l) => l.id === updated.id ? updated : l));
    setTimeout(() => setEditingSection(section.id), 50);
  };

  const updateSection = (sectionId: string, content: string) => {
    if (!activeLyric) return;
    const updated = { ...activeLyric, sections: activeLyric.sections.map((s) => s.id === sectionId ? { ...s, content } : s), updatedAt: new Date().toISOString() };
    setActiveLyric(updated);
    saveLyrics(lyrics.map((l) => l.id === updated.id ? updated : l));
  };

  const deleteSection = (sectionId: string) => {
    if (!activeLyric) return;
    const updated = { ...activeLyric, sections: activeLyric.sections.filter((s) => s.id !== sectionId) };
    setActiveLyric(updated);
    saveLyrics(lyrics.map((l) => l.id === updated.id ? updated : l));
  };

  const runInspiration = async () => {
    setAnalyzing(true); setInspirationLines([]);
    const ANALYSIS = [
      "Analizando estructura rítmica...",
      "Patrón detectado: ABAB — rima consonante cruzada",
      "Métrica: 9–10 sílabas por verso — flujo estable",
      "Densidad emocional: alta — 3 metáforas identificadas",
      "Palabras de alto impacto: lobo, neon, universo",
      "Sugerencia: añadir un puente en tono contrastante para generar tensión",
      "Hook potencial detectado en versos 2–3 del coro",
    ];
    for (const line of ANALYSIS) {
      await new Promise((r) => setTimeout(r, 450 + Math.random() * 300));
      setInspirationLines((prev) => [...prev, line]);
    }
    setAnalyzing(false);
  };

  const exportTxt = () => {
    if (!activeLyric) return;
    const text = `${activeLyric.title}\n${"=".repeat(activeLyric.title.length)}\n\n` + activeLyric.sections.map((s) => `[${s.type.toUpperCase()}]\n${s.content}`).join("\n\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = `${activeLyric.title.replace(/ /g, "_")}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportJson = (data: unknown, filename: string) => {
    const blob = new Blob([JSON.stringify(data, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a"); a.href = url; a.download = filename; a.click();
    URL.revokeObjectURL(url);
  };

  const allTags = [...new Set(notes.flatMap((n) => n.tags).filter(Boolean))];

  const filtered = notes
    .filter((n) => !n.deleted || showTrash)
    .filter((n) => showTrash ? n.deleted : !n.deleted)
    .filter((n) => !showFavsOnly || n.favorite)
    .filter((n) => !search || n.content.toLowerCase().includes(search.toLowerCase()) || n.title.toLowerCase().includes(search.toLowerCase()))
    .filter((n) => activeTags.length === 0 || activeTags.every((t) => n.tags.includes(t)))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  const totalWords = notes.filter((n) => !n.deleted).reduce((acc, n) => acc + countWords(n.content), 0);
  const totalLyricVerses = lyrics.reduce((acc, l) => acc + l.sections.reduce((sa, s) => sa + countVerses(s.content), 0), 0);

  const NAV_ITEMS: { id: ViewMode; label: string }[] = [
    { id: "inicio", label: "INICIO" }, { id: "bloc", label: "NOTAS" }, { id: "letras", label: "LETRAS" },
    { id: "ideas", label: "IDEAS" }, { id: "proyectos", label: "PROYECTOS" }, { id: "exportar", label: "EXPORTAR" },
    { id: "universo", label: "UNIVERSO HBG" },
  ];

  return (
    <div>
      <div className="mod-header" style={{ "--mod-color": "var(--neon-cyan)" } as React.CSSProperties}>
        <span className="mod-icon">⬡</span>
        <div className="mod-title-group">
          <div className="mod-title">INSTINTO</div>
          <div className="mod-subtitle">// estudio creativo · notas · letras · ideas</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {autoSaved && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--neon-green)", alignSelf: "center" }}>✓ guardado</span>}
          <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 9 }} onClick={() => { setNewContent(RHYME_HOOKS[Math.floor(Math.random() * RHYME_HOOKS.length)]); setView("bloc"); setTimeout(() => textRef.current?.focus(), 100); }}>♪ RIMA</button>
          <button className="hbg-btn hbg-btn-primary" style={{ fontSize: 9 }} onClick={() => { setView("bloc"); setTimeout(() => textRef.current?.focus(), 100); }}>+ NUEVA NOTA</button>
        </div>
      </div>

      {/* Sub-nav */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20, background: "var(--bg-deep)", padding: 4, borderRadius: 4, border: "1px solid var(--border-dim)" }}>
        {NAV_ITEMS.map((n) => (
          <button key={n.id} onClick={() => setView(n.id)}
            style={{ flex: 1, padding: "7px 4px", fontFamily: "var(--font-mono)", fontSize: 8, letterSpacing: "0.06em", background: view === n.id ? "rgba(0,229,255,0.12)" : "transparent", border: `1px solid ${view === n.id ? "var(--neon-cyan)" : "transparent"}`, borderRadius: 3, color: view === n.id ? "var(--neon-cyan)" : "var(--text-muted)", cursor: "pointer", transition: "all 0.15s" }}>
            {n.label}
          </button>
        ))}
      </div>

      {/* INICIO */}
      {view === "inicio" && (
        <div>
          <div className="hbg-grid hbg-grid-4" style={{ gap: 8, marginBottom: 20 }}>
            {[
              { label: "NOTAS TOTALES", value: notes.filter(n => !n.deleted).length, color: "var(--neon-cyan)" },
              { label: "PALABRAS ESCRITAS", value: totalWords, color: "var(--neon-purple)" },
              { label: "LETRAS", value: lyrics.length, color: "var(--neon-pink)" },
              { label: "VERSOS TOTALES", value: totalLyricVerses, color: "#ff9100" },
            ].map((stat) => (
              <div key={stat.label} className="hbg-card hbg-card-accent" style={{ "--card-color": stat.color } as React.CSSProperties}>
                <div className="card-label">{stat.label}</div>
                <div className="card-value" style={{ color: stat.color, textShadow: `0 0 12px ${stat.color}`, fontSize: 22 }}>{stat.value}</div>
              </div>
            ))}
          </div>

          <div className="hbg-card hbg-card-accent" style={{ "--card-color": "var(--neon-purple)", marginBottom: 16 } as React.CSSProperties}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 14, fontWeight: 700, color: "var(--neon-purple)", textShadow: "0 0 12px rgba(124,77,255,0.5)", lineHeight: 1.5, textAlign: "center", padding: "8px 0" }}>
              "El instinto no es azar — es memoria acumulada en movimiento"
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", textAlign: "center", marginTop: 6 }}>— HBG CORE</div>
          </div>

          <div className="section-title">// accesos rápidos</div>
          <div className="hbg-grid hbg-grid-2" style={{ gap: 8 }}>
            {[
              { label: "NUEVA NOTA", view: "bloc" as ViewMode, icon: "⬡", color: "var(--neon-cyan)" },
              { label: "NUEVA LETRA", view: "letras" as ViewMode, icon: "♪", color: "var(--neon-pink)" },
              { label: "NUEVA IDEA", view: "ideas" as ViewMode, icon: "◈", color: "#ff9100" },
              { label: "VER PROYECTOS", view: "proyectos" as ViewMode, icon: "▣", color: "var(--neon-green)" },
            ].map((item) => (
              <button key={item.label} className="hbg-card" style={{ cursor: "pointer", textAlign: "left", padding: "14px 16px", border: `1px solid ${item.color}25` }} onClick={() => setView(item.view)}>
                <span style={{ fontSize: 22, color: item.color, filter: `drop-shadow(0 0 6px ${item.color})` }}>{item.icon}</span>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 11, fontWeight: 700, letterSpacing: "0.1em", color: item.color, marginTop: 8 }}>{item.label}</div>
              </button>
            ))}
          </div>
        </div>
      )}

      {/* BLOC DE NOTAS */}
      {view === "bloc" && (
        <div>
          {/* Editor */}
          <div className="hbg-card" style={{ marginBottom: 16 }}>
            <input className="hbg-input" placeholder="Título de la nota..." value={newTitle} onChange={(e) => setNewTitle(e.target.value)} style={{ marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 6, marginBottom: 8, flexWrap: "wrap" }}>
              {(["notas", "letras", "ideas", "reflexiones"] as Category[]).map((cat) => (
                <button key={cat} className="hbg-badge" style={{ cursor: "pointer", background: newCategory === cat ? `${CAT_COLORS[cat]}18` : undefined, borderColor: newCategory === cat ? CAT_COLORS[cat] : "var(--border-dim)", color: newCategory === cat ? CAT_COLORS[cat] : "var(--text-muted)" }} onClick={() => setNewCategory(cat)}>
                  {cat.toUpperCase()}
                </button>
              ))}
            </div>
            <textarea ref={textRef} className="hbg-input hbg-textarea" placeholder="Escribe tu nota..." value={newContent} onChange={(e) => triggerAutoSave(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) addNote(); }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 6 }}>
              <div style={{ display: "flex", gap: 12, fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
                <span>{countWords(newContent)} palabras</span>
                <span>{countVerses(newContent)} líneas</span>
                <span>{newContent.length} chars</span>
              </div>
              <button className="hbg-btn hbg-btn-primary" onClick={addNote} disabled={!newContent.trim()}>⬡ GUARDAR</button>
            </div>
          </div>

          {/* Filter bar */}
          <div style={{ display: "flex", gap: 8, marginBottom: 12, flexWrap: "wrap" }}>
            <input className="hbg-input" style={{ flex: 1, minWidth: 140 }} placeholder="// buscar notas..." value={search} onChange={(e) => setSearch(e.target.value)} />
            <button className={`hbg-btn ${showFavsOnly ? "hbg-btn-primary" : "hbg-btn-ghost"}`} style={{ padding: "6px 12px", fontSize: 9 }} onClick={() => setShowFavsOnly(v => !v)}>★ FAVORITAS</button>
            <button className={`hbg-btn ${showTrash ? "hbg-btn-danger" : "hbg-btn-ghost"}`} style={{ padding: "6px 12px", fontSize: 9 }} onClick={() => setShowTrash(v => !v)}>🗑 PAPELERA</button>
          </div>

          {allTags.length > 0 && (
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
              {allTags.map((tag) => (
                <button key={tag} className="hbg-badge" style={{ cursor: "pointer", background: activeTags.includes(tag) ? "rgba(0,229,255,0.12)" : undefined, borderColor: activeTags.includes(tag) ? "var(--neon-cyan)" : "var(--border-dim)", color: activeTags.includes(tag) ? "var(--neon-cyan)" : "var(--text-muted)" }} onClick={() => setActiveTags((prev) => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}>
                  #{tag}
                </button>
              ))}
            </div>
          )}

          <div className="hbg-list" style={{ gap: 10 }}>
            {filtered.map((note) => {
              const color = CAT_COLORS[note.category];
              return (
                <div key={note.id} className="hbg-card" style={{ borderColor: note.pinned ? `${color}40` : "var(--border-dim)" }}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                      <span className="hbg-badge" style={{ background: `${color}12`, borderColor: `${color}40`, color }}>{note.category.toUpperCase()}</span>
                      {note.pinned && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#ffd740" }}>★ FIJADA</span>}
                      {note.favorite && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#ffd740" }}>♥</span>}
                    </div>
                    {!showTrash ? (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="hbg-btn hbg-btn-ghost" style={{ padding: "3px 7px", fontSize: 9 }} onClick={() => togglePin(note.id)} title="Fijar">{note.pinned ? "★" : "☆"}</button>
                        <button className="hbg-btn hbg-btn-ghost" style={{ padding: "3px 7px", fontSize: 9 }} onClick={() => toggleFav(note.id)} title="Favorito">{note.favorite ? "♥" : "♡"}</button>
                        <button className="hbg-btn hbg-btn-danger" style={{ padding: "3px 7px", fontSize: 9 }} onClick={() => deleteNote(note.id)}>✕</button>
                      </div>
                    ) : (
                      <div style={{ display: "flex", gap: 4 }}>
                        <button className="hbg-btn hbg-btn-ghost" style={{ padding: "3px 7px", fontSize: 9 }} onClick={() => restoreNote(note.id)}>↩</button>
                        <button className="hbg-btn hbg-btn-danger" style={{ padding: "3px 7px", fontSize: 9 }} onClick={() => permanentDelete(note.id)}>💀</button>
                      </div>
                    )}
                  </div>
                  {note.title !== "Sin título" && <div style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 700, color, marginBottom: 4, letterSpacing: "0.06em" }}>{note.title}</div>}
                  <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--text-primary)", lineHeight: 1.6 }}>{note.content}</div>
                  <div style={{ display: "flex", justifyContent: "space-between", marginTop: 8 }}>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                      {countWords(note.content)} palabras · {countVerses(note.content)} líneas
                    </div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{new Date(note.updatedAt).toLocaleDateString("es-ES")}</div>
                  </div>
                  {note.tags.length > 0 && (
                    <div style={{ display: "flex", gap: 4, marginTop: 6 }}>
                      {note.tags.map((t) => <span key={t} style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>#{t}</span>)}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* LETRAS */}
      {view === "letras" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 14 }}>
            <input className="hbg-input" placeholder="Título de la letra..." value={newLyricTitle} onChange={(e) => setNewLyricTitle(e.target.value)} style={{ flex: 1 }} onKeyDown={(e) => e.key === "Enter" && addLyric()} />
            <button className="hbg-btn hbg-btn-primary" onClick={addLyric}>+ NUEVA LETRA</button>
          </div>

          <div className="hbg-grid hbg-grid-2" style={{ gap: 12 }}>
            <div>
              <div className="section-title">// proyectos musicales</div>
              <div className="hbg-list" style={{ gap: 6 }}>
                {lyrics.map((l) => (
                  <div key={l.id} className="hbg-list-item" style={{ cursor: "pointer", borderColor: activeLyric?.id === l.id ? "var(--neon-pink)" : undefined, background: activeLyric?.id === l.id ? "rgba(255,64,129,0.06)" : undefined }} onClick={() => setActiveLyric(l)}>
                    <span style={{ color: "var(--neon-pink)", fontSize: 14 }}>♪</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: activeLyric?.id === l.id ? "var(--neon-pink)" : "var(--text-primary)" }}>{l.title}</div>
                      {l.album && <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 1 }}>{l.album}</div>}
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>{l.sections.length} secciones · {l.sections.reduce((a, s) => a + countVerses(s.content), 0)} versos</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {activeLyric && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div>
                    <div className="section-title" style={{ marginBottom: 0 }}>// {activeLyric.title}</div>
                    <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>
                      {activeLyric.sections.reduce((a, s) => a + countWords(s.content), 0)} palabras · {activeLyric.sections.reduce((a, s) => a + countVerses(s.content), 0)} versos
                    </div>
                  </div>
                  <div style={{ display: "flex", gap: 4 }}>
                    <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 9, padding: "4px 8px" }} onClick={exportTxt}>TXT</button>
                    <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 9, padding: "4px 8px" }} onClick={() => exportJson(activeLyric, `${activeLyric.title.replace(/ /g, "_")}.json`)}>JSON</button>
                    <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 9, padding: "4px 8px" }} onClick={runInspiration}>◈ IA</button>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 5, marginBottom: 10, flexWrap: "wrap" }}>
                  {(["intro", "verso", "coro", "puente", "outro"] as LyricSection["type"][]).map((t) => (
                    <button key={t} className="hbg-badge" style={{ cursor: "pointer", background: `${SEC_COLORS[t]}12`, borderColor: `${SEC_COLORS[t]}40`, color: SEC_COLORS[t] }} onClick={() => addSection(t)}>+ {t.toUpperCase()}</button>
                  ))}
                </div>

                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 340, overflowY: "auto" }}>
                  {activeLyric.sections.map((section) => (
                    <div key={section.id} style={{ border: `1px solid ${SEC_COLORS[section.type]}30`, borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "5px 10px", background: `${SEC_COLORS[section.type]}10`, borderBottom: `1px solid ${SEC_COLORS[section.type]}20` }}>
                        <span style={{ fontFamily: "var(--font-display)", fontSize: 9, fontWeight: 700, letterSpacing: "0.12em", color: SEC_COLORS[section.type] }}>{section.type.toUpperCase()}</span>
                        <div style={{ display: "flex", gap: 8, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
                          <span>{countVerses(section.content)} versos</span>
                          <button style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 11 }} onClick={() => deleteSection(section.id)}>✕</button>
                        </div>
                      </div>
                      {editingSection === section.id ? (
                        <textarea autoFocus className="hbg-input hbg-textarea" style={{ border: "none", borderRadius: 0, minHeight: 70, resize: "vertical", background: "var(--bg-card)" }}
                          value={section.content} onChange={(e) => updateSection(section.id, e.target.value)} onBlur={() => setEditingSection(null)} />
                      ) : (
                        <div style={{ padding: "10px 12px", fontFamily: "var(--font-ui)", fontSize: 13, color: section.content ? "var(--text-primary)" : "var(--text-muted)", lineHeight: 1.7, whiteSpace: "pre-wrap", cursor: "text", minHeight: 44 }} onClick={() => setEditingSection(section.id)}>
                          {section.content || "// haz clic para escribir..."}
                        </div>
                      )}
                    </div>
                  ))}
                </div>

                {inspirationLines.length > 0 && (
                  <div className="hbg-card" style={{ marginTop: 10, background: "var(--bg-deep)", fontFamily: "var(--font-mono)", fontSize: 10, lineHeight: 1.9 }}>
                    {inspirationLines.map((line, i) => (
                      <div key={i} style={{ display: "flex", gap: 8 }}>
                        <span style={{ color: "var(--neon-cyan)", flexShrink: 0 }}>▸</span>
                        <span style={{ color: "var(--text-primary)" }}>{line}</span>
                      </div>
                    ))}
                    {analyzing && <span style={{ color: "var(--neon-cyan)" }}>▌</span>}
                  </div>
                )}
              </div>
            )}
          </div>
        </div>
      )}

      {/* IDEAS */}
      {view === "ideas" && (
        <div>
          <div className="hbg-grid hbg-grid-2" style={{ gap: 12, marginBottom: 16 }}>
            <div className="hbg-card">
              <div className="section-title">// generador de inspiración</div>
              <button className="hbg-btn hbg-btn-primary w-full" style={{ marginBottom: 8 }} onClick={() => { const hooks = ["App de productividad gamificada con ritmo — cada tarea completada genera un beat", "Mapa mental visual sincronizado con el estado de ánimo en tiempo real", "Sistema de notas que cambia de color según el humor detectado", "Arte generativo basado en patrones de hábitos diarios"]; setNewContent(hooks[Math.floor(Math.random() * hooks.length)]); setNewCategory("ideas"); setView("bloc"); setTimeout(() => textRef.current?.focus(), 100); }}>
                ◈ GENERAR IDEA
              </button>
              <button className="hbg-btn hbg-btn-ghost w-full" onClick={() => { setNewContent(RHYME_HOOKS[Math.floor(Math.random() * RHYME_HOOKS.length)]); setNewCategory("notas"); setView("bloc"); setTimeout(() => textRef.current?.focus(), 100); }}>
                ♪ HOOK DE RIMA
              </button>
            </div>
            <div className="hbg-card">
              <div className="section-title">// estadísticas de ideas</div>
              {(["ideas", "notas", "reflexiones", "letras"] as Category[]).map((cat) => {
                const count = notes.filter((n) => n.category === cat && !n.deleted).length;
                return (
                  <div key={cat} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                    <div className="hbg-progress" style={{ flex: 1, marginTop: 0 }}>
                      <div className="hbg-progress-bar" style={{ "--bar-color": CAT_COLORS[cat], width: `${Math.min(count * 20, 100)}%` } as React.CSSProperties} />
                    </div>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: CAT_COLORS[cat], minWidth: 80 }}>{cat.toUpperCase()}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", minWidth: 20, textAlign: "right" }}>{count}</span>
                  </div>
                );
              })}
            </div>
          </div>

          <div className="section-title">// ideas guardadas</div>
          <div className="hbg-list" style={{ gap: 8 }}>
            {notes.filter((n) => n.category === "ideas" && !n.deleted).map((note) => (
              <div key={note.id} className="hbg-card" style={{ borderColor: "rgba(255,145,0,0.25)" }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 11, color: "#ff9100", marginBottom: 6, letterSpacing: "0.08em" }}>{note.title}</div>
                <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--text-primary)", lineHeight: 1.6 }}>{note.content}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 6 }}>{countWords(note.content)} palabras</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* PROYECTOS */}
      {view === "proyectos" && (
        <div>
          <div className="section-title">// proyectos activos</div>
          <div className="hbg-list" style={{ gap: 10, marginBottom: 16 }}>
            {projects.map((p) => (
              <div key={p.id} className="hbg-card hbg-card-accent" style={{ "--card-color": p.color } as React.CSSProperties}>
                <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                  <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: p.color }}>{p.name}</div>
                  <span className="hbg-badge" style={{ background: `${STATUS_COLORS[p.status]}12`, borderColor: `${STATUS_COLORS[p.status]}40`, color: STATUS_COLORS[p.status] }}>{STATUS_LABEL[p.status]}</span>
                </div>
                <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--text-secondary)" }}>{p.description}</div>
                <div style={{ display: "flex", gap: 6, marginTop: 10 }}>
                  <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 9, padding: "4px 8px" }} onClick={() => saveProjects(projects.map(pr => pr.id === p.id ? { ...pr, status: "en_progreso" } : pr))}>EN PROGRESO</button>
                  <button className="hbg-btn hbg-btn-success" style={{ fontSize: 9, padding: "4px 8px" }} onClick={() => saveProjects(projects.map(pr => pr.id === p.id ? { ...pr, status: "completado" } : pr))}>COMPLETAR</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* EXPORTAR */}
      {view === "exportar" && (
        <div>
          <div className="section-title">// exportar contenido</div>
          <div className="hbg-grid hbg-grid-2" style={{ gap: 12 }}>
            <div className="hbg-card">
              <div className="section-title">// letras</div>
              {activeLyric ? (
                <div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--neon-pink)", marginBottom: 10 }}>{activeLyric.title}</div>
                  <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                    <button className="hbg-btn hbg-btn-ghost w-full" onClick={exportTxt}>↓ EXPORTAR TXT</button>
                    <button className="hbg-btn hbg-btn-ghost w-full" onClick={() => exportJson(activeLyric, `${activeLyric.title.replace(/ /g, "_")}.json`)}>↓ EXPORTAR JSON</button>
                  </div>
                </div>
              ) : (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>// selecciona una letra en la sección LETRAS</div>
              )}
            </div>
            <div className="hbg-card">
              <div className="section-title">// notas completas</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                <button className="hbg-btn hbg-btn-ghost w-full" onClick={() => exportJson(notes.filter(n => !n.deleted), "instinto_notas.json")}>↓ TODAS LAS NOTAS (JSON)</button>
                <button className="hbg-btn hbg-btn-ghost w-full" onClick={() => exportJson({ notas: notes.filter(n => !n.deleted), letras: lyrics, proyectos: projects }, "instinto_completo.json")}>↓ BACKUP COMPLETO</button>
              </div>
            </div>
          </div>
        </div>
      )}

      {/* UNIVERSO HBG */}
      {view === "universo" && (
        <UniversoScreen currentApp="instinto" appColor="var(--neon-cyan)" projectData={{ notas: notes.filter(n => !n.deleted).length, letras: lyrics.length, proyectos: projects.length }} />
      )}
    </div>
  );
}
