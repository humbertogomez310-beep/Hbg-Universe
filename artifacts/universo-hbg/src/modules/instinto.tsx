import { useState, useRef, useEffect } from "react";
import { UniversoScreen } from "../components/UniversoScreen";
import { hbgCore, HBG_CORE_EVENTS } from "../core/hbgCore";
import { remoteApiEnabled } from "../core/apiConfig";
import {
  generateInstintoHook,
  generateInstintoIdea,
  resolveInstintoMood,
  type InstintoMood,
} from "./instintoInspiration";
import { loadInstintoData, saveInstintoRecord, replaceInstintoData, persistInstintoFallbackRecord, persistInstintoFallbackData, readInstintoFallbackData } from "./instintoDB";
import { buildInstintoSongPrompt, generateInstintoLocalSongScaffold, parseInstintoSongSections } from "./instintoSongwriter";
import {
  createInstintoBackup,
  parseInstintoBackup,
  type InstintoCategory as Category,
  type InstintoNote as Note,
  type InstintoLyric as Lyric,
  type InstintoLyricSection as LyricSection,
  type InstintoProject as Project,
  type InstintoDraft as NoteDraft,
} from "./instintoBackup";

type ViewMode = "inicio" | "bloc" | "letras" | "ideas" | "proyectos" | "exportar" | "universo";

const NOTE_KEY = "hbg_instinto_notes_v2";
const LYRIC_KEY = "hbg_instinto_lyrics_v2";
const PROJECT_KEY = "hbg_instinto_projects";
const DRAFT_KEY = "hbg_instinto_draft_v1";

function browserStorage(): Storage | null {
  if (typeof window === "undefined") return null;
  try { return window.localStorage; } catch { return null; }
}

function loadLegacyCollection<T>(key: string): T[] {
  const storage = browserStorage();
  if (!storage) return [];
  try {
    const parsed: unknown = JSON.parse(storage.getItem(key) ?? "[]");
    return Array.isArray(parsed) ? parsed as T[] : [];
  } catch { return []; }
}

function loadLegacyDraft(): NoteDraft {
  const fallback: NoteDraft = { title: "", content: "", category: "notas", tags: [] };
  const storage = browserStorage();
  if (!storage) return fallback;
  try {
    const parsed: unknown = JSON.parse(storage.getItem(DRAFT_KEY) ?? "null");
    if (typeof parsed !== "object" || parsed === null || Array.isArray(parsed)) return fallback;
    const value = parsed as Record<string, unknown>;
    const category = value.category;
    return {
      title: typeof value.title === "string" ? value.title : "",
      content: typeof value.content === "string" ? value.content : "",
      category: category === "notas" || category === "letras" || category === "ideas" || category === "reflexiones" ? category : "notas",
      tags: Array.isArray(value.tags) ? value.tags.filter((tag): tag is string => typeof tag === "string").slice(0, 30) : [],
    };
  } catch { return fallback; }
}

const CAT_COLORS: Record<Category, string> = {
  notas: "var(--neon-cyan)", letras: "var(--neon-pink)", ideas: "#ff9100", reflexiones: "var(--neon-purple)",
};
const SEC_COLORS: Record<string, string> = {
  intro: "var(--neon-purple)", verso: "var(--neon-cyan)", coro: "var(--neon-pink)", puente: "#ff9100", outro: "var(--neon-green)",
};
const STATUS_COLORS = { borrador: "var(--text-muted)", en_progreso: "var(--neon-cyan)", completado: "var(--neon-green)" };
const STATUS_LABEL = { borrador: "BORRADOR", en_progreso: "EN PROGRESO", completado: "COMPLETADO" };

function countWords(text: string) { return text.trim() ? text.trim().split(/\s+/).length : 0; }
function countVerses(text: string) { return text.split("\n").filter((l) => l.trim()).length; }

