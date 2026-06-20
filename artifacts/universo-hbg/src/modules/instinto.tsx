import { useState, useRef } from "react";

type Category = "general" | "ideas" | "rimas" | "reflexiones";

interface Note {
  id: string;
  content: string;
  category: Category;
  mood: string;
  createdAt: string;
  pinned: boolean;
}

const STORAGE_KEY = "hbg_instinto_notes";

function loadNotes(): Note[] {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    return raw ? JSON.parse(raw) : getDefaultNotes();
  } catch {
    return getDefaultNotes();
  }
}

function saveNotes(notes: Note[]) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(notes));
}

function getDefaultNotes(): Note[] {
  return [
    {
      id: "1",
      content: "El ritmo es la base de la productividad creativa. Cuando el flow llega, nada lo detiene.",
      category: "reflexiones",
      mood: "creative",
      createdAt: new Date().toISOString(),
      pinned: true,
    },
    {
      id: "2",
      content: "Idea: plataforma de productividad gamificada con ritmo — cada tarea completada genera un beat.",
      category: "ideas",
      mood: "energized",
      createdAt: new Date().toISOString(),
      pinned: false,
    },
    {
      id: "3",
      content: "El fuego no se apaga, se renueva / move the crowd, mueve la ciudad.",
      category: "rimas",
      mood: "energized",
      createdAt: new Date().toISOString(),
      pinned: false,
    },
  ];
}

const CATEGORY_COLORS: Record<Category, string> = {
  general: "var(--neon-cyan)",
  ideas: "var(--neon-orange, #ff9100)",
  rimas: "var(--neon-pink)",
  reflexiones: "var(--neon-purple)",
};

const CATEGORY_LABELS: Record<Category, string> = {
  general: "GENERAL",
  ideas: "IDEAS",
  rimas: "RIMAS",
  reflexiones: "REFLEXIONES",
};

const RHYME_HOOKS = [
  "El fuego no se apaga, se renueva",
  "Deep work, deep soul, deep flow",
  "Del caos nace la obra maestra",
  "La mente clara, el camino abierto",
  "Fluye, fluye, todo pasa",
  "Crea sin miedo, arde sin quema",
];

const IDEA_PROMPTS = [
  "¿Qué pasaría si combinamos energía con tecnología?",
  "Sistema de trabajo en bloques con recompensas sonoras",
  "Mapa mental visual sincronizado con el estado de ánimo",
  "Arte generativo basado en patrones de hábitos",
  "Protocolo de deep work con música procedural adaptativa",
];

