import { Router, type IRouter } from "express";
import healthRouter from "./health";
import coreRouter from "./core";
import authRouter from "./auth";
import auditRouter from "./audit";
import registryRouter from "./registry";
import terminadorRouter from "./terminador";
import toolsRouter from "./tools";
import permissionGrantsRouter from "./permission-grants";

const router: IRouter = Router();

router.use(healthRouter);
router.use(coreRouter);
router.use(authRouter);
router.use(auditRouter);
router.use(registryRouter);
router.use(terminadorRouter);
router.use(permissionGrantsRouter);
router.use(toolsRouter);

// Filesystem mutations are path-grant protected; command execution remains blocked.

export default router;