export function InstintoModule() {
  const [notes, setNotes] = useState<Note[]>(() => loadLegacyCollection<Note>(NOTE_KEY));
  const [lyrics, setLyrics] = useState<Lyric[]>(() => loadLegacyCollection<Lyric>(LYRIC_KEY));
  const [projects, setProjects] = useState<Project[]>(() => loadLegacyCollection<Project>(PROJECT_KEY));
  const [draft, setDraft] = useState<NoteDraft>(loadLegacyDraft);
  const [storageReady, setStorageReady] = useState(false);
  const [view, setView] = useState<ViewMode>("inicio");
  const [newTitle, setNewTitle] = useState(draft.title);
  const [newContent, setNewContent] = useState(draft.content);
  const [newCategory, setNewCategory] = useState<Category>(draft.category);
  const [newTag, setNewTag] = useState("");
  const [activeTags, setActiveTags] = useState<string[]>(draft.tags);
  const [filterTags, setFilterTags] = useState<string[]>([]);
  const [songTitle, setSongTitle] = useState("");
  const [songConcept, setSongConcept] = useState("");
  const [songGenre, setSongGenre] = useState("pop");
  const [songGenerationBusy, setSongGenerationBusy] = useState(false);
  const [songGenerationStatus, setSongGenerationStatus] = useState("");
  const [search, setSearch] = useState("");
  const [showFavsOnly, setShowFavsOnly] = useState(false);
  const [showTrash, setShowTrash] = useState(false);
  const [activeLyric, setActiveLyric] = useState<Lyric | null>(null);
  const [newLyricTitle, setNewLyricTitle] = useState("");
  const [newProjectName, setNewProjectName] = useState("");
  const [newProjectDescription, setNewProjectDescription] = useState("");
  const [editingSection, setEditingSection] = useState<string | null>(null);
  const [inspirationLines, setInspirationLines] = useState<string[]>([]);
  const [autoSaved, setAutoSaved] = useState(false);
  const [storageWarning, setStorageWarning] = useState("");
  const [backupStatus, setBackupStatus] = useState("");
  const backupFileRef = useRef<HTMLInputElement>(null);
  const textRef = useRef<HTMLTextAreaElement>(null);
  const autoSaveTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const [creativeMood, setCreativeMood] = useState<InstintoMood>(() =>
    resolveInstintoMood(hbgCore.recall("core.mood")),
  );

  useEffect(() => {
    hbgCore.init();
    const refreshMood = () => {
      setCreativeMood(resolveInstintoMood(hbgCore.recall("core.mood")));
    };
    refreshMood();
    return hbgCore.subscribeEvent<{ mood?: unknown }>(
      HBG_CORE_EVENTS.MOOD_CHANGED,
      (event) => setCreativeMood(resolveInstintoMood(event.payload.mood)),
    );
  }, []);

  useEffect(() => { if (lyrics.length > 0 && !activeLyric) setActiveLyric(lyrics[0]); }, []);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      try {
        const data = await loadInstintoData();
        if (cancelled) return;
        setNotes(data.notes);
        setLyrics(data.lyrics);
        setProjects(data.projects);
        setDraft(data.draft);
        setNewTitle(data.draft.title);
        setNewContent(data.draft.content);
        setNewCategory(data.draft.category);
        setActiveTags(data.draft.tags);
        setActiveLyric(data.lyrics[0] ?? null);
        setStorageWarning("");
      } catch (error) {
        if (!cancelled) {
          const fallbackData = readInstintoFallbackData(browserStorage());
          if (fallbackData) {
            setNotes(fallbackData.notes);
            setLyrics(fallbackData.lyrics);
            setProjects(fallbackData.projects);
            setDraft(fallbackData.draft);
            setNewTitle(fallbackData.draft.title);
            setNewContent(fallbackData.draft.content);
            setNewCategory(fallbackData.draft.category);
            setActiveTags(fallbackData.draft.tags);
            setActiveLyric(fallbackData.lyrics[0] ?? null);
            setStorageWarning("IndexedDB no disponible; se está mostrando el respaldo local pendiente de sincronización.");
          } else {
            setStorageWarning(error instanceof Error ? error.message : "No se pudo abrir el almacenamiento de INSTINTO.");
          }
        }
      } finally {
        if (!cancelled) setStorageReady(true);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const saveRecord = async (key: "notes" | "lyrics" | "projects" | "draft", value: unknown, label: string) => {
    try {
      await saveInstintoRecord(key, value as never);
      setStorageWarning("");
      return true;
    } catch {
      const saved = persistInstintoFallbackRecord(key, value as never);
      setStorageWarning(saved
        ? `IndexedDB no disponible; ${label} se guardaron temporalmente en el almacenamiento anterior.`
        : `No se pudieron guardar ${label} en este dispositivo.`);
      return saved;
    }
  };

  const saveNotes = (next: Note[], newlySavedNote?: Note) => {
    setNotes(next);
    void saveRecord("notes", next, "las notas").then((persisted) => {
      if (persisted && newlySavedNote) {
        hbgCore.publishEvent("instinto.note_saved", {
          noteId: newlySavedNote.id,
          category: newlySavedNote.category,
        });
      }
    });
  };
  const saveLyrics = (next: Lyric[]) => {
    setLyrics(next);
    return saveRecord("lyrics", next, "las letras");
  };
  const saveProjects = (next: Project[]) => {
    setProjects(next);
    void saveRecord("projects", next, "los proyectos");
  };

  const addProject = () => {
    const name = newProjectName.trim();
    if (!name) return;
    const project: Project = {
      id: `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
      name,
      description: newProjectDescription.trim(),
      status: "borrador",
      color: "var(--neon-cyan)",
      createdAt: new Date().toISOString(),
    };
    saveProjects([project, ...projects]);
    setNewProjectName("");
    setNewProjectDescription("");
  };

  useEffect(() => {
    if (!storageReady) return;
    if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    if (!newTitle.trim() && !newContent.trim() && activeTags.length === 0) {
      setDraft({ title: "", content: "", category: "notas", tags: [] });
      void saveRecord("draft", { title: "", content: "", category: "notas", tags: [] }, "el borrador");
      setAutoSaved(false);
      return;
    }

    setAutoSaved(false);
    autoSaveTimerRef.current = setTimeout(() => {
      const nextDraft: NoteDraft = { title: newTitle, content: newContent, category: newCategory, tags: activeTags };
      setDraft(nextDraft);
      void saveRecord("draft", nextDraft, "el borrador").then((persisted) => setAutoSaved(persisted));
    }, 800);

    return () => {
      if (autoSaveTimerRef.current) clearTimeout(autoSaveTimerRef.current);
    };
  }, [storageReady, newTitle, newContent, newCategory, activeTags]);

  const addNote = () => {
    if (!newContent.trim()) return;
    const now = new Date().toISOString();
    const note: Note = { id: Date.now().toString(), title: newTitle || "Sin título", content: newContent.trim(), category: newCategory, createdAt: now, updatedAt: now, pinned: false, favorite: false, tags: activeTags, deleted: false };
    saveNotes([note, ...notes], note);
    setDraft({ title: "", content: "", category: "notas", tags: [] });
    void saveRecord("draft", { title: "", content: "", category: "notas", tags: [] }, "el borrador");
    setAutoSaved(false);
    setNewContent(""); setNewTitle(""); setActiveTags([]);
  };

  const prepareIdeaDraft = () => {
    setNewContent(generateInstintoIdea(creativeMood));
    setNewCategory("ideas");
    setView("bloc");
    setTimeout(() => textRef.current?.focus(), 100);
    hbgCore.publishEvent("instinto.idea_generated", { mood: creativeMood });
  };

  const prepareRhymeDraft = (category?: Category) => {
    setNewContent(generateInstintoHook(creativeMood));
    if (category) setNewCategory(category);
    setView("bloc");
    setTimeout(() => textRef.current?.focus(), 100);
    hbgCore.publishEvent("instinto.rhyme_generated", { mood: creativeMood });
  };

  const generateSong = async () => {
    const concept = songConcept.trim();
    if (concept.length < 8) {
      setSongGenerationStatus("Describe la idea de la canción con al menos 8 caracteres.");
      return;
    }

    const request = { title: songTitle.trim(), concept, genre: songGenre };
    setSongGenerationBusy(true);
    setSongGenerationStatus("Construyendo una canción nueva…");

    try {
      let sections: LyricSection[];
      let generatedWithAI = false;
      try {
        if (!remoteApiEnabled()) throw new Error("La API remota está deshabilitada en esta compilación.");
        const response = await fetch("/api/core/chat", {
          method: "POST",
          credentials: "include",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            messages: [{ role: "user", content: buildInstintoSongPrompt(request) }],
          }),
        });
        const result: unknown = await response.json().catch(() => null);
        const payload = typeof result === "object" && result !== null
          ? result as Record<string, unknown>
          : {};
        if (!response.ok || payload.success !== true || typeof payload.text !== "string") {
          throw new Error(typeof payload.error === "string" ? payload.error : "La IA remota no está disponible.");
        }
        sections = parseInstintoSongSections(payload.text) as LyricSection[];
        generatedWithAI = true;
      } catch {
        // Static/offline builds stay usable, but the UI never labels a scaffold as AI.
        sections = generateInstintoLocalSongScaffold(request) as LyricSection[];
      }

      const now = new Date().toISOString();
      const title = request.title || concept.split(/[.!?\\r\\n]/)[0].slice(0, 60) || "Canción nueva";
      const lyric: Lyric = {
        id: `song-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
        title,
        sections,
        createdAt: now,
        updatedAt: now,
      };
      const persisted = await saveLyrics([lyric, ...lyrics]);
      setActiveLyric(lyric);
      setSongGenerationStatus(!persisted
        ? "La canción se creó, pero no pudo guardarse. Exporta un respaldo antes de salir."
        : generatedWithAI
          ? "Canción nueva generada con IA y guardada. Tus letras anteriores se conservaron."
          : "IA remota no disponible: se creó un esquema local editable, no una generación IA completa. Tus letras anteriores se conservaron.");
      if (persisted) setSongConcept("");
      setView("letras");
    } catch (error) {
      setSongGenerationStatus(error instanceof Error ? error.message : "No se pudo crear la canción.");
    } finally {
      setSongGenerationBusy(false);
    }
  };

  // Expose only bounded local draft operations to HBG Core. Nothing is saved as
  // a note or lyric until the user explicitly presses the corresponding Save button.
  useEffect(() => {
    if (!storageReady) return;

    const unregister = [
      hbgCore.registerAction("instinto.generateIdea", (payload) => {
        const context = typeof payload?.context === "string"
          ? payload.context.trim().slice(0, 240)
          : "";
        setNewContent(generateInstintoIdea(creativeMood, context));
        setNewCategory("ideas");
        setView("bloc");
        hbgCore.publishEvent("instinto.idea_generated", { mood: creativeMood });
        return { success: true, data: { category: "ideas" } };
      }),
      hbgCore.registerAction("instinto.generateHook", () => {
        setNewContent(generateInstintoHook(creativeMood));
        setNewCategory("letras");
        setView("bloc");
        hbgCore.publishEvent("instinto.rhyme_generated", { mood: creativeMood });
        return { success: true, data: { category: "letras" } };
      }),
      hbgCore.registerAction("instinto.createLyricDraft", (payload) => {
        const title = typeof payload?.title === "string" ? payload.title.trim() : "";
        if (!title || title.length > 80) {
          return { success: false, error: "El título de la letra debe tener entre 1 y 80 caracteres." };
        }
        setNewLyricTitle(title);
        setView("letras");
        return { success: true, data: { draft: true } };
      }),
    ];

    return () => unregister.forEach((remove) => remove());
  }, [storageReady, creativeMood]);

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

  const runInspiration = () => {
    if (!activeLyric) return;
    const lines = activeLyric.sections
      .flatMap((section) => section.content.split("\n"))
      .map((line) => line.trim())
      .filter(Boolean);
    const words = lines.flatMap((line) => line.split(/\s+/));
    const endings = lines
      .map((line) => line.split(/\s+/).at(-1)?.replace(/[^\p{L}\p{N}]/gu, "").toLocaleLowerCase("es"))
      .filter((word): word is string => Boolean(word));
    const endingCounts = new Map<string, number>();
    endings.forEach((word) => endingCounts.set(word, (endingCounts.get(word) ?? 0) + 1));
    const repeatedEndings = [...endingCounts]
      .filter(([, count]) => count > 1)
      .map(([word, count]) => `${word} (${count})`);
    const longestSection = [...activeLyric.sections]
      .sort((left, right) => countWords(right.content) - countWords(left.content))[0];

    setInspirationLines([
      "Análisis local del texto; no utiliza IA externa ni inventa métricas.",
      `Secciones: ${activeLyric.sections.length} · versos: ${lines.length} · palabras: ${words.length}`,
      `Promedio: ${lines.length ? (words.length / lines.length).toFixed(1) : "0"} palabras por verso.`,
      repeatedEndings.length
        ? `Palabras finales repetidas exactamente: ${repeatedEndings.join(", ")}.`
        : "No se detectaron palabras finales repetidas exactamente.",
      longestSection && countWords(longestSection.content) > 0
        ? `Sección más extensa: ${longestSection.type.toUpperCase()} (${countWords(longestSection.content)} palabras).`
        : "Añade texto a una sección para obtener un análisis.",
    ]);
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
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = filename;
    anchor.click();
    window.setTimeout(() => URL.revokeObjectURL(url), 1000);
  };

  const exportFullBackup = () => {
    const backup = createInstintoBackup(notes, lyrics, projects, {
      title: newTitle,
      content: newContent,
      category: newCategory,
      tags: activeTags,
    });
    exportJson(backup, "instinto_backup_v1.json");
    setBackupStatus("Respaldo completo exportado, incluidos la papelera y el borrador actual.");
  };

  const importFullBackup = async (file?: File) => {
    if (!file) return;
    try {
      if (file.size > 10 * 1024 * 1024) {
        throw new Error("El respaldo supera el límite de 10 MB.");
      }
      const parsed: unknown = JSON.parse(await file.text());
      const backup = parseInstintoBackup(parsed);
      if (!window.confirm(
        `Se reemplazarán los datos locales de INSTINTO. Notas: ${backup.notes.length}; letras: ${backup.lyrics.length}; proyectos: ${backup.projects.length}. ¿Continuar?`,
      )) return;

      const restoredData = {
        notes: backup.notes,
        lyrics: backup.lyrics,
        projects: backup.projects,
        draft: backup.draft,
      };
      let restoredToFallback = false;
      try {
        await replaceInstintoData(restoredData);
      } catch (storageError) {
        restoredToFallback = persistInstintoFallbackData(restoredData);
        if (!restoredToFallback) {
          throw new Error("No se pudo restaurar: IndexedDB no está disponible y el almacenamiento alternativo no tiene capacidad suficiente o está bloqueado.");
        }
      }

      setNotes(backup.notes);
      setLyrics(backup.lyrics);
      setProjects(backup.projects);
      setNewTitle(backup.draft.title);
      setNewContent(backup.draft.content);
      setNewCategory(backup.draft.category);
      setActiveTags(backup.draft.tags);
      setDraft(backup.draft);
      setActiveLyric(backup.lyrics[0] ?? null);
      setStorageWarning(restoredToFallback ? "IndexedDB no disponible; el respaldo quedó guardado temporalmente en el almacenamiento alternativo y se sincronizará al recuperarse." : "");
      setBackupStatus(`Respaldo restaurado: ${backup.notes.length} notas, ${backup.lyrics.length} letras y ${backup.projects.length} proyectos.`);
    } catch (error) {
      setBackupStatus(error instanceof Error ? error.message : "No se pudo restaurar el respaldo.");
    } finally {
      if (backupFileRef.current) backupFileRef.current.value = "";
    }
  };

  const allTags = [...new Set(notes.flatMap((n) => n.tags).filter(Boolean))];

  const filtered = notes
    .filter((n) => !n.deleted || showTrash)
    .filter((n) => showTrash ? n.deleted : !n.deleted)
    .filter((n) => !showFavsOnly || n.favorite)
    .filter((n) => !search || n.content.toLowerCase().includes(search.toLowerCase()) || n.title.toLowerCase().includes(search.toLowerCase()))
    .filter((n) => filterTags.length === 0 || filterTags.every((t) => n.tags.includes(t)))
    .sort((a, b) => (b.pinned ? 1 : 0) - (a.pinned ? 1 : 0));

  const totalWords = notes.filter((n) => !n.deleted).reduce((acc, n) => acc + countWords(n.content), 0);
  const totalLyricVerses = lyrics.reduce((acc, l) => acc + l.sections.reduce((sa, s) => sa + countVerses(s.content), 0), 0);

  const NAV_ITEMS: { id: ViewMode; label: string }[] = [
    { id: "inicio", label: "INICIO" }, { id: "bloc", label: "NOTAS" }, { id: "letras", label: "LETRAS" },
    { id: "ideas", label: "IDEAS" }, { id: "proyectos", label: "PROYECTOS" }, { id: "exportar", label: "EXPORTAR" },
    { id: "universo", label: "UNIVERSO HBG" },
  ];

  if (!storageReady) {
    return <div role="status" style={{ padding: 24, color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 12 }}>Preparando almacenamiento local de INSTINTO…</div>;
  }

  return (
    <div>
      <div className="mod-header" style={{ "--mod-color": "var(--neon-cyan)" } as React.CSSProperties}>
        <span className="mod-icon">⬡</span>
        <div className="mod-title-group">
          <div className="mod-title">INSTINTO</div>
          <div className="mod-subtitle">// estudio creativo · notas · letras · ideas</div>
        </div>
        <div style={{ marginLeft: "auto", display: "flex", gap: 6 }}>
          {autoSaved && <span style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--neon-green)", alignSelf: "center" }}>✓ borrador guardado</span>}
          {storageWarning && <span role="status" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--neon-pink)", alignSelf: "center" }}>{storageWarning}</span>}
          <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 9 }} onClick={() => prepareRhymeDraft()}>♪ RIMA</button>
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
            <textarea ref={textRef} className="hbg-input hbg-textarea" placeholder="Escribe tu nota..." value={newContent} onChange={(e) => setNewContent(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && e.ctrlKey) addNote(); }} />
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
                <button key={tag} className="hbg-badge" style={{ cursor: "pointer", background: filterTags.includes(tag) ? "rgba(0,229,255,0.12)" : undefined, borderColor: filterTags.includes(tag) ? "var(--neon-cyan)" : "var(--border-dim)", color: filterTags.includes(tag) ? "var(--neon-cyan)" : "var(--text-muted)" }} onClick={() => setFilterTags((prev) => prev.includes(tag) ? prev.filter(t => t !== tag) : [...prev, tag])}>
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
          <div className="hbg-card" style={{ marginBottom: 14, borderColor: "rgba(255,64,129,0.35)" }}>
            <div className="section-title">// generador de canciones · INSTINTO SONGWRITER</div>
            <input
              className="hbg-input"
              placeholder="Título de la canción (opcional)…"
              value={songTitle}
              onChange={(event) => setSongTitle(event.target.value)}
              maxLength={100}
              style={{ marginBottom: 8 }}
            />
            <textarea
              className="hbg-input hbg-textarea"
              placeholder="Describe la historia, emoción o idea central de la canción…"
              value={songConcept}
              onChange={(event) => setSongConcept(event.target.value)}
              maxLength={1200}
              rows={3}
              style={{ marginBottom: 8 }}
            />
            <div style={{ display: "flex", gap: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select className="hbg-input" value={songGenre} onChange={(event) => setSongGenre(event.target.value)} style={{ flex: 1, minWidth: 130 }}>
                <option value="pop">Pop</option>
                <option value="urbano">Urbano</option>
                <option value="rap">Rap / Hip-hop</option>
                <option value="rock">Rock</option>
                <option value="regional">Regional</option>
                <option value="balada">Balada</option>
                <option value="libre">Libre / experimental</option>
              </select>
              <button className="hbg-btn hbg-btn-primary" onClick={() => void generateSong()} disabled={songGenerationBusy || songConcept.trim().length < 8}>
                {songGenerationBusy ? "GENERANDO…" : "♪ GENERAR CANCIÓN"}
              </button>
            </div>
            {songGenerationStatus && <div role="status" style={{ marginTop: 8, fontFamily: "var(--font-mono)", fontSize: 10, lineHeight: 1.6, color: "var(--text-muted)" }}>{songGenerationStatus}</div>}
            <div style={{ marginTop: 6, fontFamily: "var(--font-mono)", fontSize: 9, color: "var(--text-muted)" }}>
              La generación remota requiere HBG Core con IA configurada. Sin conexión se crea un esquema local editable. Cada canción nueva se guarda aparte; no sobrescribe tus letras.
            </div>
          </div>
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
                    <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 9, padding: "4px 8px" }} onClick={runInspiration}>◈ ANALIZAR</button>
                  </div>
                </div>

                <div style={{ display: "flex", gap: 5, marginBottom: 10, flexWrap: "wrap" }}>
                  {(["verso", "coro", "puente", "outro"] as LyricSection["type"][]).map((t) => (
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
              <button className="hbg-btn hbg-btn-primary w-full" style={{ marginBottom: 8 }} onClick={prepareIdeaDraft}>
                ◈ GENERAR IDEA
              </button>
              <button className="hbg-btn hbg-btn-ghost w-full" onClick={() => prepareRhymeDraft("notas")}>
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
          <div className="hbg-card" style={{ marginBottom: 14 }}>
            <div className="section-title">// nuevo proyecto</div>
            <input
              className="hbg-input"
              placeholder="Nombre del proyecto..."
              value={newProjectName}
              onChange={(event) => setNewProjectName(event.target.value)}
              maxLength={100}
              style={{ marginBottom: 8 }}
            />
            <textarea
              className="hbg-input hbg-textarea"
              placeholder="Descripción (opcional)..."
              value={newProjectDescription}
              onChange={(event) => setNewProjectDescription(event.target.value)}
              maxLength={1000}
              rows={3}
              style={{ marginBottom: 8 }}
            />
            <button className="hbg-btn hbg-btn-primary" disabled={!newProjectName.trim()} onClick={addProject}>
              + CREAR PROYECTO
            </button>
          </div>
          <div className="section-title">// proyectos guardados</div>
          {projects.length === 0 ? (
            <div className="hbg-card" style={{ color: "var(--text-muted)", fontFamily: "var(--font-mono)", fontSize: 10 }}>
              // Aún no hay proyectos. Crea el primero arriba.
            </div>
          ) : (
            <div className="hbg-list" style={{ gap: 10, marginBottom: 16 }}>
              {projects.map((p) => (
                <div key={p.id} className="hbg-card hbg-card-accent" style={{ "--card-color": p.color } as React.CSSProperties}>
                  <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 6 }}>
                    <div style={{ fontFamily: "var(--font-display)", fontSize: 13, fontWeight: 700, letterSpacing: "0.08em", color: p.color }}>{p.name}</div>
                    <span className="hbg-badge" style={{ background: `${STATUS_COLORS[p.status]}12`, borderColor: `${STATUS_COLORS[p.status]}40`, color: STATUS_COLORS[p.status] }}>{STATUS_LABEL[p.status]}</span>
                  </div>
                  <div style={{ fontFamily: "var(--font-ui)", fontSize: 13, color: "var(--text-secondary)" }}>{p.description || "Sin descripción."}</div>
                  <div style={{ display: "flex", gap: 6, marginTop: 10, flexWrap: "wrap" }}>
                    <button className="hbg-btn hbg-btn-ghost" style={{ fontSize: 9, padding: "4px 8px" }} onClick={() => saveProjects(projects.map((pr) => pr.id === p.id ? { ...pr, status: "en_progreso" } : pr))}>EN PROGRESO</button>
                    <button className="hbg-btn hbg-btn-success" style={{ fontSize: 9, padding: "4px 8px" }} onClick={() => saveProjects(projects.map((pr) => pr.id === p.id ? { ...pr, status: "completado" } : pr))}>COMPLETAR</button>
                    <button className="hbg-btn hbg-btn-danger" style={{ fontSize: 9, padding: "4px 8px" }} onClick={() => saveProjects(projects.filter((pr) => pr.id !== p.id))}>ELIMINAR</button>
                  </div>
                </div>
              ))}
            </div>
          )}
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
                <button className="hbg-btn hbg-btn-ghost w-full" onClick={exportFullBackup}>↓ BACKUP COMPLETO</button>
                <button className="hbg-btn hbg-btn-ghost w-full" onClick={() => backupFileRef.current?.click()}>↑ RESTAURAR BACKUP</button>
                <input
                  ref={backupFileRef}
                  type="file"
                  accept=".json,application/json"
                  style={{ display: "none" }}
                  onChange={(event) => void importFullBackup(event.target.files?.[0])}
                />
                {backupStatus && <div role="status" style={{ fontFamily: "var(--font-mono)", fontSize: 9, color: backupStatus.startsWith("No se pudo") || backupStatus.startsWith("El respaldo") || backupStatus.startsWith("El archivo") ? "var(--neon-pink)" : "var(--neon-green)", marginTop: 8 }}>{backupStatus}</div>}
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
