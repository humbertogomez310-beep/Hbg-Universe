import { randomUUID } from "node:crypto";
import { constants, existsSync, readFileSync } from "node:fs";
import { promises as fs } from "node:fs";
import path from "node:path";
import type { HBGAuthContext } from "./hbgAuth";

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
const MAX_WRITE_BYTES = 1024 * 1024;
const PROTECTED_SEGMENTS = new Set([
  ".git", "node_modules", ".ssh", ".aws", ".azure", ".docker", ".kube",
  ".gnupg", ".pki", ".terraform", ".config", ".npm",
]);
const PROTECTED_FILE_NAMES = new Set([
  ".npmrc", ".pypirc", ".netrc", ".git-credentials", "id_rsa",
  "id_ed25519", "id_ecdsa", "credentials", "credentials.json",
  "secrets.json", "secrets.yaml", "secrets.yml", "service-account.json",
  "service-account-key.json",
]);
const PROTECTED_FILES = new Set([
  "artifacts/api-server/src/lib/hbgAuth.ts",
  "artifacts/api-server/src/lib/audit.ts",
  "artifacts/api-server/src/lib/codeTools.ts",
  "artifacts/api-server/src/lib/permissionGrants.ts",
  "artifacts/api-server/src/lib/registry.ts",
  "artifacts/api-server/src/lib/terminadorAuthorization.ts",
  "artifacts/api-server/src/routes/auth.ts",
  "artifacts/api-server/src/routes/audit.ts",
  "artifacts/api-server/src/routes/index.ts",
  "artifacts/api-server/src/routes/permission-grants.ts",
  "artifacts/api-server/src/routes/registry.ts",
  "artifacts/api-server/src/routes/terminador.ts",
  "artifacts/api-server/src/routes/tools.ts",
  "artifacts/api-server/src/app.ts",
  "artifacts/api-server/src/middlewares/authMiddleware.ts",
  "lib/db/src/schema/hbg.ts",
]);

function isProtectedEntryName(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    PROTECTED_SEGMENTS.has(normalized) ||
    normalized.startsWith(".env") ||
    PROTECTED_FILE_NAMES.has(normalized) ||
    /^(?:credentials?|secrets?|tokens?|access[-_]?token|refresh[-_]?token|service[-_]?account)(?:[._-].*)?$/.test(normalized) ||
    /\.(?:pem|key|secret|p12|pfx|jks|keystore|tfstate|tfstate\.backup)$/i.test(normalized)
  );
}

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
  if (
    portablePath.startsWith("/") ||
    /^[a-zA-Z]:/.test(portablePath) ||
    portablePath.split("/").some((segment) => !segment || segment === "." || segment === "..")
  ) {
    throw new Error("Path traversal bloqueado.");
  }

  const segments = portablePath.split("/");
  if (
    segments.some(isProtectedEntryName) ||
    PROTECTED_FILES.has(portablePath) ||
    !segments.every((segment) => /^[a-zA-Z0-9_.@-]+$/.test(segment))
  ) {
    throw new Error("Recurso protegido o ruta no permitida.");
  }

  return portablePath;
}

function isWithinWorkspace(root: string, target: string): boolean {
  const relative = path.relative(root, target);
  return (
    relative !== ".." &&
    !relative.startsWith(`..${path.sep}`) &&
    !path.isAbsolute(relative)
  );
}

function isNotFound(error: unknown): boolean {
  return (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    error.code === "ENOENT"
  );
}

async function safeParentDirectory(root: string, target: string): Promise<string> {
  const expectedParent = path.dirname(target);
  const parent = await fs.realpath(expectedParent);
  if (parent !== expectedParent || !isWithinWorkspace(root, parent)) {
    throw new Error("La carpeta de destino cambió o sale del workspace.");
  }
  const stat = await fs.lstat(parent);
  if (stat.isSymbolicLink() || !stat.isDirectory()) {
    throw new Error("La carpeta de destino no es un directorio regular.");
  }
  return parent;
}

async function safeAbsolutePath(
  relativePath: string,
  allowMissingLeaf = false,
): Promise<string> {
  const normalized = normalizedRelativePath(relativePath);
  const root = await fs.realpath(WORKSPACE_ROOT);
  const target = path.resolve(root, ...normalized.split("/"));
  if (!isWithinWorkspace(root, target)) {
    throw new Error("La ruta sale del workspace.");
  }

  const segments = path.relative(root, target).split(path.sep).filter(Boolean);
  let current = root;
  for (let index = 0; index < segments.length; index += 1) {
    current = path.join(current, segments[index]);
    let stat;
    try {
      stat = await fs.lstat(current);
    } catch (error) {
      if (allowMissingLeaf && index === segments.length - 1 && isNotFound(error)) {
        return target;
      }
      throw error;
    }

    if (stat.isSymbolicLink()) {
      throw new Error("No se permiten enlaces simbólicos.");
    }
    if (index < segments.length - 1 && !stat.isDirectory()) {
      throw new Error("Un componente de la ruta no es una carpeta.");
    }
    if (index === segments.length - 1 && !stat.isFile() && !stat.isDirectory()) {
      throw new Error("El recurso no es un archivo ni una carpeta regular.");
    }
  }
  return target;
}

