/**
 * INSTINTO inspiration engine.
 *
 * Adapted from the reusable IdeaGenerator and RhymeEngine in
 * lib-hbg-ecosystem-v2.zip. This module only generates draft text:
 * it never saves notes or changes user data automatically.
 */

export type InstintoMood =
  | "energized"
  | "focused"
  | "creative"
  | "relaxed"
  | "neutral";

const IDEA_STARTERS: Record<InstintoMood, string[]> = {
  energized: [
    "App de productividad gamificada con ritmo — cada tarea completada genera un beat",
    "¿Qué pasaría si combinamos energía con tecnología?",
    "Idea: una experiencia inmersiva que fusione música y movimiento",
    "¿Podemos crear algo que genere adrenalina y propósito al mismo tiempo?",
    "Concepto: plataforma de productividad gamificada con ritmo",
  ],
  focused: [
    "Mapa mental visual sincronizado con el estado de ánimo en tiempo real",
    "Sistema de trabajo en bloques de 25 minutos con recompensas sonoras",
    "Idea: mapa mental visual sincronizado con el estado de ánimo",
    "Protocolo de deep work con música procedural adaptativa",
    "Concepto: dashboard de métricas personales en tiempo real",
  ],
  creative: [
    "Arte generativo basado en patrones de hábitos diarios",
    "¿Qué forma tomaría este concepto si fuera música?",
    "Idea: proyecto que mezcle géneros artísticos inesperados",
    "Experimento: crear sin reglas durante 10 minutos",
    "Concepto: arte generativo basado en patrones de hábitos",
  ],
  relaxed: [
    "Sistema de notas que cambia de color según el humor detectado",
    "Reflexión: ¿qué aspectos de tu vida necesitan más fluidez?",
    "Idea: espacio digital minimalista para pensamiento profundo",
    "Concepto: diario de gratitud sincronizado con la música del día",
    "¿Qué proyecto puedes simplificar eliminando lo no esencial?",
  ],
  neutral: [
    "Idea sin filtros: escribe lo primero que venga a la mente",
    "Concepto nuevo: combina dos cosas que no tienen relación aparente",
    "¿Qué problema cotidiano podrías resolver de forma creativa?",
    "Reflexión: ¿en qué estás creciendo esta semana?",
  ],
};

const RHYME_TEMPLATES: Record<InstintoMood, string[]> = {
  energized: [
    "{word} con fuego y pasión / el ritmo es mi canción",
    "Cuando escucho {word} siento el beat / la energía en cada pie",
    "{word} en el aire flota / la música nos agota / pero nunca nos derrota",
  ],
  focused: [
    "{word} en la mente clara / la concentración no para",
    "Con {word} y determinación / construyo mi evolución",
    "{word} como ancla y norte / el trabajo es mi reporte",
  ],
  creative: [
    "{word} nace del alma / en la tormenta hay calma",
    "La chispa de {word} / enciende lo que el tiempo olvidó",
    "{word} pintado en el lienzo / mi arte nunca es tenso",
  ],
  relaxed: [
    "{word} como brisa suave / que el tiempo lento se abra",
    "En {word} encuentro paz / la vida fluye sin más",
    "{word} al ritmo del mar / dejarse llevar",
  ],
  neutral: [
    "{word} en el viento va / buscando su lugar",
    "Con {word} en el corazón / la vida tiene razón",
    "{word} es el comienzo / del camino que pienso",
  ],
};

const HOOKS: Record<InstintoMood, string[]> = {
  energized: [
    "El fuego no se apaga, se renueva / move the crowd, mueve la ciudad",
    "Move the crowd, mueve la ciudad",
    "Sin parar, sin parar, el ritmo va",
  ],
  focused: [
    "La mente clara, el camino abierto / nada está cerrado lo que fue descubierto",
    "Deep work, deep soul, deep flow",
    "Un paso a la vez, el éxito es certero",
  ],
  creative: [
    "Del caos nace la obra maestra / soy el arquitecto de mi propia orquesta",
    "Crea sin miedo, arde sin quema / el arte que fluye nunca se frena",
    "La imaginación es la única regla",
  ],
  relaxed: [
    "Fluye, fluye, todo pasa",
    "La paz es el ritmo que abraza",
    "Sin prisa, sin pausa, sin peso",
  ],
  neutral: [
    "Cada palabra un disparo de luz / en el universo HBG soy la voz y la cruz",
    "Cada momento es el comienzo",
    "La historia se escribe hoy",
    "En el simple está lo eterno",
  ],
};