export function InstintoModule() {
  const [notes, setNotes] = useState<Note[]>(loadNotes);
  const [filter, setFilter] = useState<Category | "all">("all");
  const [newContent, setNewContent] = useState("");
  const [newCategory, setNewCategory] = useState<Category>("general");
  const [search, setSearch] = useState("");
  const textRef = useRef<HTMLTextAreaElement>(null);

  const addNote = () => {
    if (!newContent.trim()) return;
    const note: Note = {
      id: Date.now().toString(),
      content: newContent.trim(),
      category: newCategory,
      mood: "neutral",
      createdAt: new Date().toISOString(),
      pinned: false,
    };
    const updated = [note, ...notes];
    setNotes(updated);
    saveNotes(updated);
    setNewContent("");
  };

  const deleteNote = (id: string) => {
    const updated = notes.filter((n) => n.id !== id);
    setNotes(updated);
    saveNotes(updated);
  };

  const togglePin = (id: string) => {
    const updated = notes.map((n) => (n.id === id ? { ...n, pinned: !n.pinned } : n));
    setNotes(updated);
    saveNotes(updated);
  };

  const generateRhyme = () => {
    const hook = RHYME_HOOKS[Math.floor(Math.random() * RHYME_HOOKS.length)];
    setNewContent(hook);
    setNewCategory("rimas");
    textRef.current?.focus();
  };

  const generateIdea = () => {
    const idea = IDEA_PROMPTS[Math.floor(Math.random() * IDEA_PROMPTS.length)];
    setNewContent(idea);
    setNewCategory("ideas");
    textRef.current?.focus();
  };

  const filtered = notes
    .filter((n) => filter === "all" || n.category === filter)
    .filter((n) => !search || n.content.toLowerCase().includes(search.toLowerCase()))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  const stats: Record<string, number> = { all: notes.length };
  (["general", "ideas", "rimas", "reflexiones"] as Category[]).forEach((c) => {
    stats[c] = notes.filter((n) => n.category === c).length;
  });

  return (
    <div>
      <div className="mod-header" style={{ "--mod-color": "var(--neon-cyan)" } as React.CSSProperties}>
        <span className="mod-icon">⬡</span>
        <div className="mod-title-group">
          <div className="mod-title">INSTINTO</div>
          <div className="mod-subtitle">// notas y creatividad enlazadas al mood</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
          <button className="hbg-btn hbg-btn-ghost" onClick={generateRhyme}>
            ♪ RIMA
          </button>
          <button className="hbg-btn hbg-btn-primary" onClick={generateIdea}>
            ⬡ IDEA
          </button>
        </div>
      </div>

      {/* Stats */}
      <div className="hbg-grid hbg-grid-4" style={{ gap: 10, marginBottom: 20 }}>
        {(["all", "ideas", "rimas", "reflexiones"] as const).map((cat) => (
          <div
            key={cat}
            className={`hbg-card ${filter === cat ? "hbg-card-accent" : ""}`}
            style={{
              "--card-color": cat === "all" ? "var(--neon-cyan)" : CATEGORY_COLORS[cat as Category],
              cursor: "pointer",
            } as React.CSSProperties}
            onClick={() => setFilter(cat)}
          >
            <div className="card-label">{cat === "all" ? "TOTAL" : CATEGORY_LABELS[cat as Category]}</div>
            <div
              className="card-value"
              style={{
                color: cat === "all" ? "var(--neon-cyan)" : CATEGORY_COLORS[cat as Category],
                textShadow: `0 0 12px ${cat === "all" ? "var(--neon-cyan)" : CATEGORY_COLORS[cat as Category]}`,
              }}
            >
              {stats[cat] || 0}
            </div>
          </div>
        ))}
      </div>

      {/* Input */}
      <div className="hbg-card" style={{ marginBottom: 20 }}>
        <div className="section-title" style={{ marginBottom: 12 }}>// nueva entrada</div>
        <div style={{ display: "flex", gap: 8, marginBottom: 10 }}>
          {(["general", "ideas", "rimas", "reflexiones"] as Category[]).map((cat) => (
            <button
              key={cat}
              className={`hbg-badge ${newCategory === cat ? "hbg-badge-cyan" : ""}`}
              style={{
                cursor: "pointer",
                background: newCategory === cat ? `${CATEGORY_COLORS[cat]}20` : undefined,
                borderColor: newCategory === cat ? CATEGORY_COLORS[cat] : undefined,
                color: newCategory === cat ? CATEGORY_COLORS[cat] : "var(--text-muted)",
              }}
              onClick={() => setNewCategory(cat)}
            >
              {CATEGORY_LABELS[cat]}
            </button>
          ))}
        </div>
        <textarea
          ref={textRef}
          className="hbg-input hbg-textarea"
          placeholder="Escribe tu nota, idea o rima..."
          value={newContent}
          onChange={(e) => setNewContent(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && e.ctrlKey) addNote();
          }}
        />
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginTop: 8 }}>
          <span style={{ fontFamily: "var(--font-mono)", fontSize: 10, color: "var(--text-muted)" }}>
            Ctrl+Enter para guardar
          </span>
          <button className="hbg-btn hbg-btn-primary" onClick={addNote} disabled={!newContent.trim()}>
            ⬡ GUARDAR NOTA
          </button>
        </div>
      </div>

      {/* Search */}
      <div style={{ marginBottom: 16 }}>
        <input
          className="hbg-input"
          placeholder="// buscar en notas..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
        />
      </div>

      {/* Notes list */}
      <div className="hbg-list">
        {filtered.length === 0 && (
          <div className="hbg-card" style={{ textAlign: "center", padding: 32 }}>
            <div style={{ fontFamily: "var(--font-mono)", fontSize: 12, color: "var(--text-muted)" }}>
              // sin entradas en esta categoría
            </div>
          </div>
        )}
        {filtered.map((note) => {
          const color = CATEGORY_COLORS[note.category];
          return (
            <div
              key={note.id}
              className="hbg-card"
              style={{ "--card-color": color, borderColor: note.pinned ? color : undefined } as React.CSSProperties}
            >
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", marginBottom: 8 }}>
                <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                  <span
                    className="hbg-badge"
                    style={{
                      background: `${color}15`,
                      borderColor: `${color}50`,
                      color,
                    }}
                  >
                    {CATEGORY_LABELS[note.category]}
                  </span>
                  {note.pinned && (
                    <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--neon-yellow, #ffd740)" }}>
                      ★ FIJADA
                    </span>
                  )}
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button
                    className="hbg-btn hbg-btn-ghost"
                    style={{ padding: "4px 10px", fontSize: 9 }}
                    onClick={() => togglePin(note.id)}
                  >
                    {note.pinned ? "★" : "☆"}
                  </button>
                  <button
                    className="hbg-btn hbg-btn-danger"
                    style={{ padding: "4px 10px", fontSize: 9 }}
                    onClick={() => deleteNote(note.id)}
                  >
                    ✕
                  </button>
                </div>
              </div>
              <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--text-primary)", lineHeight: 1.6 }}>
                {note.content}
              </div>
              <div style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)", marginTop: 8 }}>
                {new Date(note.createdAt).toLocaleString("es-ES")}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}