async function assertWriteGrant(
  context: HBGAuthContext | undefined,
  resourcePath: string,
): Promise<void> {
  if (!context) {
    throw new Error("Se requiere un contexto autenticado de HBG Authority.");
  }
  const { assertPermissionGrant } = await import("./permissionGrants");
  await assertPermissionGrant(context, resourcePath);
}

export async function inspectFile(relativePath: string) {
  const filename = await safeAbsolutePath(relativePath);
  const root = await fs.realpath(WORKSPACE_ROOT);
  await safeParentDirectory(root, filename);

  // O_NOFOLLOW prevents a last-moment symlink swap between path validation and open.
  const handle = await fs.open(filename, constants.O_RDONLY | constants.O_NOFOLLOW);
  try {
    const stat = await handle.stat();
    if (!stat.isFile()) throw new Error("El recurso no es un archivo regular.");
    if (stat.size > MAX_READ_BYTES) {
      throw new Error("El archivo excede el límite de lectura.");
    }
    return {
      path: normalizedRelativePath(relativePath),
      size: stat.size,
      content: await handle.readFile("utf8"),
    };
  } finally {
    await handle.close();
  }
}

export async function listFiles(relativePath = ".") {
  const directory =
    relativePath === "."
      ? await fs.realpath(WORKSPACE_ROOT)
      : await safeAbsolutePath(relativePath);
  const root = await fs.realpath(WORKSPACE_ROOT);
  const canonicalDirectory = await fs.realpath(directory);
  if (canonicalDirectory !== directory || !isWithinWorkspace(root, canonicalDirectory)) {
    throw new Error("La carpeta cambió o sale del workspace.");
  }
  const directoryStat = await fs.lstat(directory);
  if (directoryStat.isSymbolicLink() || !directoryStat.isDirectory()) {
    throw new Error("El recurso no es una carpeta regular.");
  }
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) =>
      !entry.isSymbolicLink() &&
      !isProtectedEntryName(entry.name)
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
  context?: HBGAuthContext,
): Promise<{ path: string; bytes: number }> {
  const normalized = normalizedRelativePath(relativePath);
  if (typeof content !== "string") throw new Error("El contenido debe ser texto.");
  const bytes = Buffer.byteLength(content, "utf8");
  if (bytes > MAX_WRITE_BYTES) {
    throw new Error("El contenido excede el límite de escritura.");
  }

  await assertWriteGrant(context, normalized);
  const target = await safeAbsolutePath(normalized, true);
  const root = await fs.realpath(WORKSPACE_ROOT);
  const parent = await safeParentDirectory(root, target);

  const destination = path.join(parent, path.basename(target));
  let mode = 0o600;
  try {
    const existing = await fs.lstat(destination);
    if (existing.isSymbolicLink() || !existing.isFile()) {
      throw new Error("Solo se pueden reemplazar archivos regulares.");
    }
    mode = existing.mode & 0o777;
  } catch (error) {
    if (!isNotFound(error)) throw error;
  }

  const temporary = path.join(parent, `.hbg-write-${randomUUID()}.tmp`);
  const handle = await fs.open(temporary, "wx", mode);
  try {
    await handle.writeFile(content, "utf8");
    await handle.sync();
    await handle.close();
    await fs.rename(temporary, destination);
  } catch (error) {
    await handle.close().catch(() => undefined);
    await fs.unlink(temporary).catch(() => undefined);
    throw error;
  }

  return { path: normalized, bytes };
}

export async function deleteFile(
  relativePath: string,
  context?: HBGAuthContext,
): Promise<{ path: string }> {
  const normalized = normalizedRelativePath(relativePath);
  await assertWriteGrant(context, normalized);
  const target = await safeAbsolutePath(normalized);
  const root = await fs.realpath(WORKSPACE_ROOT);
  const parent = await safeParentDirectory(root, target);

  const destination = path.join(parent, path.basename(target));
  const stat = await fs.lstat(destination);
  if (stat.isSymbolicLink() || !stat.isFile()) {
    throw new Error("Solo se pueden eliminar archivos regulares.");
  }
  await fs.unlink(destination);
  return { path: normalized };
}

export async function runSafeWorkspaceScript(
  packageName: string,
  script: string,
): Promise<{ code: number; output: string }> {
  void packageName;
  void script;
  throw new Error(
    "La ejecución de comandos de Code Tools permanece bloqueada hasta verificar aislamiento de procesos.",
  );
}
