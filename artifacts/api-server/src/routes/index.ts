import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import auditRouter from "./audit";
import registryRouter from "./registry";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(auditRouter);
router.use(registryRouter);
// Code Tools remain deliberately unmounted until HBG Authority is operationally
// verified. Do not mount the tools router as part of routine integration work.

export default router;
