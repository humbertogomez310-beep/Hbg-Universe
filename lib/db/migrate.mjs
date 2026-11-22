import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { readdir } from "node:fs/promises";
import path from "node:path";
import { fileURLToPath } from "node:url";
import pg from "pg";

const { Pool } = pg;
const connectionString = process.env.DATABASE_URL;
if (!connectionString) {
  throw new Error("DATABASE_URL must be set before running database migrations.");
}

const directory = path.join(path.dirname(fileURLToPath(import.meta.url)), "migrations");
const files = (await readdir(directory))
  .filter((name) => /^\d+_[a-z0-9_-]+\.sql$/.test(name))
  .sort();

if (files.length === 0) {
  throw new Error("No versioned database migrations were found.");
}

const pool = new Pool({
  connectionString,
  connectionTimeoutMillis: 5_000,
  idleTimeoutMillis: 30_000,
  max: 2,
});

try {
  for (const filename of files) {
    const sql = await readFile(path.join(directory, filename), "utf8");
    const checksum = createHash("sha256").update(sql, "utf8").digest("hex");
    const client = await pool.connect();

    try {
      await client.query("BEGIN");
      await client.query("SELECT pg_advisory_xact_lock(721904221)");
      await client.query(`
        CREATE TABLE IF NOT EXISTS public.hbg_schema_migrations (
          version text PRIMARY KEY,
          checksum text NOT NULL,
          applied_at timestamptz NOT NULL DEFAULT now()
        )
      `);

      const existing = await client.query(
        "SELECT checksum FROM public.hbg_schema_migrations WHERE version = $1",
        [filename],
      );

      if (existing.rowCount > 0) {
        if (existing.rows[0].checksum !== checksum) {
          throw new Error(`Applied migration ${filename} was modified; create a new migration instead.`);
        }
        await client.query("COMMIT");
        process.stdout.write(`Already applied: ${filename}\n`);
        continue;
      }

      await client.query(sql);
      await client.query(
        "INSERT INTO public.hbg_schema_migrations (version, checksum) VALUES ($1, $2)",
        [filename, checksum],
      );
      await client.query("COMMIT");
      process.stdout.write(`Applied: ${filename}\n`);
    } catch (error) {
      await client.query("ROLLBACK").catch(() => undefined);
      throw error;
    } finally {
      client.release();
    }
  }
} finally {
  await pool.end();
}
