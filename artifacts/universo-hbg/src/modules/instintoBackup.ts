export type InstintoCategory = "notas" | "letras" | "ideas" | "reflexiones";

export interface InstintoNote {
  id: string;
  title: string;
  content: string;
  category: InstintoCategory;
  createdAt: string;
  updatedAt: string;
  pinned: boolean;
  favorite: boolean;
  tags: string[];
  deleted: boolean;
}

export interface InstintoLyricSection {
  id: string;
  type: "intro" | "verso" | "coro" | "puente" | "outro";
  content: string;
}

export interface InstintoLyric {
  id: string;
  title: string;
  album?: string;
  sections: InstintoLyricSection[];
  createdAt: string;
  updatedAt: string;
}

export interface InstintoProject {
  id: string;
  name: string;
  description: string;
  status: "borrador" | "en_progreso" | "completado";
  color: string;
  createdAt: string;
}

export interface InstintoDraft {
  title: string;
  content: string;
  category: InstintoCategory;
  tags: string[];
}

export interface InstintoBackup {
  format: "hbg-instinto-backup-v1";
  exportedAt: string;
  notes: InstintoNote[];
  lyrics: InstintoLyric[];
  projects: InstintoProject[];
  draft: InstintoDraft;
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function isText(value: unknown, maxLength: number): value is string {
  return typeof value === "string" && value.length <= maxLength;
}

function isDate(value: unknown): value is string {
  return typeof value === "string" && Number.isFinite(Date.parse(value));
}

function isCategory(value: unknown): value is InstintoCategory {
  return value === "notas" || value === "letras" || value === "ideas" || value === "reflexiones";
}

function isStringArray(value: unknown, maxItems: number, maxLength: number): value is string[] {
  return Array.isArray(value) && value.length <= maxItems &&
    value.every((item) => isText(item, maxLength));
}

function isNote(value: unknown): value is InstintoNote {
  if (!isRecord(value)) return false;
  return isText(value.id, 100) && value.id.length > 0 &&
    isText(value.title, 500) && isText(value.content, 100_000) &&
    isCategory(value.category) && isDate(value.createdAt) && isDate(value.updatedAt) &&
    typeof value.pinned === "boolean" && typeof value.favorite === "boolean" &&
    isStringArray(value.tags, 30, 64) && typeof value.deleted === "boolean";
}

function isLyricSection(value: unknown): value is InstintoLyricSection {
  if (!isRecord(value)) return false;
  return isText(value.id, 100) && value.id.length > 0 &&
    (value.type === "intro" || value.type === "verso" || value.type === "coro" ||
      value.type === "puente" || value.type === "outro") &&
    isText(value.content, 100_000);
}

function isLyric(value: unknown): value is InstintoLyric {
  if (!isRecord(value)) return false;
  return isText(value.id, 100) && value.id.length > 0 &&
    isText(value.title, 500) && (value.album === undefined || isText(value.album, 500)) &&
    Array.isArray(value.sections) && value.sections.length <= 200 &&
    value.sections.every(isLyricSection) && isDate(value.createdAt) && isDate(value.updatedAt);
}

function isProject(value: unknown): value is InstintoProject {
  if (!isRecord(value)) return false;
  return isText(value.id, 100) && value.id.length > 0 &&
    isText(value.name, 500) && value.name.trim().length > 0 &&
    isText(value.description, 10_000) &&
    (value.status === "borrador" || value.status === "en_progreso" || value.status === "completado") &&
    isText(value.color, 100) && isDate(value.createdAt);
}

function isDraft(value: unknown): value is InstintoDraft {
  if (!isRecord(value)) return false;
  return isText(value.title, 500) && isText(value.content, 100_000) &&
    isCategory(value.category) && isStringArray(value.tags, 30, 64);
}

export function createInstintoBackup(
  notes: InstintoNote[],
  lyrics: InstintoLyric[],
  projects: InstintoProject[],
  draft: InstintoDraft,
  exportedAt = new Date().toISOString(),
): InstintoBackup {
  return {
    format: "hbg-instinto-backup-v1",
    exportedAt,
    notes,
    lyrics,
    projects,
    draft,
  };
}

export function parseInstintoBackup(value: unknown): InstintoBackup {
  if (
    !isRecord(value) ||
    value.format !== "hbg-instinto-backup-v1" ||
    !isDate(value.exportedAt) ||
    !Array.isArray(value.notes) || value.notes.length > 10_000 ||
    !value.notes.every(isNote) ||
    !Array.isArray(value.lyrics) || value.lyrics.length > 2_000 ||
    !value.lyrics.every(isLyric) ||
    !Array.isArray(value.projects) || value.projects.length > 2_000 ||
    !value.projects.every(isProject) ||
    !isDraft(value.draft)
  ) {
    throw new Error("El archivo no es un respaldo válido de INSTINTO o supera los límites permitidos.");
  }

  return {
    format: "hbg-instinto-backup-v1",
    exportedAt: value.exportedAt,
    notes: value.notes,
    lyrics: value.lyrics,
    projects: value.projects,
    draft: value.draft,
  };
}
