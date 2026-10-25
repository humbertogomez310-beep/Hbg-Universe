import { Router, type IRouter } from "express";
import { eq } from "drizzle-orm";
import { db, hbgApplications } from "@workspace/db";
import { listApplications, getApplication } from "../lib/registry";
import { recordAudit } from "../lib/audit";
import {
  rejectClientAuthorityFields,
  requirePermission,
} from "../lib/hbgAuth";

const router: IRouter = Router();

const ALLOWED_STATUSES = ["active", "disabled"] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

const PROTECTED_CAPABILITY = "operator";

const PROTECTED_APP_IDS = new Set(["hbg-auth", "hbg-core"]);
const PROTECTED_APP_NAMES = new Set(["HBG-AUTH", "HBG CORE"]);

function isProtected(
  application: { id: string; name: string; capabilities: unknown },
): boolean {
  return (
    PROTECTED_APP_IDS.has(application.id) ||
    PROTECTED_APP_NAMES.has(application.name.trim().toUpperCase()) ||
    capabilitiesOf(application.capabilities).includes(PROTECTED_CAPABILITY)
  );
}

const SAFE_APP_ID = /^[a-zA-Z0-9_.-]{1,64}$/;

function capabilitiesOf(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((c): c is string => typeof c === "string") : [];
}

function view(application: {
  id: string;
  name: string;
  version: string;
  status: string;
  capabilities: unknown;
  updatedAt: Date;
}) {
  const capabilities = capabilitiesOf(application.capabilities);
  return {
    id: application.id,
    name: application.name,
    version: application.version,
    status: application.status,
    capabilities,
    updatedAt: application.updatedAt,
    protected: isProtected(application),
  };
}

router.use("/terminador", requirePermission("terminador.use"));

router.get("/terminador/apps", async (req, res) => {
  try {
    const applications = await listApplications();
    res.json({ success: true, applications: applications.map(view) });
  } catch (error) {
    req.log.error({ err: error }, "Terminador apps read failed");
    res.status(503).json({ success: false, error: "Registro no disponible." });
  }
});

router.post(
  "/terminador/apps/:id/status",
  requirePermission("terminador.manage"),
  async (req, res) => {
    const actorUserId = req.hbgAuth?.user.id;
    const id = String(req.params.id ?? "");
    const body = (req.body ?? {}) as Record<string, unknown>;

    const forbiddenField = rejectClientAuthorityFields(body);
    if (forbiddenField) {
      res.status(400).json({ success: false, error: forbiddenField, code: "FORBIDDEN_FIELD" });
      return;
    }
    if (!SAFE_APP_ID.test(id)) {
      res.status(400).json({ success: false, error: "Identificador de app no válido.", code: "INVALID_APP_ID" });
      return;
    }
    const requested = body.status;
    if (typeof requested !== "string" || !ALLOWED_STATUSES.includes(requested as AllowedStatus)) {
      res.status(400).json({ success: false, error: "Estado no permitido.", code: "INVALID_STATUS" });
      return;
    }
    const status = requested as AllowedStatus;

    try {
      const application = await getApplication(id);
      if (!application) {
        await recordAudit({
          actorUserId,
          action: "terminador.app.status",
          resource: id,
          result: "failure",
          errorCode: "APP_NOT_FOUND",
          metadata: { requestedStatus: status },
        });
        res.status(404).json({ success: false, error: "App no encontrada.", code: "APP_NOT_FOUND" });
        return;
      }

      if (isProtected(application)) {
        await recordAudit({
          actorUserId,
          action: "terminador.app.status",
          resource: id,
          result: "denied",
          errorCode: "APP_PROTECTED",
          metadata: { requestedStatus: status },
        });
        res.status(409).json({
          success: false,
          error: "Esta app está protegida y no se puede apagar.",
          code: "APP_PROTECTED",
        });
        return;
      }

      if (application.status === status) {
        res.json({ success: true, changed: false, application: view(application) });
        return;
      }

      const updated = await db
        .update(hbgApplications)
        .set({ status, updatedAt: new Date() })
        .where(eq(hbgApplications.id, id))
        .returning();
      const next = updated[0];
      if (!next) {
        res.status(404).json({ success: false, error: "App no encontrada.", code: "APP_NOT_FOUND" });
        return;
      }

      await recordAudit({
        actorUserId,
        action: "terminador.app.status",
        resource: id,
        result: "success",
        metadata: { from: application.status, to: status },
      });
      res.json({ success: true, changed: true, application: view(next) });
    } catch (error) {
      req.log.error({ err: error }, "Terminador status change failed");
      res.status(503).json({ success: false, error: "No se pudo cambiar el estado." });
    }
  },
);

export default router;