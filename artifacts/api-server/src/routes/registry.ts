import { Router, type IRouter } from "express";
import { listApplications } from "../lib/registry";
import { requirePermission } from "../lib/hbgAuth";

const router: IRouter = Router();

router.get("/registry", async (req, res) => {
  try {
    const applications = await listApplications();
    res.json({ success: true, applications });
  } catch (error) {
    req.log.error({ err: error }, "Application registry read failed");
    res.status(503).json({ success: false, error: "Registro no disponible." });
  }
});

router.get(
  "/registry/private",
  requirePermission("universe.registry.manage"),
  async (req, res) => {
    const applications = await listApplications();
    res.json({ success: true, applications });
  },
);

export default router;