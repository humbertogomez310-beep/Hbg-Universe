import { access } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

export async function resolve(specifier, context, nextResolve) {
  try {
    return await nextResolve(specifier, context);
  } catch (originalError) {
    if (!specifier.startsWith(".") || !context.parentURL?.startsWith("file:")) {
      throw originalError;
    }

    const requestedPath = fileURLToPath(new URL(specifier, context.parentURL));
    const candidates = path.extname(requestedPath)
      ? [requestedPath]
      : [
          `${requestedPath}.ts`,
          `${requestedPath}.mjs`,
          `${requestedPath}.js`,
          path.join(requestedPath, "index.ts"),
          path.join(requestedPath, "index.mjs"),
          path.join(requestedPath, "index.js"),
        ];

    for (const candidate of candidates) {
      try {
        await access(candidate);
        return nextResolve(pathToFileURL(candidate).href, context);
      } catch {
        // Try the next supported source extension or index file.
      }
    }
    throw originalError;
  }
}
