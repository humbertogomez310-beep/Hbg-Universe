import express, { type Express } from "express";
import cors from "cors";
import cookieParser from "cookie-parser";
import pinoHttp from "pino-http";
import { existsSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import router from "./routes";
import { logger } from "./lib/logger";
import { authMiddleware } from "./middlewares/authMiddleware";

const app: Express = express();

// La aplicación se publica detrás de un único proxy inverso de confianza.
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

// En despliegues unificados, Express sirve el frontend compilado desde el mismo origen.
// Esto mantiene /api relativo, cookies same-site y PWA bajo un único dominio.
const webDist = process.env.HBG_WEB_DIST ?? path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "../../universo-hbg/dist/public",
);
const webIndex = path.join(webDist, "index.html");
const hasWebBuild = existsSync(webIndex);

if (hasWebBuild) {
  app.use(express.static(webDist, {
    index: "index.html",
    fallthrough: true,
  }));
}

// Las rutas de la SPA reciben index.html; las rutas API desconocidas nunca reciben HTML.
if (hasWebBuild) {
  app.use((req, res, next) => {
    if (
      (req.method !== "GET" && req.method !== "HEAD") ||
      req.path === "/api" ||
      req.path.startsWith("/api/") ||
      !req.accepts("html")
    ) {
      next();
      return;
    }

    res.sendFile(webIndex, (error) => {
      if (error) next(error);
    });
  });
}

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