import { useState, useRef } from "react";
import { hbgCore, type ModuleId } from "../core/hbgCore";

type Category = "notas" | "letras" | "ideas" | "reflexiones";
type ViewMode = "bloc" | "letras" | "ideas" | "inspiracion" | "universo";

interface Note {
  id: string;
  title: string;
  content: string;
  category: Category;
  createdAt: string;
  pinned: boolean;
}

interface LyricSection {
  id: string;
  type: "intro" | "verso" | "coro" | "puente" | "outro";
  content: string;
}

interface Lyric {
  id: string;
  title: string;
  sections: LyricSection[];
  createdAt: string;
}

const STORAGE_KEY = "hbg_instinto_notes";
const LYRICS_KEY = "hbg_instinto_lyrics";

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : getDefaultNotes();
  } catch { return getDefaultNotes(); }
}

function getDefaultNotes(): Note[] {
  return [
    { id: "1", title: "El ritmo de la productividad", content: "El ritmo es la base de la productividad creativa. Cuando el flow llega, nada lo detiene.", category: "reflexiones", createdAt: new Date().toISOString(), pinned: true },
    { id: "2", title: "Plataforma gamificada", content: "Plataforma de productividad gamificada con ritmo — cada tarea completada genera un beat.", category: "ideas", createdAt: new Date().toISOString(), pinned: false },
  ];
}

function loadLyrics(): Lyric[] {
  try {
    const raw = localStorage.getItem(LYRICS_KEY);
    return raw ? JSON.parse(raw) : getDefaultLyrics();
  } catch { return getDefaultLyrics(); }
}

function getDefaultLyrics(): Lyric[] {
  return [{
    id: "1",
    title: "La Voz del Lobo",
    sections: [
      { id: "v1", type: "verso", content: "En las sombras neon del concreto\nel lobo camina solo pero completo" },
      { id: "c1", type: "coro", content: "La voz del lobo retumba\nen cada ciudad que se derrumba\nfuego en la sangre, hielo en la mente\nel universo HBG presente" },
      { id: "p1", type: "puente", content: "No hay barrera que detenga\nlo que el instinto sostiene" },
    ],
    createdAt: new Date().toISOString(),
  }];
}

const CAT_COLORS: Record<Category, string> = {
  notas: "var(--neon-cyan)",
  letras: "var(--neon-pink)",
  ideas: "#ff9100",
  reflexiones: "var(--neon-purple)",
};

const SECTION_COLORS: Record<string, string> = {
  intro: "var(--neon-purple)",
  verso: "var(--neon-cyan)",
  coro: "var(--neon-pink)",
  puente: "#ff9100",
  outro: "var(--neon-green)",
};

const RHYME_HOOKS = [
  "El fuego no se apaga, se renueva / move the crowd, mueve la ciudad",
  "Deep work, deep soul, deep flow / lo que siembras es lo que el mundo ve",
  "Del caos nace la obra maestra / soy el arquitecto de mi propia orquesta",
  "La mente clara, el camino abierto / nada está cerrado lo que fue descubierto",
  "Crea sin miedo, arde sin quema / el arte que fluye nunca se frena",
];

const IDEA_PROMPTS = [
  "App de trabajo en bloques con recompensas sonoras automáticas",
  "Mapa mental visual sincronizado con el estado de ánimo en tiempo real",
  "Arte generativo basado en patrones de hábitos diarios",
  "Protocolo de deep work con música procedural adaptativa al foco",
  "Sistema de notas que cambia de color según el humor detectado",
];

const INSPIRATION_ANALYSIS = [
  "Estructura detectada: AABB — rima consonante perfecta",
  "Métrica: 10 sílabas por verso — flujo estable",
  "Densidad emocional: alta — 3 metáforas identificadas",
  "Sugerencia: agregar un puente contrastante en tono menor",
  "Palabras de alto impacto: fuego, lobo, universo",
];

