/**
 * INSTINTO Songwriter.
 *
 * Builds a bounded, editable song draft without touching existing lyrics.
 * Remote AI generation is requested by the UI through the authenticated HBG
 * Core endpoint; this module provides parsing and an honest offline scaffold.
 */

export type InstintoSongSectionType = "verso" | "coro" | "puente" | "outro";

export interface InstintoSongSection {
  id: string;
  type: InstintoSongSectionType;
  content: string;
}

export interface InstintoSongRequest {
  title?: string;
  concept: string;
  genre?: string;
}

const MAX_CONCEPT_LENGTH = 1_200;
const MAX_TITLE_LENGTH = 100;
const MAX_GENERATED_LENGTH = 20_000;
const MAX_SECTIONS = 20;

function cleanText(value: unknown, maxLength: number): string {
  return typeof value === "string" ? value.trim().slice(0, maxLength) : "";
}

export function buildInstintoSongPrompt(request: InstintoSongRequest): string {
  const title = cleanText(request.title, MAX_TITLE_LENGTH);
  const concept = cleanText(request.concept, MAX_CONCEPT_LENGTH);
  const genre = cleanText(request.genre, 60) || "libre";
  if (concept.length < 8) {
    throw new Error("Describe la idea de la canción con al menos 8 caracteres.");
  }

  return [
    "Escribe una canción original completa en español a partir de esta idea.",
    "Género o dirección musical: " + genre + ".",
    title ? "Título propuesto: " + title + "." : "Propón un título breve y coherente.",
    "Idea central del usuario: " + concept,
    "Reglas creativas obligatorias:",
    "- Comienza directamente con la letra narrativa: NO escribas una introducción separada ni una sección INTRO.",
    "- Desarrolla una historia coherente, con imágenes concretas, progresión emocional y lenguaje natural.",
    "- Escribe versos completos, un coro memorable, un segundo verso y, si encaja, un puente y coro final.",
    "- Cuida ritmo, musicalidad, rimas naturales y evita repetir frases solo para rellenar.",
    "- No imites la voz, letra ni estilo exacto de artistas existentes.",
    "- No expliques el proceso ni agregues comentarios fuera de la canción.",
    "Devuelve únicamente el texto con estos encabezados cuando correspondan: [VERSO 1], [CORO], [VERSO 2], [PUENTE], [CORO FINAL], [OUTRO].",
  ].join("\n");
}

function sectionType(label: string): InstintoSongSectionType | null {
  const normalized = label.normalize("NFD").replace(/[\u0300-\u036f]/g, "").toLowerCase();
  if (normalized.startsWith("verso") || normalized.startsWith("estrofa")) return "verso";
  if (normalized.startsWith("coro") || normalized.startsWith("estribillo")) return "coro";
  if (normalized.startsWith("puente")) return "puente";
  if (normalized.startsWith("outro") || normalized.startsWith("cierre")) return "outro";
  // An INTRO is deliberately folded into the opening verse, never exposed as
  // a separate section, so the song starts with its narrative lyric.
  if (normalized.startsWith("intro")) return "verso";
  return null;
}

export function parseInstintoSongSections(value: string): InstintoSongSection[] {
  const text = cleanText(value, MAX_GENERATED_LENGTH);
  if (!text) throw new Error("El generador devolvió una canción vacía.");

  const sections: InstintoSongSection[] = [];
  let currentType: InstintoSongSectionType = "verso";
  let currentLines: string[] = [];
  const flush = () => {
    const content = currentLines.join("\n").trim();
    if (!content) return;
    const previous = sections[sections.length - 1];
    if (previous?.type === currentType) {
      previous.content += "\n" + content;
      return;
    }
    sections.push({
      id: "generated-" + String(sections.length + 1),
      type: currentType,
      content,
    });
  };

  for (const line of text.split(/\r?\n/)) {
    const heading = line.trim().match(/^\[([^\]]{1,40})\]$/);
    if (heading) {
      flush();
      currentLines = [];
      currentType = sectionType(heading[1]) ?? currentType;
      continue;
    }
    currentLines.push(line);
  }
  flush();

  if (sections.length === 0) {
    sections.push({ id: "generated-1", type: "verso", content: text });
  }
  if (sections.length > MAX_SECTIONS) {
    throw new Error("La canción generada contiene demasiadas secciones.");
  }
  return sections;
}

export function generateInstintoLocalSongScaffold(
  request: InstintoSongRequest,
): InstintoSongSection[] {
  const concept = cleanText(request.concept, MAX_CONCEPT_LENGTH);
  if (concept.length < 8) {
    throw new Error("Describe la idea de la canción con al menos 8 caracteres.");
  }
  const subject = concept.replace(/[.!?]+$/g, "");
  return [
    {
      id: "local-verse-1",
      type: "verso",
      content: [
        "Todo comienza con " + subject + ",",
        "una verdad que no se deja esconder,",
        "cada paso va contando la historia,",
        "y todavía queda mucho por resolver.",
      ].join("\n"),
    },
    {
      id: "local-chorus",
      type: "coro",
      content: [
        "Que se escuche, que no quede en silencio,",
        "lo que llevo dentro hoy quiere salir,",
        "si la vida cambia el rumbo del tiempo,",
        "esta historia todavía está por escribir.",
      ].join("\n"),
    },
    {
      id: "local-verse-2",
      type: "verso",
      content: [
        "No hay camino que se escriba de golpe,",
        "ni respuesta que aparezca sin andar,",
        "cada herida puede abrir otro horizonte,",
        "cada voz tiene algo nuevo que contar.",
      ].join("\n"),
    },
    {
      id: "local-bridge",
      type: "puente",
      content: [
        "Y si la noche vuelve a preguntar,",
        "que responda lo que fuimos capaces de crear.",
      ].join("\n"),
    },
    {
      id: "local-chorus-final",
      type: "coro",
      content: [
        "Que se escuche, que no quede en silencio,",
        "lo que llevo dentro hoy quiere salir,",
        "si la vida cambia el rumbo del tiempo,",
        "esta historia todavía está por escribir.",
      ].join("\n"),
    },
  ];
}
