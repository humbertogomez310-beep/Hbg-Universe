import { Router, type IRouter } from "express";
import healthRouter from "./health";
import authRouter from "./auth";
import auditRouter from "./audit";
import registryRouter from "./registry";
import terminadorRouter from "./terminador";
import permissionGrantsRouter from "./permission-grants";

const router: IRouter = Router();

router.use(healthRouter);
router.use(authRouter);
router.use(auditRouter);
router.use(registryRouter);
router.use(terminadorRouter);
router.use(permissionGrantsRouter);

// Code Tools remain deliberately unmounted until path-scoped grants,
// filesystem protections, and execution isolation are operationally verified.

export default router;
