import app from "./app";
import { logger } from "./lib/logger";
import { ensureDefaultApplications } from "./lib/registry";

const rawPort = process.env["PORT"];

if (!rawPort) {
  throw new Error(
    "PORT environment variable is required but was not provided.",
  );
}

const port = Number(rawPort);

if (Number.isNaN(port) || port <= 0) {
  throw new Error(`Invalid PORT value: "${rawPort}"`);
}

async function startServer(): Promise<void> {
  try {
    const seeded = await ensureDefaultApplications();
    if (seeded.length > 0) {
      logger.info({ count: seeded.length }, "Default HBG application registry entries created");
    }
  } catch (error) {
    // Keep the process alive so /api/healthz can report DB/schema readiness as 503.
    logger.error({ err: error }, "Unable to initialize HBG application registry");
  }

  app.listen(port, (err) => {
    if (err) {
      logger.error({ err }, "Error listening on port");
      process.exit(1);
    }

    logger.info({ port }, "Server listening");
  });
}

void startServer();
