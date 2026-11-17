import express, { type ErrorRequestHandler } from "express";
import session from "express-session";
import helmet from "helmet";
import { rateLimit } from "express-rate-limit";
import { randomBytes } from "node:crypto";
import { ZodError } from "zod";
import type { Config } from "./config.js";
import { googleConfigured, sheetsConfigured } from "./config.js";
import type { Repository } from "./repository.js";
import { FileSessionStore } from "./session-store.js";
import {
  installAuth,
  RealGoogleProvider,
  type GoogleProvider,
} from "./auth.js";
import { AppError } from "./errors.js";
import { ApiContext } from "./context.js";
import { installDomain } from "./domain.js";
import { installPayroll } from "./payroll.js";
import { installReporting } from "./reporting.js";
import { installDashboard } from "./dashboard.js";
export interface AppOptions {
  repository: Repository;
  config: Config;
  googleProvider?: GoogleProvider;
  sessionStore?: session.Store;
}
export function createApp({
  repository,
  config,
  googleProvider,
  sessionStore,
}: AppOptions) {
  const app = express();
  app.disable("x-powered-by");
  if (config.trustProxy) app.set("trust proxy", config.trustProxy);
  app.use(
    helmet({
      contentSecurityPolicy: {
        directives: {
          defaultSrc: ["'self'"],
          scriptSrc: ["'self'"],
          styleSrc: [
            "'self'",
            "'unsafe-inline'",
            "https://fonts.googleapis.com",
          ],
          fontSrc: ["'self'", "https://fonts.gstatic.com"],
          imgSrc: ["'self'", "data:", "https:"],
          connectSrc: ["'self'"],
          frameAncestors: ["'none'"],
          upgradeInsecureRequests: config.production ? [] : null,
        },
      },
    }),
  );
  app.use(express.json({ limit: "1mb" }));
  app.use("/api", (_req, res, next) => {
    res.setHeader("Cache-Control", "no-store");
    next();
  });
  app.use(
    "/api",
    rateLimit({
      windowMs: 60000,
      limit: 300,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: {
        error: {
          code: "RATE_LIMITED",
          message: "Too many requests. Wait a minute and retry.",
        },
      },
    }),
  );
  app.use(
    "/api/auth/google",
    rateLimit({
      windowMs: 15 * 60000,
      limit: 30,
      standardHeaders: "draft-7",
      legacyHeaders: false,
      message: {
        error: {
          code: "SIGN_IN_RATE_LIMITED",
          message: "Too many sign-in attempts. Please wait.",
        },
      },
    }),
  );
  app.get("/api/health", (_req, res) =>
    res.json({
      data: {
        status:
          googleConfigured(config) && sheetsConfigured(config)
            ? "ready"
            : "setup_required",
        googleConfigured: googleConfigured(config),
        sheetsConfigured: sheetsConfigured(config),
      },
    }),
  );
  app.use(
    session({
      name: "easymanage.sid",
      secret: config.sessionSecret || randomBytes(48).toString("hex"),
      store: sessionStore || new FileSessionStore(config.sessionDir),
      resave: false,
      saveUninitialized: false,
      rolling: true,
      cookie: {
        httpOnly: true,
        secure: config.production,
        sameSite: "lax",
        maxAge: 8 * 60 * 60 * 1000,
        path: "/",
      },
    }),
  );
  const ctx = new ApiContext(repository);
  installAuth(
    app,
    repository,
    config,
    ctx.mutex,
    googleProvider || new RealGoogleProvider(config),
  );
  installDomain(app, ctx);
  installPayroll(app, ctx);
  installReporting(app, ctx);
  installDashboard(app, ctx);
  app.use("/api", (_req, res) =>
    res
      .status(404)
      .json({ error: { code: "NOT_FOUND", message: "API route not found." } }),
  );
  const error: ErrorRequestHandler = (err, req, res, _next) => {
    if (res.headersSent) return;
    if (
      req.path === "/api/auth/google/callback" &&
      req.header("accept")?.includes("text/html")
    ) {
      const code = err instanceof AppError ? err.code : "GOOGLE_SIGN_IN_FAILED";
      res.redirect(`${config.origin}/login?error=${encodeURIComponent(code)}`);
      return;
    }
    if (err instanceof ZodError) {
      res
        .status(422)
        .json({
          error: {
            code: "VALIDATION_ERROR",
            message: "Some fields need attention.",
            details: err.flatten(),
          },
        });
      return;
    }
    if (err instanceof AppError) {
      res
        .status(err.status)
        .json({
          error: {
            code: err.code,
            message: err.message,
            ...(err.details ? { details: err.details } : {}),
          },
        });
      return;
    }
    if (err.type === "entity.parse.failed") {
      res
        .status(400)
        .json({
          error: {
            code: "INVALID_JSON",
            message: "The request body is not valid JSON.",
          },
        });
      return;
    }
    if (err.type === "entity.too.large") {
      res
        .status(413)
        .json({
          error: {
            code: "REQUEST_TOO_LARGE",
            message: "The request body is too large.",
          },
        });
      return;
    }
    console.error(
      "Unhandled API error:",
      err instanceof Error ? err.message : "Unknown error",
    );
    res
      .status(500)
      .json({
        error: {
          code: "INTERNAL_ERROR",
          message: "The request could not be completed.",
        },
      });
  };
  app.use(error);
  return app;
}
