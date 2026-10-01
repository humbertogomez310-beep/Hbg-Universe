import { spawn } from "node:child_process";
import { promises as fs } from "node:fs";
import path from "node:path";

const WORKSPACE_ROOT = path.resolve(process.cwd());
const MAX_READ_BYTES = 256 * 1024;
const MAX_WRITE_BYTES = 256 * 1024;
const PROTECTED_SEGMENTS = new Set([
  ".git",
  ".env",
  ".env.local",
  ".env.production",
  "node_modules",
]);
const PROTECTED_FILES = new Set([
  "artifacts/api-server/src/lib/hbgAuth.ts",
  "artifacts/api-server/src/lib/audit.ts",
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
  const normalized = path.normalize(relativePath).replaceAll("\\", "/");
  if (normalized === ".." || normalized.startsWith("../")) {
    throw new Error("Path traversal bloqueado.");
  }
  const segments = normalized.split("/");
  if (
    segments.some((segment) => PROTECTED_SEGMENTS.has(segment)) ||
    normalized.endsWith(".pem") ||
    normalized.endsWith(".key") ||
    normalized.endsWith(".secret") ||
    PROTECTED_FILES.has(normalized)
  ) {
    throw new Error("Recurso protegido.");
  }
  return normalized;
}

function absolutePath(relativePath: string): string {
  return path.join(WORKSPACE_ROOT, normalizedRelativePath(relativePath));
}

export async function inspectFile(relativePath: string) {
  const filename = absolutePath(relativePath);
  const stat = await fs.stat(filename);
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
  const directory =
    relativePath === "."
      ? WORKSPACE_ROOT
      : absolutePath(relativePath);
  const entries = await fs.readdir(directory, { withFileTypes: true });
  return entries
    .filter((entry) => !PROTECTED_SEGMENTS.has(entry.name))
    .slice(0, 500)
    .map((entry) => ({
      name: entry.name,
      type: entry.isDirectory() ? "directory" : "file",
    }));
}

export async function writeFile(relativePath: string, content: string) {
  const normalized = normalizedRelativePath(relativePath);
  if (typeof content !== "string" || Buffer.byteLength(content, "utf8") > MAX_WRITE_BYTES) {
    throw new Error("El contenido excede el límite de escritura.");
  }
  const filename = path.join(WORKSPACE_ROOT, normalized);
  await fs.mkdir(path.dirname(filename), { recursive: true });
  await fs.writeFile(filename, content, { encoding: "utf8", flag: "w" });
  return { path: normalized, bytes: Buffer.byteLength(content, "utf8") };
}

export async function deleteFile(relativePath: string) {
  const filename = absolutePath(relativePath);
  const stat = await fs.stat(filename);
  if (!stat.isFile()) throw new Error("Sólo se pueden eliminar archivos.");
  await fs.unlink(filename);
  return { path: normalizedRelativePath(relativePath) };
}

const SAFE_PACKAGES = new Set([
  "@workspace/api-server",
  "@workspace/universo-hbg",
  "@workspace/db",
]);
const SAFE_SCRIPTS = new Set(["typecheck", "build", "test"]);

function redactOutput(value: string): string {
  const secretValues = [
    process.env.SESSION_SECRET,
    process.env.HBG_OWNER_TOKEN,
    process.env.HBG_DEVELOPMENT_TOKEN,
    process.env.DATABASE_URL,
  ].filter((secret): secret is string => Boolean(secret));
  return secretValues.reduce(
    (output, secret) => output.split(secret).join("[REDACTED]"),
    value,
  );
}

export async function runSafeWorkspaceScript(
  packageName: string,
  script: string,
): Promise<{ code: number; output: string }> {
  if (!SAFE_PACKAGES.has(packageName) || !SAFE_SCRIPTS.has(script)) {
    throw new Error("Comando no permitido.");
  }
  return new Promise((resolve, reject) => {
    const child = spawn(
      "pnpm",
      ["--filter", packageName, "run", script],
      {
        cwd: WORKSPACE_ROOT,
        shell: false,
        env: Object.fromEntries(
          Object.entries(process.env).filter(
            ([key]) =>
              !/SECRET|TOKEN|PASSWORD|PRIVATE|DATABASE_URL/i.test(key),
          ),
        ),
      },
    );
    let output = "";
    const timer = setTimeout(() => {
      child.kill("SIGTERM");
      reject(new Error("La ejecución excedió el tiempo máximo."));
    }, 120_000);
    child.stdout.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.stderr.on("data", (chunk: Buffer) => {
      output += chunk.toString();
    });
    child.once("error", (error) => {
      clearTimeout(timer);
      reject(error);
    });
    child.once("close", (code) => {
      clearTimeout(timer);
      resolve({ code: code ?? 1, output: redactOutput(output).slice(-100_000) });
    });
  });
}