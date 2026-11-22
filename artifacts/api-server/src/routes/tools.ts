import { Router, type IRouter, type Request, type Response } from "express";
import {
  requireDevelopmentPermission,
} from "../lib/hbgAuth";
import {
  deleteFile,
  inspectFile,
  listFiles,
  runSafeWorkspaceScript,
  writeFile,
} from "../lib/codeTools";
import { recordAudit, type AuditInput } from "../lib/audit";

const router: IRouter = Router();

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value);
}

function hasOnlyFields(
  value: Record<string, unknown>,
  allowed: readonly string[],
): boolean {
  const accepted = new Set(allowed);
  return Object.keys(value).every((key) => accepted.has(key));
}

async function auditOrBlock(
  req: Request,
  res: Response,
  input: AuditInput,
): Promise<boolean> {
  try {
    await recordAudit(input);
    return true;
  } catch (error) {
    req.log.error({ err: error, action: input.action }, "Code Tools audit write failed");
    res.status(503).json({
      success: false,
      error: "Auditoría no disponible; la operación permanece bloqueada o requiere verificación.",
      code: "AUDIT_UNAVAILABLE",
    });
    return false;
  }
}

function operationStatus(error: unknown): number {
  if (
    typeof error === "object" &&
    error !== null &&
    "status" in error &&
    typeof error.status === "number" &&
    error.status >= 400 &&
    error.status <= 499
  ) {
    return error.status;
  }
  return 400;
}

function operationCode(error: unknown, fallback: string): string {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }
  return fallback;
}

router.post(
  "/tools/fs/list",
  requireDevelopmentPermission("universe.code.inspect"),
  async (req, res) => {
    const relativePath =
      isRecord(req.body) && typeof req.body.path === "string"
        ? req.body.path
        : ".";
    try {
      const result = await listFiles(relativePath);
      if (!(await auditOrBlock(req, res, {
        actorUserId: req.hbgAuth!.user.id,
        action: "tools.fs.list",
        resource: relativePath,
        result: "success",
      }))) return;
      res.json({ success: true, ...result });
    } catch (error) {
      if (!(await auditOrBlock(req, res, {
        actorUserId: req.hbgAuth!.user.id,
        action: "tools.fs.list",
        resource: relativePath || "workspace",
        result: "failure",
        errorCode: "FS_LIST_FAILED",
      }))) return;
      res.status(400).json({ success: false, error: "No se pudo inspeccionar la carpeta." });
    }
  },
);

router.post(
  "/tools/fs/read",
  requireDevelopmentPermission("universe.code.inspect"),
  async (req, res) => {
    const relativePath =
      isRecord(req.body) && typeof req.body.path === "string" ? req.body.path : "";
    try {
      const file = await inspectFile(relativePath);
      if (!(await auditOrBlock(req, res, {
        actorUserId: req.hbgAuth!.user.id,
        action: "tools.fs.read",
        resource: relativePath,
        result: "success",
      }))) return;
      res.json({ success: true, file });
    } catch {
      if (!(await auditOrBlock(req, res, {
        actorUserId: req.hbgAuth!.user.id,
        action: "tools.fs.read",
        resource: relativePath || "unknown",
        result: "failure",
        errorCode: "FS_READ_FAILED",
      }))) return;
      res.status(400).json({ success: false, error: "No se pudo leer el archivo." });
    }
  },
);