const WRITING_PROMPTS: Record<InstintoMood, string> = {
  energized: "Escribe sobre la última vez que te sentiste imparable.",
  focused: "Describe tu sistema ideal de trabajo en 3 reglas.",
  creative: "Mezcla dos ideas totalmente opuestas en un concepto nuevo.",
  relaxed: "¿Qué simplicidad te ha dado más valor en la vida?",
  neutral: "¿Qué quieres recordar de este momento dentro de un año?",
};

const SEED_WORDS: Record<InstintoMood, string[]> = {
  energized: ["fuego", "ritmo", "poder", "beat", "baile"],
  focused: ["mente", "meta", "trabajo", "código", "visión"],
  creative: ["arte", "sueño", "color", "idea", "alma"],
  relaxed: ["paz", "brisa", "calma", "silencio", "mar"],
  neutral: ["tiempo", "vida", "momento", "ser", "hoy"],
};

const STOPWORDS = new Set([
  "para", "como", "esto", "esos", "esta", "todo", "cada", "pero",
  "desde", "sobre", "entre", "cuando", "donde", "porque",
]);

function pick<T>(items: readonly T[], random: () => number): T {
  const rawIndex = Math.floor(random() * items.length);
  const index = Math.max(0, Math.min(items.length - 1, rawIndex));
  return items[index];
}

function extractKeywords(text: string): string[] {
  const words = text.toLocaleLowerCase("es").match(/[\p{L}\p{N}]{4,}/gu) ?? [];
  return [...new Set(words.filter((word) => !STOPWORDS.has(word)))].slice(0, 3);
}

export function resolveInstintoMood(value: unknown): InstintoMood {
  switch (value) {
    case "energia":
    case "party":
    case "energized":
      return "energized";
    case "enfocado":
    case "focus":
    case "focused":
      return "focused";
    case "creativo":
    case "creative":
      return "creative";
    case "relajado":
    case "chill":
    case "relaxed":
      return "relaxed";
    case "neutral":
    case "normal":
    default:
      return "neutral";
  }
}

export function generateInstintoIdea(
  mood: InstintoMood = "neutral",
  context = "",
  random: () => number = Math.random,
): string {
  const base = pick(IDEA_STARTERS[mood], random);
  const keywords = extractKeywords(context);
  return keywords.length ? `${base} — aplicado a: ${keywords.join(", ")}` : base;
}

export function generateInstintoRhyme(
  seedWord = "",
  mood: InstintoMood = "neutral",
  random: () => number = Math.random,
): string {
  const word = seedWord.trim() || pick(SEED_WORDS[mood], random);
  return pick(RHYME_TEMPLATES[mood], random).replaceAll("{word}", word);
}

export function generateInstintoVerse(
  topic: string,
  mood: InstintoMood = "neutral",
  lines = 4,
  random: () => number = Math.random,
): string {
  const words = extractKeywords(topic);
  const safeLineCount = Math.max(1, Math.min(8, Math.floor(lines) || 1));
  return Array.from({ length: safeLineCount }, (_, index) =>
    generateInstintoRhyme(words[index % words.length] ?? (topic.trim() || "alma"), mood, random),
  ).join("\n");
}

export function generateInstintoHook(
  mood: InstintoMood = "neutral",
  random: () => number = Math.random,
): string {
  return pick(HOOKS[mood], random);
}

export function getInstintoWritingPrompt(mood: InstintoMood = "neutral"): string {
  return WRITING_PROMPTS[mood];
}
