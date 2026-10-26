import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";

const app: Express = express();

// Detrás del proxy de Replit: req.ip debe ser la IP real del visitante.
app.set("trust proxy", 1);

app.use(
  pinoHttp({
    logger,
    serializers: {
      req(req) {
        return {
          id: req.id,
          method: req.method,
          url: req.url?.split("?")[0],
        };
      },
      res(res) {
        return {
          statusCode: res.statusCode,
        };
      },
    },
  }),
);
// El navegador manda el origen como "https://dominio"; REPLIT_DOMAINS trae solo "dominio".
const allowedOrigins = new Set(
  [process.env.REPLIT_DEV_DOMAIN, ...(process.env.REPLIT_DOMAINS ?? "").split(",")]
    .filter((domain): domain is string => Boolean(domain))
    .flatMap((domain) => [domain, `https://${domain}`]),
);

// Mismo origen: el navegador manda Origin = "https://<host>" y el Host de la petición coincide.
function isSameOrigin(origin: string, host: string | undefined): boolean {
  if (!host) return false;
  try {
    return new URL(origin).host === host;
  } catch {
    return false;
  }
}

// Falla cerrado: si la lista está vacía, solo se acepta el mismo origen (o peticiones sin Origin,
// que no son de navegador). CORS no es autenticación: la API sigue exigiendo sesión y permisos.
app.use(
  cors((req, callback) => {
    const origin = req.headers.origin;
    const allowed =
      !origin ||
      allowedOrigins.has(origin) ||
      isSameOrigin(origin, req.headers.host);
    if (!allowed) {
      callback(new Error("Origin not allowed"));
      return;
    }
    callback(null, { origin: true, credentials: true });
  }),
);
app.use(cookieParser());
app.use(express.json());
app.use(express.urlencoded({ extended: true }));
app.use(authMiddleware);

app.use("/api", router);

app.use(
  (
    err: unknown,
    _req: express.Request,
    res: express.Response,
    next: express.NextFunction,
  ) => {
    if (err instanceof Error && err.message === "Origin not allowed") {
      res.status(403).json({ success: false, error: "Origen no permitido.", code: "ORIGIN_NOT_ALLOWED" });
      return;
    }
    next(err);
  },
);

export default app;