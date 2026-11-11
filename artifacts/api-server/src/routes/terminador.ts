import { Router, type IRouter, type RequestHandler } from "express";
import { randomUUID } from "node:crypto";
import {
  isProtectedApplication,
  listApplications,
  getApplication,
} from "../lib/registry";
import { recordAudit, type AuditInput } from "../lib/audit";
import {
  hasPermission,
  rejectClientAuthorityFields,
  type HBGPermission,
} from "../lib/hbgAuth";
import {
  approveAuthorization,
  AuthorizationError,
  createAuthorizationProposal,
  denyAuthorization,
  getAuthorization,
  listAuthorizations,
  revokeAuthorization,
} from "../lib/terminadorAuthorization";

const router: IRouter = Router();

const ALLOWED_STATUSES = ["active", "disabled"] as const;
type AllowedStatus = (typeof ALLOWED_STATUSES)[number];

const SAFE_APP_ID = /^[a-zA-Z0-9_.-]{1,64}$/;

async function recordTerminadorAudit(
  req: Parameters<RequestHandler>[0],
  input: AuditInput,
): Promise<void> {
  try {
    await recordAudit(input);
  } catch (error) {
    req.log.error({ err: error }, "Terminador audit write failed");
  }
}

function requireTerminadorPermission(permission: HBGPermission): RequestHandler {
  return async (req, res, next) => {
    const auth = req.hbgAuth;
    if (!auth) {
      await recordTerminadorAudit(req, {
        action: "terminador.authorization.denied",
        resource: req.path,
        result: "denied",
        errorCode: "AUTH_REQUIRED",
        metadata: { method: req.method },
      });
      res.status(401).json({ success: false, error: "Autenticación requerida.", code: "AUTH_REQUIRED" });
      return;
    }
    if (!hasPermission(auth, permission)) {
      await recordTerminadorAudit(req, {
        actorUserId: auth.user.id,
        action: "terminador.authorization.denied",
        resource: req.path,
        result: "denied",
        errorCode: "FORBIDDEN",
        metadata: { permission, method: req.method },
      });
      res.status(403).json({ success: false, error: "Permiso insuficiente.", code: "FORBIDDEN" });
      return;
    }
    next();
  };
}

async function runAuthorizationRoute(
  req: Parameters<RequestHandler>[0],
  res: Parameters<RequestHandler>[1],
  action: string,
  resource: string,
  operation: () => Promise<unknown>,
  successStatus = 200,
): Promise<void> {
  try {
    const result = await operation();
    const response = Array.isArray(result)
      ? { authorizations: result }
      : { authorization: result };
    res.status(successStatus).json({ success: true, ...response });
  } catch (error) {
    const auth = req.hbgAuth;
    const expected = error instanceof AuthorizationError;
    const errorCode = expected ? error.code : "AUTHORIZATION_SERVICE_UNAVAILABLE";
    try {
      await recordAudit({
        actorUserId: auth?.user.id,
        action,
        resource,
        result: expected ? "denied" : "failure",
        errorCode,
        metadata: {
          sessionId: auth?.sessionTokenHash,
          developmentSessionId: auth?.developmentSessionTokenHash,
          proposalId: String(req.params.id ?? ""),
          operation: "apps.set_status",
          applicationId:
            typeof req.body?.applicationId === "string"
              ? req.body.applicationId
              : undefined,
          workspace: "hbg-app-registry",
        },
      });
    } catch (auditError) {
      req.log.error({ err: auditError, errorCode }, "Authorization denial could not be audited");
      res.status(503).json({
        success: false,
        error: "Auditoría no disponible; la operación permanece bloqueada.",
        code: "AUDIT_UNAVAILABLE",
      });
      return;
    }
    if (!expected) req.log.error({ err: error }, "Terminador authorization request failed");
    res.status(expected ? error.status : 503).json({
      success: false,
      error: expected ? error.message : "HBG Authority no está disponible.",
      code: errorCode,
    });
  }
}

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
    protected: isProtectedApplication(application),
  };
}

router.use("/terminador", requireTerminadorPermission("terminador.use"));

