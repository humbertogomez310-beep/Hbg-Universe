import { Router, type IRouter } from "express";
import { listApplications } from "../lib/registry";
import { requirePermission } from "../lib/hbgAuth";

const router: IRouter = Router();
const RESTRICTED_CAPABILITIES = new Set([
  "code-tools",
  "development-sessions",
]);

async function getRegistryView() {
  const applications = await listApplications();
  return applications.map((application) => {
    const capabilities = Array.isArray(application.capabilities)
      ? application.capabilities
      : [];
    return {
      ...application,
      activeCapabilities: capabilities.filter(
        (capability) => !RESTRICTED_CAPABILITIES.has(capability),
      ),
      restrictedCapabilities: capabilities.filter((capability) =>
        RESTRICTED_CAPABILITIES.has(capability),
      ),
    };
  });
}

router.get("/registry", async (req, res) => {
  try {
        const applications = (await getRegistryView()).filter(
      (application) => application.restrictedCapabilities.length === 0,
    );
    res.json({ success: true, applications });
  } catch (error) {
    req.log.error({ err: error }, "Application registry read failed");
    res.status(503).json({ success: false, error: "Registro no disponible." });
  }
});

router.get(
  "/registry/private",
  requirePermission("universe.registry.read"),
  async (req, res) => {
    const applications = await getRegistryView();
    res.json({ success: true, applications });
  },
);

export default router;