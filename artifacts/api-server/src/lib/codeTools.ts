import { existsSync, readFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";

function findWorkspaceRoot(startDirectory: string): string {
  let directory = path.resolve(startDirectory);
  while (true) {
    const manifest = path.join(directory, "package.json");
    if (existsSync(manifest)) {
      const parsed: unknown = JSON.parse(readFileSync(manifest, "utf8"));
      if (
        typeof parsed === "object" &&
        parsed !== null &&
        "name" in parsed &&
        parsed.name === "workspace"
      ) {
        return directory;
      }
    }
    const parent = path.dirname(directory);
    if (parent === directory) {
      throw new Error("No se encontró la raíz del workspace; Code Tools permanece indisponible.");
    }
    directory = parent;
  }
}

const WORKSPACE_ROOT = findWorkspaceRoot(process.cwd());
const MAX_READ_BYTES = 256 * 1024;
const PROTECTED_SEGMENTS = new Set([
  ".git",
  "node_modules",
  ".ssh",
]);
const PROTECTED_FILES = new Set([
  "artifacts/api-server/src/lib/hbgAuth.ts",
  "artifacts/api-server/src/lib/audit.ts",
  "artifacts/api-server/src/lib/codeTools.ts",
  "artifacts/api-server/src/routes/auth.ts",
  "artifacts/api-server/src/routes/index.ts",
  "artifacts/api-server/src/routes/tools.ts",
  "artifacts/api-server/src/app.ts",
  "lib/db/src/schema/hbg.ts",
]);

function normalizedRelativePath(relativePath: string): string {
  if (
    typeof relativePath !== "string" ||
    relativePath.length === 0 ||
    relativePath.length > 512 ||
    relativePath.includes("\0") ||
    path.isAbsolute(relativePath)
  ) {
    throw new Error("Ruta no válida.");
  }
  const portablePath = relativePath.replaceAll("\\", "/");
  if (portablePath.split("/").some((segment) => segment === "..")) {
    throw new Error("Path traversal bloqueado.");
  }
  const normalized = path.posix.normalize(portablePath);
  const segments = normalized.split("/");
  if (
    normalized === "." ||
    segments.some((segment) => PROTECTED_SEGMENTS.has(segment) || segment.startsWith(".env")) ||
    /\.(?:pem|key|secret)$/i.test(normalized) ||
    PROTECTED_FILES.has(normalized)
  ) {
    throw new Error("Recurso protegido.");
  }
  return normalized;
}

async function safeAbsolutePath(
  relativePath: string,
): Promise<string> {
  const normalized = normalizedRelativePath(relativePath);
  const root = await fs.realpath(WORKSPACE_ROOT);
  const target = path.resolve(root, normalized);
  const relative = path.relative(root, target);
  if (relative === ".." || relative.startsWith(`..${path.sep}`) || path.isAbsolute(relative)) {
    throw new Error("La ruta sale del workspace.");
  }

  const segments = relative.split(path.sep).filter(Boolean);
  let current = root;
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    const stat = await fs.lstat(current);
    if (stat.isSymbolicLink()) throw new Error("No se permiten enlaces simbólicos.");
    if (index < segments.length - 1 && !stat.isDirectory()) {
      throw new Error("Un componente de la ruta no es una carpeta.");
    }
  }
  return target;
}

export async function inspectFile(relativePath: string) {
  const filename = await safeAbsolutePath(relativePath);
  const stat = await fs.lstat(filename);
  if (!stat.isFile()) throw new Error("El recurso no es un archivo.");
  if (stat.size > MAX_READ_BYTES) {
    throw new Error("El archivo excede el límite de lectura.");
  }
  return {
    path: normalizedRelativePath(relativePath),
    size: stat.size,
    content: await fs.readFile(filename, "utf8"),
  };
}

export async function listFiles(relativePath = ".") {
  const directory = relativePath === "." ? await fs.realpath(WORKSPACE_ROOT) : await safeAbsolutePath(relativePath);
  const directoryStat = await fs.lstat(directory);
  if (!directoryStat.isDirectory()) throw new Error("El recurso no es una carpeta.");
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) =>
      !entry.isSymbolicLink() &&
      !PROTECTED_SEGMENTS.has(entry.name) &&
      !entry.name.startsWith(".env")
    )
    .slice(0, 500)
    .map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? "directory" : "file",
    }));
}

export async function writeFile(
  relativePath: string,
  content: string,
): Promise<{ path: string; bytes: number }> {
  void relativePath;
  void content;
  throw new Error(
    "Las modificaciones de Code Tools están bloqueadas hasta implementar autorización individual server-side.",
  );
}

export async function deleteFile(relativePath: string): Promise<{ path: string }> {
  void relativePath;
  throw new Error(
    "Las modificaciones de Code Tools están bloqueadas hasta implementar autorización individual server-side.",
  );
}

export async function runSafeWorkspaceScript(
  packageName: string,
  script: string,
): Promise<{ code: number; output: string }> {
  void packageName;
  void script;
  throw new Error(
    "La ejecución de comandos de Code Tools está bloqueada hasta verificar aislamiento y autorización individual.",
  );
}