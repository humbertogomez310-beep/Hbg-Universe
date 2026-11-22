
import { Router, type IRouter } from "express";
import {
  requireDevelopmentPermission,
} from "../lib/hbgAuth";
import {
  createPermissionGrant,
  revokePermissionGrant,
  PermissionGrantError,
} from "../lib/permissionGrants";

const router: IRouter = Router();

function handleError(
  error: unknown,
  req: Parameters<Parameters<IRouter["post"]>[2]>[0],
  res: Parameters<Parameters<IRouter["post"]>[2]>[1],
) {
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

    const body = (req.body ?? {}) as Record<string, unknown>;

    if (body.permission !== "universe.code.modify") {
      res.status(400).json({
        success: false,
        error: "El permiso solicitado no está permitido.",
        code: "PERMISSION_NOT_ALLOWED",
      });
      return;
    }

    try {
      const grant = await createPermissionGrant(context, {
        permission: "universe.code.modify",
        resourcePath:
          typeof body.resourcePath === "string"
            ? body.resourcePath
            : "",
        reason:
          typeof body.reason === "string"
            ? body.reason
            : "",
        ttlMs:
          typeof body.ttlMs === "number"
            ? body.ttlMs
            : undefined,
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
