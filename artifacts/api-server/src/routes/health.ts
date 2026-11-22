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
        to_regclass('public.hbg_applications') IS NOT NULL AS applications,
        to_regclass('public.hbg_schema_migrations') IS NOT NULL AS schema_migrations,
        (
          SELECT EXISTS (
            SELECT 1 FROM hbg_schema_migrations
            WHERE version = '0001_hbg_core.sql'
          )
        ) AS core_migration_applied,
        NOT EXISTS (
          SELECT 1
          FROM (VALUES
            ('hbg_users', 'id'), ('hbg_users', 'username'), ('hbg_users', 'role'),
            ('hbg_users', 'credential_hash'), ('hbg_users', 'active'),
            ('hbg_users', 'created_at'), ('hbg_users', 'updated_at'),
            ('hbg_sessions', 'token_hash'), ('hbg_sessions', 'user_id'),
            ('hbg_sessions', 'expires_at'), ('hbg_sessions', 'created_at'),
            ('hbg_development_sessions', 'token_hash'), ('hbg_development_sessions', 'user_id'),
            ('hbg_development_sessions', 'purpose'), ('hbg_development_sessions', 'started_at'),
            ('hbg_development_sessions', 'expires_at'), ('hbg_development_sessions', 'ended_at'),
            ('hbg_audit_events', 'id'), ('hbg_audit_events', 'actor_user_id'),
            ('hbg_audit_events', 'action'), ('hbg_audit_events', 'resource'),
            ('hbg_audit_events', 'result'), ('hbg_audit_events', 'error_code'),
            ('hbg_audit_events', 'metadata'), ('hbg_audit_events', 'created_at'),
            ('hbg_terminador_authorizations', 'id'), ('hbg_terminador_authorizations', 'owner_user_id'),
            ('hbg_terminador_authorizations', 'session_token_hash'),
            ('hbg_terminador_authorizations', 'development_session_token_hash'),
            ('hbg_terminador_authorizations', 'operation'), ('hbg_terminador_authorizations', 'resource'),
            ('hbg_terminador_authorizations', 'application_id'), ('hbg_terminador_authorizations', 'workspace'),
            ('hbg_terminador_authorizations', 'parameters'), ('hbg_terminador_authorizations', 'requested_permissions'),
            ('hbg_terminador_authorizations', 'content_hash'), ('hbg_terminador_authorizations', 'proposal_hash'),
            ('hbg_terminador_authorizations', 'reason'), ('hbg_terminador_authorizations', 'state'),
            ('hbg_terminador_authorizations', 'created_at'), ('hbg_terminador_authorizations', 'expires_at'),
            ('hbg_terminador_authorizations', 'approved_at'), ('hbg_terminador_authorizations', 'approved_by_user_id'),
            ('hbg_terminador_authorizations', 'approval_session_token_hash'),
            ('hbg_terminador_authorizations', 'denied_at'), ('hbg_terminador_authorizations', 'revoked_at'),
            ('hbg_terminador_authorizations', 'consumed_at'),
            ('hbg_permission_grants', 'id'), ('hbg_permission_grants', 'owner_user_id'),
            ('hbg_permission_grants', 'granted_by_user_id'),
            ('hbg_permission_grants', 'development_session_token_hash'),
            ('hbg_permission_grants', 'permission'), ('hbg_permission_grants', 'resource_path'),
            ('hbg_permission_grants', 'reason'), ('hbg_permission_grants', 'created_at'),
            ('hbg_permission_grants', 'expires_at'), ('hbg_permission_grants', 'revoked_at'),
            ('hbg_applications', 'id'), ('hbg_applications', 'name'), ('hbg_applications', 'version'),
            ('hbg_applications', 'status'), ('hbg_applications', 'capabilities'),
            ('hbg_applications', 'updated_at'),
            ('hbg_schema_migrations', 'version'), ('hbg_schema_migrations', 'checksum'),
            ('hbg_schema_migrations', 'applied_at')
          ) AS required(table_name, column_name)
          WHERE NOT EXISTS (
            SELECT 1 FROM information_schema.columns AS actual
            WHERE actual.table_schema = 'public'
              AND actual.table_name = required.table_name
              AND actual.column_name = required.column_name
          )
        ) AS required_columns,
        (
          SELECT count(*) >= 6
          FROM hbg_applications
          WHERE id IN ('hbg-core', 'hbg-auth', 'universo', 'instinto', 'vibra', 'terminador')
        ) AS registry_seeded
    `);
    const schemaRow = result.rows[0];
    const schemaReady =
      Boolean(schemaRow) &&
      Object.values(schemaRow).length === 11 &&
      Object.values(schemaRow).every((value) => value === true);
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