router.post(
  "/tools/fs/write",
  requireDevelopmentPermission("terminador.manage"),
  async (req, res) => {
    if (
      !isRecord(req.body) ||
      !hasOnlyFields(req.body, ["path", "content"]) ||
      typeof req.body.path !== "string" ||
      typeof req.body.content !== "string"
    ) {
      res.status(400).json({
        success: false,
        error: "La solicitud de escritura no tiene el formato permitido.",
        code: "INVALID_WRITE_INPUT",
      });
      return;
    }

    const relativePath = req.body.path;
    const content = req.body.content;
    if (!(await auditOrBlock(req, res, {
      actorUserId: req.hbgAuth!.user.id,
      action: "tools.fs.write.intent_recorded",
      resource: relativePath || "unknown",
      result: "success",
    }))) return;

    try {
      const result = await writeFile(relativePath, content, req.hbgAuth!);
      if (!(await auditOrBlock(req, res, {
        actorUserId: req.hbgAuth!.user.id,
        action: "tools.fs.write",
        resource: relativePath,
        result: "success",
        metadata: { bytes: result.bytes },
      }))) return;
      res.json({ success: true, ...result });
    } catch (error) {
      const errorCode = operationCode(error, "FS_WRITE_FAILED");
      if (!(await auditOrBlock(req, res, {
        actorUserId: req.hbgAuth!.user.id,
        action: "tools.fs.write",
        resource: relativePath || "unknown",
        result: "failure",
        errorCode,
      }))) return;
      res.status(operationStatus(error)).json({
        success: false,
        error: "No se pudo escribir el archivo; verifica la concesión y la ruta.",
        code: errorCode,
      });
    }
  },
);

router.post(
  "/tools/fs/delete",
  requireDevelopmentPermission("terminador.manage"),
  async (req, res) => {
    if (
      !isRecord(req.body) ||
      !hasOnlyFields(req.body, ["path"]) ||
      typeof req.body.path !== "string"
    ) {
      res.status(400).json({
        success: false,
        error: "La solicitud de eliminación no tiene el formato permitido.",
        code: "INVALID_DELETE_INPUT",
      });
      return;
    }

    const relativePath = req.body.path;
    if (!(await auditOrBlock(req, res, {
      actorUserId: req.hbgAuth!.user.id,
      action: "tools.fs.delete.intent_recorded",
      resource: relativePath || "unknown",
      result: "success",
    }))) return;

    try {
      const result = await deleteFile(relativePath, req.hbgAuth!);
      if (!(await auditOrBlock(req, res, {
        actorUserId: req.hbgAuth!.user.id,
        action: "tools.fs.delete",
        resource: relativePath,
        result: "success",
      }))) return;
      res.json({ success: true, ...result });
    } catch (error) {
      const errorCode = operationCode(error, "FS_DELETE_FAILED");
      if (!(await auditOrBlock(req, res, {
        actorUserId: req.hbgAuth!.user.id,
        action: "tools.fs.delete",
        resource: relativePath || "unknown",
        result: "failure",
        errorCode,
      }))) return;
      res.status(operationStatus(error)).json({
        success: false,
        error: "No se pudo eliminar el archivo; verifica la concesión y la ruta.",
        code: errorCode,
      });
    }
  },
);

router.post(
  "/tools/run",
  requireDevelopmentPermission("universe.command.execute"),
  async (req, res) => {
    const packageName =
      isRecord(req.body) && typeof req.body.packageName === "string"
        ? req.body.packageName
        : "";
    const script =
      isRecord(req.body) && typeof req.body.script === "string"
        ? req.body.script
        : "";
    try {
      const result = await runSafeWorkspaceScript(packageName, script);
      if (!(await auditOrBlock(req, res, {
        actorUserId: req.hbgAuth!.user.id,
        action: "tools.run",
        resource: packageName || "unknown",
        result: result.code === 0 ? "success" : "failure",
        errorCode: result.code === 0 ? undefined : "COMMAND_FAILED",
        metadata: { exitCode: result.code },
      }))) return;
      res.status(result.code === 0 ? 200 : 422).json({ success: result.code === 0, ...result });
    } catch {
      if (!(await auditOrBlock(req, res, {
        actorUserId: req.hbgAuth!.user.id,
        action: "tools.run",
        resource: packageName || "unknown",
        result: "failure",
        errorCode: "COMMAND_BLOCKED",
      }))) return;
      res.status(400).json({ success: false, error: "Comando no permitido o fallido." });
    }
  },
);

export default router;