export function InstintoModule() {
  const [notes, setNotes] = useState<Note[]>(loadNotes);
  const [lyrics, setLyrics] = useState<Lyric[]>(loadLyrics);
  const [view, setView] = useState<ViewMode>("bloc");
  const [newTitle, setNewTitle] = useState("");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState<Category>("notas");
  const [search, setSearch] = useState("");
  const [activeLyric, setActiveLyric] = useState<Lyric | null>(lyrics[0] || null);
  const [newLyricTitle, setNewLyricTitle] = useState("");
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [inspirationLines, setInspirationLines] = useState<string[]>([]);
  const [analyzing, setAnalyzing] = useState(false);
  const textRef = useRef<HTMLTextAreaElement>(null);

  const saveNotes = (n: Note[]) => { setNotes(n); localStorage.setItem(STORAGE_KEY, JSON.stringify(n)); };
  const saveLyrics = (l: Lyric[]) => { setLyrics(l); localStorage.setItem(LYRICS_KEY, JSON.stringify(l)); };

  const addNote = () => {
    if (!newContent.trim()) return;
    const note: Note = { id: Date.now().toString(), title: newTitle || "Sin título", content: newContent.trim(), category: newCategory, createdAt: new Date().toISOString(), pinned: false };
    saveNotes([note, ...notes]);
    setNewContent(""); setNewTitle("");
  };

  const deleteNote = (id: string) => saveNotes(notes.filter((n) => n.id !== id));
  const togglePin = (id: string) => saveNotes(notes.map((n) => n.id === id ? { ...n, pinned: !n.pinned } : n));

  const addLyric = () => {
    if (!newLyricTitle.trim()) return;
    const lyric: Lyric = { id: Date.now().toString(), title: newLyricTitle, sections: [{ id: "v1", type: "verso", content: "" }], createdAt: new Date().toISOString() };
    const updated = [lyric, ...lyrics];
    saveLyrics(updated);
    setActiveLyric(lyric);
    setNewLyricTitle("");
  };

  const addSection = (type: LyricSection["type"]) => {
    if (!activeLyric) return;
    const section: LyricSection = { id: Date.now().toString(), type, content: "" };
    const updated = { ...activeLyric, sections: [...activeLyric.sections, section] };
    setActiveLyric(updated);
    saveLyrics(lyrics.map((l) => l.id === updated.id ? updated : l));
  };

  const updateSection = (sectionId: string, content: string) => {
    if (!activeLyric) return;
    const updated = { ...activeLyric, sections: activeLyric.sections.map((s) => s.id === sectionId ? { ...s, content } : s) };
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
    setAnalyzing(true);
    setInspirationLines([]);
    for (let i = 0; i < INSPIRATION_ANALYSIS.length; i++) {
      await new Promise((r) => setTimeout(r, 500 + Math.random() * 300));
      setInspirationLines((prev) => [...prev, INSPIRATION_ANALYSIS[i]]);
    }
    setAnalyzing(false);
  };

  const exportTxt = () => {
    if (!activeLyric) return;
    const text = `${activeLyric.title}\n${"=".repeat(activeLyric.title.length)}\n\n` +
      activeLyric.sections.map((s) => `[${s.type.toUpperCase()}]\n${s.content}`).join("\n\n");
    const blob = new Blob([text], { type: "text/plain" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${activeLyric.title.replace(/ /g, "_")}.txt`; a.click();
    URL.revokeObjectURL(url);
  };

  const exportJson = () => {
    if (!activeLyric) return;
    const blob = new Blob([JSON.stringify(activeLyric, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url; a.download = `${activeLyric.title.replace(/ /g, "_")}.json`; a.click();
    URL.revokeObjectURL(url);
  };

  const filtered = notes
    .filter((n) => !search || n.content.toLowerCase().includes(search.toLowerCase()) || n.title.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  const NAV_ITEMS: { id: ViewMode; label: string }[] = [
    { id: "bloc", label: "BLOC DE NOTAS" },
    { id: "letras", label: "LETRAS" },
    { id: "ideas", label: "IDEAS" },
    { id: "inspiracion", label: "INSPIRACIÓN IA" },
    { id: "universo", label: "UNIVERSO HBG" },
  ];

  return (
    <div>
      <div className="mod-header" style={{ "--mod-color": "var(--neon-cyan)" } as React.CSSProperties}>
        <span className="mod-icon">⬡</span>
        <div className="mod-title-group">
          <div className="mod-title">INSTINTO</div>
          <div className="mod-subtitle">// creatividad · notas · letras · ideas</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 9 }} onClick={() => { setNewContent(RHYME_HOOKS[Math.floor(Math.random() * RHYME_HOOKS.length)]); setView("bloc"); setTimeout(() => textRef.current?.focus(), 100); }}>♪ RIMA</button>
          <button className="hbg-btn hbg-btn-primary" style={{ fontSize: 9 }} onClick={() => { setNewContent(IDEA_PROMPTS[Math.floor(Math.random() * IDEA_PROMPTS.length)]); setView("bloc"); setNewCategory("ideas"); setTimeout(() => textRef.current?.focus(), 100); }}>⬡ IDEA</button>
        </div>
      </div>

      {/* Sub-nav */}
      <div style={{ display: "flex", gap: 2, marginBottom: 20, background: "var(--bg-deep)", padding: 4, borderRadius: 4, border: "1px solid var(--border-dim)" }}>
        {NAV_ITEMS.map((n) => (
          <button key={n.id} onClick={() => setView(n.id)}
            style={{ flex: 1, padding: "7px 4px", fontFamily: "var(--font-mono)", fontSize: 9, letterSpacing: "0.06em", background: view === n.id ? "rgba(0,229,255,0.12)" : "transparent", border: `1px solid ${view === n.id ? "var(--neon-cyan)" : "transparent"}`, borderRadius: 3, color: view === n.id ? "var(--neon-cyan)" : "var(--text-muted)", cursor: "pointer", transition: "all 0.15s" }}>
            {n.label}
          </button>
        ))}
      </div>

      {/* BLOC DE NOTAS */}
      {view === "bloc" && (
        <div>
          <div className="hbg-grid hbg-grid-4" style={{ gap: 8, marginBottom: 16 }}>
            {(["notas", "letras", "ideas", "reflexiones"] as Category[]).map((cat) => (
              <div key={cat} className="hbg-card" style={{ "--card-color": CAT_COLORS[cat] } as React.CSSProperties}>
                <div className="card-label">{cat.toUpperCase()}</div>
                <div className="card-value" style={{ color: CAT_COLORS[cat], textShadow: `0 0 10px ${CAT_COLORS[cat]}`, fontSize: 22 }}>
                  {notes.filter((n) => n.category === cat).length}
                </div>
              </div>
            ))}
          </div>

          <div className="hbg-card" style={{ marginBottom: 16 }}>
            <input className="hbg-input" placeholder="Título de la nota..." value={newTitle} onChange={(e) => setNewTitle(e.target.value)} style={{ marginBottom: 8 }} />
            <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
              {(["notas", "letras", "ideas", "reflexiones"] as Category[]).map((cat) => (
                <button key={cat} className="hbg-badge" style={{ cursor: "pointer", background: newCategory === cat ? `${CAT_COLORS[cat]}18` : undefined, borderColor: newCategory === cat ? CAT_COLORS[cat] : "var(--border-dim)", color: newCategory === cat ? CAT_COLORS[cat] : "var(--text-muted)" }} onClick={() => setNewCategory(cat)}>
                  {cat.toUpperCase()}
                </button>
              ))}
            </div>
            <textarea ref={textRef} className="hbg-input hbg-textarea" placeholder="Escribe tu nota..." value={newContent} onChange={(e) => setNewContent(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) addNote(); }} />
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
              <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>Ctrl+Enter para guardar</span>
              <button className="hbg-btn hbg-btn-primary" onClick={addNote} disabled={!newContent.trim()}>⬡ GUARDAR</button>
            </div>
          </div>

          <input className="hbg-input" placeholder="// buscar notas..." value={search} onChange={(e) => setSearch(e.target.value)} style={{ marginBottom: 12 }} />
          <div className="hbg-list">
            {filtered.map((note) => {
              const color = CAT_COLORS[note.category];
              return (
                <div key={note.id} className="hbg-card" style={{ "--card-color": color, borderColor: note.pinned ? color : undefined } as React.CSSProperties}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <span className="hbg-badge" style={{ background: `${color}12`, borderColor: `${color}40`, color }}>{note.category.toUpperCase()}</span>
                      {note.pinned && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "#ffd740" }}>★ FIJADA</span>}
                    </div>
                    <div style={{ display: "flex", gap: 6 }}>
                      <button className="hbg-btn hbg-btn-ghost" style={{ padding: "3px 8px", fontSize: 9 }} onClick={() => togglePin(note.id)}>{note.pinned ? "★" : "☆"}</button>
                      <button className="hbg-btn hbg-btn-danger" style={{ padding: "3px 8px", fontSize: 9 }} onClick={() => deleteNote(note.id)}>✕</button>
                    </div>
                  </div>
                  {note.title !== "Sin título" && <div style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 700, color: color, marginBottom: 4, letterSpacing: "0.06em" }}>{note.title}</div>}
                  <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--text-primary)", lineHeight: 1.6 }}>{note.content}</div>
                  <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 6 }}>{new Date(note.createdAt).toLocaleString("es-ES")}</div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {/* LETRAS */}
      {view === "letras" && (
        <div>
          <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
            <input className="hbg-input" placeholder="Nombre de la letra..." value={newLyricTitle} onChange={(e) => setNewLyricTitle(e.target.value)} style={{ flex: 1 }} onKeyDown={(e) => e.key === "Enter" && addLyric()} />
            <button className="hbg-btn hbg-btn-primary" onClick={addLyric}>+ NUEVA LETRA</button>
          </div>

          <div className="hbg-grid hbg-grid-2" style={{ gap: 12 }}>
            {/* Lyrics list */}
            <div>
              <div className="section-title">// proyectos</div>
              <div className="hbg-list" style={{ gap: 6 }}>
                {lyrics.map((l) => (
                  <div key={l.id} className="hbg-list-item" style={{ cursor: "pointer", borderColor: activeLyric?.id === l.id ? "var(--neon-pink)" : undefined, background: activeLyric?.id === l.id ? "rgba(255,64,129,0.06)" : undefined }} onClick={() => setActiveLyric(l)}>
                    <span style={{ color: "var(--neon-pink)", fontSize: 14 }}>♪</span>
                    <div style={{ flex: 1 }}>
                      <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: activeLyric?.id === l.id ? "var(--neon-pink)" : "var(--text-primary)" }}>{l.title}</div>
                      <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 2 }}>{l.sections.length} secciones</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* Active lyric editor */}
            {activeLyric && (
              <div>
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
                  <div className="section-title" style={{ marginBottom: 0 }}>// {activeLyric.title}</div>
                  <div style={{ display: "flex", gap: 6 }}>
                    <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 9, padding: "4px 8px" }} onClick={exportTxt}>TXT</button>
                    <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 9, padding: "4px 8px" }} onClick={exportJson}>JSON</button>
                  </div>
                </div>

                {/* Add section buttons */}
                <div style={{ display: "flex", gap: 6, marginBottom: 12, flexWrap: "wrap" }}>
                  {(["intro", "verso", "coro", "puente", "outro"] as LyricSection["type"][]).map((t) => (
                    <button key={t} className="hbg-badge" style={{ cursor: "pointer", background: `${SECTION_COLORS[t]}12`, borderColor: `${SECTION_COLORS[t]}40`, color: SECTION_COLORS[t] }} onClick={() => addSection(t)}>
                      + {t.toUpperCase()}
                    </button>
                  ))}
                </div>

                {/* Sections */}
                <div style={{ display: "flex", flexDirection: "column", gap: 8, maxHeight: 380, overflowY: "auto" }}>
                  {activeLyric.sections.map((section) => (
                    <div key={section.id} style={{ border: `1px solid ${SECTION_COLORS[section.type]}30`, borderRadius: 4, overflow: "hidden" }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", padding: "6px 10px", background: `${SECTION_COLORS[section.type]}10`, borderBottom: `1px solid ${SECTION_COLORS[section.type]}20` }}>
                        <span style={{ fontFamily: "var(--font-display)", fontSize: 10, fontWeight: 700, letterSpacing: "0.12em", color: SECTION_COLORS[section.type] }}>{section.type.toUpperCase()}</span>
                        <button style={{ background: "none", border: "none", color: "var(--text-muted)", cursor: "pointer", fontSize: 12 }} onClick={() => deleteSection(section.id)}>✕</button>
                      </div>
                      {editingSection === section.id ? (
                        <textarea
                          autoFocus
                          className="hbg-input hbg-textarea"
                          style={{ border: "none", borderRadius: 0, minHeight: 70, resize: "vertical", background: "var(--bg-card)" }}
                          value={section.content}
                          onChange={(e) => updateSection(section.id, e.target.value)}
                          onBlur={() => setEditingSection(null)}
                        />
                      ) : (
                        <div
                          style={{ padding: "10px 12px", fontFamily: "var(--font-ui)", fontSize: 13, color: section.content ? "var(--text-primary)" : "var(--text-muted)", lineHeight: 1.7, whiteSpace: "pre-wrap", cursor: "text", minHeight: 44 }}
                          onClick={() => setEditingSection(section.id)}
                        >
                          {section.content || "// haz clic para escribir..."}
                        </div>
                      )}
                    </div>
                  ))}
                </div>
              </div>
            )}
          </div>
        </div>
      )}

      {/* IDEAS */}
      {view === "ideas" && (
        <div>
          <div className="hbg-grid hbg-grid-2" style={{ gap: 12, marginBottom: 20 }}>
            <div className="hbg-card">
              <div className="section-title">// generador de ideas</div>
              <button className="hbg-btn hbg-btn-primary w-full" style={{ marginBottom: 8 }} onClick={() => { setNewContent(IDEA_PROMPTS[Math.floor(Math.random() * IDEA_PROMPTS.length)]); setNewCategory("ideas"); setView("bloc"); setTimeout(() => textRef.current?.focus(), 100); }}>
                ⬡ NUEVA IDEA
              </button>
              <button className="hbg-btn hbg-btn-ghost w-full" onClick={() => { setNewContent(RHYME_HOOKS[Math.floor(Math.random() * RHYME_HOOKS.length)]); setNewCategory("notas"); setView("bloc"); setTimeout(() => textRef.current?.focus(), 100); }}>
                ♪ HOOK DE RIMA
              </button>
            </div>
            <div className="hbg-card">
              <div className="section-title">// proyectos activos</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
                {["La Voz del Lobo", "Universo Musical HBG", "Branding HBG"].map((p, i) => (
                  <div key={p} className="hbg-list-item" style={{ padding: "8px 12px" }}>
                    <div className="hbg-list-dot" style={{ color: "var(--neon-cyan)", background: "var(--neon-cyan)" }} />
                    <span style={{ fontFamily: "var(--font-ui)", fontSize: 12, color: "var(--text-primary)" }}>{p}</span>
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--neon-green)", marginLeft: "auto" }}>EN PROGRESO</span>
                  </div>
                ))}
              </div>
            </div>
          </div>

          <div className="section-title">// ideas guardadas</div>
          <div className="hbg-list">
            {notes.filter((n) => n.category === "ideas").map((note) => (
              <div key={note.id} className="hbg-card" style={{ borderColor: "rgba(255,145,0,0.3)" }}>
                <div style={{ fontFamily: "var(--font-display)", fontSize: 11, color: "#ff9100", marginBottom: 6, letterSpacing: "0.08em" }}>{note.title}</div>
                <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--text-primary)", lineHeight: 1.6 }}>{note.content}</div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* INSPIRACIÓN IA */}
      {view === "inspiracion" && (
        <div>
          <div className="hbg-grid hbg-grid-2" style={{ gap: 12, marginBottom: 20 }}>
            <div className="hbg-card">
              <div className="section-title">// texto a analizar</div>
              <textarea className="hbg-input hbg-textarea" style={{ minHeight: 100, marginBottom: 10 }} placeholder="Pega aquí tu letra o fragmento para analizar..." defaultValue={activeLyric ? activeLyric.sections.map((s) => s.content).join("\n\n") : ""} />
              <button className="hbg-btn hbg-btn-primary w-full" onClick={runInspiration} disabled={analyzing} style={{ opacity: analyzing ? 0.6 : 1 }}>
                {analyzing ? "◈ ANALIZANDO..." : "◈ INSPIRACIÓN CORE"}
              </button>
            </div>
            <div className="hbg-card" style={{ background: "var(--bg-deep)" }}>
              <div className="section-title">// análisis del core</div>
              {inspirationLines.length === 0 && !analyzing ? (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, color: "var(--text-muted)" }}>
                  // escribe un texto y haz clic en INSPIRACIÓN CORE
                </div>
              ) : (
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 11, lineHeight: 2 }}>
                  {inspirationLines.map((line, i) => (
                    <div key={i} style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                      <span style={{ color: "var(--neon-cyan)", flexShrink: 0 }}>▸</span>
                      <span style={{ color: "var(--text-primary)" }}>{line}</span>
                    </div>
                  ))}
                  {analyzing && <span style={{ color: "var(--neon-cyan)" }}>▌</span>}
                </div>
              )}
            </div>
          </div>

          <div className="section-title">// frase del día</div>
          <div className="hbg-card hbg-card-accent" style={{ "--card-color": "var(--neon-purple)" } as React.CSSProperties}>
            <div style={{ fontFamily: "var(--font-display)", fontSize: 15, fontWeight: 700, color: "var(--neon-purple)", textShadow: "0 0 12px rgba(124,77,255,0.5)", lineHeight: 1.5, textAlign: "center", padding: "8px 0" }}>
              "El instinto no es azar — es memoria acumulada en movimiento"
            </div>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)", textAlign: "center", marginTop: 8 }}>— HBG CORE</div>
          </div>
        </div>
      )}

      {/* UNIVERSO HBG */}
      {view === "universo" && (
        <div>
          <div className="section-title">// universo hbg — ecosistema conectado</div>
          <div className="hbg-grid hbg-grid-2" style={{ gap: 12 }}>
            {[
              { id: "vibra" as ModuleId, label: "VIBRA PRO", icon: "◉", color: "var(--neon-pink)", desc: "Motor de audio y mood engine" },
              { id: "terminador" as ModuleId, label: "TERMINADOR IA", icon: "⬢", color: "var(--neon-green)", desc: "Agente de automatización" },
              { id: "universo" as ModuleId, label: "HBG CORE", icon: "◈", color: "var(--neon-purple)", desc: "Cerebro del ecosistema" },
            ].map((app) => (
              <div key={app.id} className="hbg-card hbg-card-accent" style={{ "--card-color": app.color, cursor: "pointer" } as React.CSSProperties} onClick={() => hbgCore.setModule(app.id)}>
                <div style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 6 }}>
                  <span style={{ fontSize: 22, color: app.color, filter: `drop-shadow(0 0 8px ${app.color})` }}>{app.icon}</span>
                  <span style={{ fontFamily: "var(--font-display)", fontSize: 12, fontWeight: 700, letterSpacing: "0.1em", color: app.color }}>{app.label}</span>
                </div>
                <div className="card-body">{app.desc}</div>
                <div style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--neon-green)", marginTop: 8 }}>🟢 ONLINE → ABRIR</div>
              </div>
            ))}
            <div className="hbg-card">
              <div className="section-title">// share engine</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
                <button className="hbg-btn hbg-btn-primary w-full">↗ COMPARTIR LETRA</button>
                <button className="hbg-btn hbg-btn-ghost w-full">↓ EXPORTAR PROYECTO</button>
                <button className="hbg-btn hbg-btn-ghost w-full">⬡ SINCRONIZAR CON CORE</button>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
