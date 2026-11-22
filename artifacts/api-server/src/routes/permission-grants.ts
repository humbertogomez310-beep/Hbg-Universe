import { Router, type IRouter, type Request, type Response } from "express";
import {
  requireDevelopmentPermission,
} from "../lib/hbgAuth";
import {
  createPermissionGrant,
  revokePermissionGrant,
  PermissionGrantError,
} from "../lib/permissionGrants";

const router: IRouter = Router();

function isRecord(value: unknown): value is Record<string, unknown> {
  return (
    typeof value === "object" &&
    value !== null &&
    !Array.isArray(value)
  );
}

function handleError(
  error: unknown,
  req: Request,
  res: Response,
): void {
  if (error instanceof PermissionGrantError) {
    res.status(error.status).json({
      success: false,
      error: error.message,
      code: error.code,
    });
    return;
  }

  req.log.error({ err: error }, "HBG permission grant operation failed");

  res.status(500).json({
    success: false,
    error: "No se pudo completar la operación de autorización.",
    code: "AUTHORITY_OPERATION_FAILED",
  });
}

router.post(
  "/authority/permission-grants",
  requireDevelopmentPermission("terminador.manage"),
  async (req, res) => {
    const context = req.hbgAuth;

    if (!context) {
      res.status(401).json({
        success: false,
        error: "Autenticación requerida.",
        code: "AUTH_REQUIRED",
      });
      return;
    }

    if (!isRecord(req.body)) {
      res.status(400).json({
        success: false,
        error: "El cuerpo de la solicitud debe ser un objeto.",
        code: "INVALID_REQUEST_BODY",
      });
      return;
    }

    const body = req.body;
    const allowedFields = new Set([
      "permission",
      "resourcePath",
      "reason",
      "ttlMs",
    ]);
    const unexpectedField = Object.keys(body).find(
      (field) => !allowedFields.has(field),
    );

    if (unexpectedField) {
      res.status(400).json({
        success: false,
        error: `El campo "${unexpectedField}" no está permitido.`,
        code: "UNEXPECTED_FIELD",
      });
      return;
    }

    if (body.permission !== "universe.code.modify") {
      res.status(400).json({
        success: false,
        error: "El permiso solicitado no está permitido.",
        code: "PERMISSION_NOT_ALLOWED",
      });
      return;
    }

    if (
      typeof body.resourcePath !== "string" ||
      typeof body.reason !== "string"
    ) {
      res.status(400).json({
        success: false,
        error: "resourcePath y reason deben ser cadenas de texto.",
        code: "INVALID_GRANT_INPUT",
      });
      return;
    }

    if (
      body.ttlMs !== undefined &&
      (typeof body.ttlMs !== "number" || !Number.isSafeInteger(body.ttlMs))
    ) {
      res.status(400).json({
        success: false,
        error: "ttlMs debe ser un número entero seguro.",
        code: "INVALID_TTL",
      });
      return;
    }

    try {
      const grant = await createPermissionGrant(context, {
        permission: "universe.code.modify",
        resourcePath: body.resourcePath,
        reason: body.reason,
        ttlMs: body.ttlMs as number | undefined,
      });

      res.status(201).json({
        success: true,
        grant,
      });
    } catch (error) {
      handleError(error, req, res);
    }
  },
);

router.delete(
  "/authority/permission-grants/:grantId",
  requireDevelopmentPermission("terminador.manage"),
  async (req, res) => {
    const context = req.hbgAuth;

    if (!context) {
      res.status(401).json({
        success: false,
        error: "Autenticación requerida.",
        code: "AUTH_REQUIRED",
      });
      return;
    }

    try {
      const grant = await revokePermissionGrant(
        context,
        req.params.grantId,
      );

      res.json({
        success: true,
        grant,
      });
    } catch (error) {
      handleError(error, req, res);
    }
  },
);

export default router;