router.post("/terminador/authorizations", async (req, res) => {
  const body = req.body;
  const forbiddenField =
    typeof body === "object" && body !== null && !Array.isArray(body)
      ? rejectClientAuthorityFields(body as Record<string, unknown>)
      : undefined;
  const allowedFields = new Set(["applicationId", "status", "reason"]);
  const validShape =
    typeof body === "object" &&
    body !== null &&
    !Array.isArray(body) &&
    Object.keys(body).every((key) => allowedFields.has(key));

  await runAuthorizationRoute(
    req,
    res,
    "terminador.authorization.proposal.denied",
    "terminador.authorizations",
    async () => {
      if (forbiddenField || !validShape) {
        throw new AuthorizationError(
          forbiddenField ?? "La solicitud contiene campos no permitidos.",
          400,
          "INVALID_PROPOSAL",
        );
      }
      const input = body as Record<string, unknown>;
      if (
        typeof input.applicationId !== "string" ||
        typeof input.status !== "string" ||
        typeof input.reason !== "string"
      ) {
        throw new AuthorizationError("La propuesta no es válida.", 400, "INVALID_PROPOSAL");
      }
      if (input.status !== "active" && input.status !== "disabled") {
        throw new AuthorizationError("El estado solicitado no es válido.", 400, "INVALID_PROPOSAL");
      }
      return createAuthorizationProposal(req.hbgAuth!, {
        applicationId: input.applicationId,
        status: input.status,
        reason: input.reason,
      });
    },
    201,
  );
});

router.get("/terminador/authorizations", async (req, res) => {
  await runAuthorizationRoute(
    req,
    res,
    "terminador.authorization.list.denied",
    "terminador.authorizations",
    () => listAuthorizations(req.hbgAuth!),
  );
});

router.get("/terminador/authorizations/:id", async (req, res) => {
  await runAuthorizationRoute(
    req,
    res,
    "terminador.authorization.read.denied",
    String(req.params.id ?? "terminador.authorizations"),
    () => {
      const id = String(req.params.id ?? "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        throw new AuthorizationError("Identificador de propuesta no válido.", 400, "INVALID_PROPOSAL_ID");
      }
      return getAuthorization(req.hbgAuth!, id);
    },
  );
});

router.post("/terminador/authorizations/:id/approve", async (req, res) => {
  await runAuthorizationRoute(
    req,
    res,
    "terminador.authorization.approval.denied",
    String(req.params.id ?? "terminador.authorizations"),
    () => {
      const id = String(req.params.id ?? "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        throw new AuthorizationError("Identificador de propuesta no válido.", 400, "INVALID_PROPOSAL_ID");
      }
      return approveAuthorization(req.hbgAuth!, id);
    },
  );
});

router.post("/terminador/authorizations/:id/deny", async (req, res) => {
  await runAuthorizationRoute(
    req,
    res,
    "terminador.authorization.denial.request.denied",
    String(req.params.id ?? "terminador.authorizations"),
    () => {
      const id = String(req.params.id ?? "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        throw new AuthorizationError("Identificador de propuesta no válido.", 400, "INVALID_PROPOSAL_ID");
      }
      return denyAuthorization(req.hbgAuth!, id);
    },
  );
});

router.post("/terminador/authorizations/:id/revoke", async (req, res) => {
  await runAuthorizationRoute(
    req,
    res,
    "terminador.authorization.revocation.denied",
    String(req.params.id ?? "terminador.authorizations"),
    () => {
      const id = String(req.params.id ?? "");
      if (!/^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(id)) {
        throw new AuthorizationError("Identificador de propuesta no válido.", 400, "INVALID_PROPOSAL_ID");
      }
      return revokeAuthorization(req.hbgAuth!, id);
    },
  );
});

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
  requireTerminadorPermission("terminador.manage"),
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
        await recordTerminadorAudit(req, {
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

      if (isProtectedApplication(application)) {
        await recordTerminadorAudit(req, {
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

      const operationId = randomUUID();
      try {
        await recordAudit({
          actorUserId,
          action: "terminador.app.status.authorization",
          resource: id,
          result: "denied",
          errorCode: "OPERATION_APPROVAL_REQUIRED",
          metadata: {
            operationId,
            requestedStatus: status,
            currentStatus: application.status,
          },
        });
      } catch (error) {
        req.log.error(
          { err: error, operationId },
          "Terminador state change blocked because its denial could not be audited",
        );
        res.status(503).json({
          success: false,
          error: "Auditoría no disponible; la operación permanece bloqueada.",
          code: "AUDIT_UNAVAILABLE",
          operationId,
        });
        return;
      }
      res.status(403).json({
        success: false,
        error: "La operación requiere una autorización individual de HBG Authority.",
        code: "OPERATION_APPROVAL_REQUIRED",
        operationId,
      });
    } catch (error) {
      req.log.error({ err: error }, "Terminador status change failed");
      await recordTerminadorAudit(req, {
        actorUserId,
        action: "terminador.app.status",
        resource: id,
        result: "failure",
        errorCode: "STATUS_CHANGE_FAILED",
        metadata: { requestedStatus: status },
      });
      res.status(503).json({ success: false, error: "No se pudo cambiar el estado." });
    }
  },
);

export default router;