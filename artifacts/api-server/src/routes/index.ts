import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import auditRouter from "./audit";
import registryRouter from "./registry";
import toolsRouter from "./tools";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(auditRouter);
router.use(registryRouter);
router.use(toolsRouter);

export default router;
