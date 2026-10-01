import { Router, type IRouter } from "express";
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
import { recordAudit } from "../lib/audit";

const router: IRouter = Router();

function actionResource(req: Parameters<IRouter["post"]>[0] extends never ? never : any) {
  return String(req.path);
}

router.post(
  "/tools/fs/list",
  requireDevelopmentPermission("universe.code.inspect"),
  async (req, res) => {
    try {
      const relativePath =
        typeof req.body?.path === "string" ? req.body.path : ".";
      const result = await listFiles(relativePath);
      await recordAudit({
        actorUserId: req.hbgAuth!.user.id,
        action: "tools.fs.list",
        resource: relativePath,
        result: "success",
      });
      res.json({ success: true, ...result });
    } catch (error) {
      await recordAudit({
        actorUserId: req.hbgAuth!.user.id,
        action: "tools.fs.list",
        resource: "workspace",
        result: "failure",
        errorCode: "FS_LIST_FAILED",
      });
      res.status(400).json({ success: false, error: "No se pudo inspeccionar la carpeta." });
    }
  },
);

router.post(
  "/tools/fs/read",
  requireDevelopmentPermission("universe.code.inspect"),
  async (req, res) => {
    const relativePath = typeof req.body?.path === "string" ? req.body.path : "";
    try {
      const file = await inspectFile(relativePath);
      await recordAudit({
        actorUserId: req.hbgAuth!.user.id,
        action: "tools.fs.read",
        resource: relativePath,
        result: "success",
      });
      res.json({ success: true, file });
    } catch {
      await recordAudit({
        actorUserId: req.hbgAuth!.user.id,
        action: "tools.fs.read",
        resource: relativePath || "unknown",
        result: "failure",
        errorCode: "FS_READ_FAILED",
      });
      res.status(400).json({ success: false, error: "No se pudo leer el archivo." });
    }
  },
);

router.post(
  "/tools/fs/write",
  requireDevelopmentPermission("universe.code.modify"),
  async (req, res) => {
    const relativePath = typeof req.body?.path === "string" ? req.body.path : "";
    const content = typeof req.body?.content === "string" ? req.body.content : "";
    try {
      const result = await writeFile(relativePath, content);
      await recordAudit({
        actorUserId: req.hbgAuth!.user.id,
        action: "tools.fs.write",
        resource: relativePath,
        result: "success",
        metadata: { bytes: result.bytes },
      });
      res.json({ success: true, ...result });
    } catch {
      await recordAudit({
        actorUserId: req.hbgAuth!.user.id,
        action: "tools.fs.write",
        resource: relativePath || "unknown",
        result: "failure",
        errorCode: "FS_WRITE_FAILED",
      });
      res.status(400).json({ success: false, error: "No se pudo escribir el archivo." });
    }
  },
);

router.post(
  "/tools/fs/delete",
  requireDevelopmentPermission("universe.code.modify"),
  async (req, res) => {
    const relativePath = typeof req.body?.path === "string" ? req.body.path : "";
    try {
      const result = await deleteFile(relativePath);
      await recordAudit({
        actorUserId: req.hbgAuth!.user.id,
        action: "tools.fs.delete",
        resource: relativePath,
        result: "success",
      });
      res.json({ success: true, ...result });
    } catch {
      await recordAudit({
        actorUserId: req.hbgAuth!.user.id,
        action: "tools.fs.delete",
        resource: relativePath || "unknown",
        result: "failure",
        errorCode: "FS_DELETE_FAILED",
      });
      res.status(400).json({ success: false, error: "No se pudo eliminar el archivo." });
    }
  },
);

router.post(
  "/tools/run",
  requireDevelopmentPermission("universe.command.execute"),
  async (req, res) => {
    const packageName =
      typeof req.body?.packageName === "string" ? req.body.packageName : "";
    const script = typeof req.body?.script === "string" ? req.body.script : "";
    try {
      const result = await runSafeWorkspaceScript(packageName, script);
      await recordAudit({
        actorUserId: req.hbgAuth!.user.id,
        action: `tools.run.${script}`,
        resource: packageName,
        result: result.code === 0 ? "success" : "failure",
        errorCode: result.code === 0 ? undefined : "COMMAND_FAILED",
        metadata: { exitCode: result.code },
      });
      res.status(result.code === 0 ? 200 : 422).json({ success: result.code === 0, ...result });
    } catch {
      await recordAudit({
        actorUserId: req.hbgAuth!.user.id,
        action: "tools.run",
        resource: packageName || "unknown",
        result: "failure",
        errorCode: "COMMAND_BLOCKED",
      });
      res.status(400).json({ success: false, error: "Comando no permitido o fallido." });
    }
  },
);

export default router;