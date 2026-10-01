import { Router, type IRouter } from "express";
import { desc } from "drizzle-orm";
import { db, hbgAuditEvents } from "@workspace/db";
import { requirePermission } from "../lib/hbgAuth";

const router: IRouter = Router();

router.get("/audit", requirePermission("universe.audit.read"), async (req, res) => {
  try {
    const limit = Math.min(
      Math.max(Number.parseInt(String(req.query.limit ?? "100"), 10) || 100, 1),
      250,
    );
    const events = await db
      .select()
      .from(hbgAuditEvents)
      .orderBy(desc(hbgAuditEvents.createdAt))
      .limit(limit);
    res.json({ success: true, events });
  } catch (error) {
    req.log.error({ err: error }, "Audit read failed");
    res.status(503).json({ success: false, error: "Auditoría no disponible." });
  }
});

export default router;