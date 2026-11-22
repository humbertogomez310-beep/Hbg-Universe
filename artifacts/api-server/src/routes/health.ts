import { Router, type IRouter } from "express";
import { HealthCheckResponse } from "@workspace/api-zod";
import { pool } from "@workspace/db";
import { logger } from "../lib/logger";

const router: IRouter = Router();

router.get("/healthz", async (_req, res) => {
  try {
    const result = await pool.query(`
      SELECT
        to_regclass('public.hbg_users') IS NOT NULL AS users,
        to_regclass('public.hbg_sessions') IS NOT NULL AS sessions,
        to_regclass('public.hbg_development_sessions') IS NOT NULL AS development_sessions,
        to_regclass('public.hbg_audit_events') IS NOT NULL AS audit_events,
        to_regclass('public.hbg_terminador_authorizations') IS NOT NULL AS terminador_authorizations,
        to_regclass('public.hbg_permission_grants') IS NOT NULL AS permission_grants,
        to_regclass('public.hbg_applications') IS NOT NULL AS applications
    `);
    const schemaReady = Object.values(result.rows[0] ?? {}).every((value) => value === true);
    if (!schemaReady) {
      res.status(503).json({ status: "unavailable", code: "DATABASE_SCHEMA_NOT_READY" });
      return;
    }

    const data = HealthCheckResponse.parse({ status: "ok" });
    res.json(data);
  } catch (error) {
    logger.error({ err: error }, "HBG health check failed");
    res.status(503).json({ status: "unavailable", code: "DATABASE_UNAVAILABLE" });
  }
});

export default router;
