import { OAuth2Client } from "google-auth-library";
import type { Express, Request, Response, NextFunction } from "express";
import {
  randomBytes,
  randomUUID,
  createHash,
  timingSafeEqual,
} from "node:crypto";
import type { Config } from "./config.js";
import { googleConfigured, sheetsConfigured } from "./config.js";
import type { Repository, Row } from "./repository.js";
import { Mutex, publicRow } from "./repository.js";
import { AppError, assert } from "./errors.js";
import { permissions } from "./permissions.js";

declare module "express-session" {
  interface SessionData {
    userId?: string;
    csrfToken?: string;
    oauth?: {
      state: string;
      nonce: string;
      verifier: string;
      createdAt: number;
    };
  }
}
declare global {
  namespace Express {
    interface Request {
      user: Row;
      permissions: string[];
    }
  }
}
export interface GoogleIdentity {
  sub: string;
  email: string;
  email_verified: boolean;
  nonce: string;
  name?: string;
  picture?: string;
}
export interface GoogleProvider {
  authorizationUrl(input: {
    state: string;
    nonce: string;
    challenge: string;
  }): string;
  exchange(code: string, verifier: string): Promise<GoogleIdentity>;
}
export class RealGoogleProvider implements GoogleProvider {
  private client: OAuth2Client;
  constructor(private config: Config) {
    this.client = new OAuth2Client(
      config.googleClientId,
      config.googleClientSecret,
      config.googleRedirectUri,
    );
  }
  authorizationUrl({
    state,
    nonce,
    challenge,
  }: {
    state: string;
    nonce: string;
    challenge: string;
  }) {
    return this.client.generateAuthUrl({
      scope: ["openid", "email", "profile"],
      state,
      nonce,
      code_challenge: challenge,
      code_challenge_method: "S256" as any,
      prompt: "select_account",
      access_type: "online",
    });
  }
  async exchange(code: string, verifier: string) {
    const { tokens } = await this.client.getToken({
      code,
      codeVerifier: verifier,
      redirect_uri: this.config.googleRedirectUri,
    });
    assert(
      tokens.id_token,
      401,
      "INVALID_GOOGLE_TOKEN",
      "Google did not return an identity token.",
    );
    const ticket = await this.client.verifyIdToken({
      idToken: tokens.id_token,
      audience: this.config.googleClientId,
    });
    const p = ticket.getPayload() as any;
    assert(
      p &&
        p.sub &&
        p.email &&
        p.email_verified &&
        ["accounts.google.com", "https://accounts.google.com"].includes(p.iss),
      401,
      "INVALID_GOOGLE_IDENTITY",
      "Google identity could not be verified.",
    );
    return {
      sub: p.sub,
      email: p.email,
      email_verified: p.email_verified,
      nonce: p.nonce,
      name: p.name,
      picture: p.picture,
    };
  }
}
export const wrap =
  (fn: (req: Request, res: Response, next: NextFunction) => unknown) =>
  (req: Request, res: Response, next: NextFunction) =>
    Promise.resolve(fn(req, res, next)).catch(next);
function equal(a: unknown, b: string) {
  return (
    typeof a === "string" &&
    Buffer.byteLength(a) === Buffer.byteLength(b) &&
    timingSafeEqual(Buffer.from(a), Buffer.from(b))
  );
}
export function installAuth(
  app: Express,
  repository: Repository,
  config: Config,
  mutex: Mutex,
  provider: GoogleProvider,
) {
  app.get(
    "/api/auth/google",
    wrap(async (req, res) => {
      assert(
        googleConfigured(config) && sheetsConfigured(config),
        503,
        "GOOGLE_NOT_CONFIGURED",
        "Google sign-in and the company spreadsheet must be configured before sign-in. See /setup.",
      );
      const verifier = randomBytes(48).toString("base64url");
      const oauth = {
        state: randomBytes(32).toString("base64url"),
        nonce: randomBytes(32).toString("base64url"),
        verifier,
        createdAt: Date.now(),
      };
      req.session.oauth = oauth;
      await new Promise<void>((resolve, reject) =>
        req.session.save((e) => (e ? reject(e) : resolve())),
      );
      res.redirect(
        provider.authorizationUrl({
          ...oauth,
          challenge: createHash("sha256").update(verifier).digest("base64url"),
        }),
      );
    }),
  );
  app.get(
    "/api/auth/google/callback",
    wrap(async (req, res) => {
      const oauth = req.session.oauth;
      delete req.session.oauth;
      await new Promise<void>((resolve, reject) =>
        req.session.save((e) => (e ? reject(e) : resolve())),
      );
      assert(
        oauth &&
          Date.now() - oauth.createdAt < 600000 &&
          equal(req.query.state, oauth.state),
        401,
        "INVALID_OAUTH_STATE",
        "Sign-in expired or its state was invalid. Start Google sign-in again.",
      );
      assert(
        typeof req.query.code === "string" && !req.query.error,
        401,
        "GOOGLE_SIGN_IN_FAILED",
        "Google sign-in was cancelled or did not return an authorization code.",
      );
      let identity: GoogleIdentity;
      try {
        identity = await provider.exchange(req.query.code, oauth.verifier);
      } catch (e) {
        if (e instanceof AppError) throw e;
        throw new AppError(
          401,
          "GOOGLE_TOKEN_VERIFICATION_FAILED",
          "Google sign-in could not be verified. Please start again.",
        );
      }
      assert(
        identity.email_verified &&
          identity.sub &&
          equal(identity.nonce, oauth.nonce),
        401,
        "INVALID_GOOGLE_NONCE",
        "Google sign-in identity did not match this browser session.",
      );
      const user = await mutex.run(async () => {
        repository.invalidate?.();
        const users = await repository.list("Users");
        const email = identity.email.toLowerCase();
        let user = users.find((u) => String(u.email).toLowerCase() === email);
        if (
          !user &&
          users.length === 0 &&
          config.bootstrapAdminEmail === email
        ) {
          user = {
            user_id: randomUUID(),
            email,
            full_name: identity.name || email,
            role: "administrator",
            permissions: [],
            status: "active",
            created_at: new Date().toISOString(),
          };
        }
        assert(
          user && user.status === "active",
          403,
          "USER_NOT_AUTHORIZED",
          "Your Google account is not an active EasyManage user. Ask your administrator for access.",
        );
        assert(
          !user.google_id || user.google_id === identity.sub,
          403,
          "GOOGLE_ACCOUNT_MISMATCH",
          "This user is linked to a different Google identity.",
        );
        const now = new Date().toISOString();
        user = {
          ...user,
          google_id: identity.sub,
          profile_image: identity.picture || user.profile_image || "",
          last_login: now,
          updated_at: now,
        };
        await repository.commit([
          { table: "Users", record: user },
          {
            table: "Audit_Logs",
            record: {
              log_id: randomUUID(),
              user_id: user.user_id,
              action: "sign_in",
              module: "auth",
              record_id: user.user_id,
              timestamp: now,
              created_at: now,
            },
          },
        ]);
        return user;
      });
      await new Promise<void>((resolve, reject) =>
        req.session.regenerate((e) => (e ? reject(e) : resolve())),
      );
      req.session.userId = user.user_id;
      req.session.csrfToken = randomBytes(32).toString("base64url");
      await new Promise<void>((resolve, reject) =>
        req.session.save((e) => (e ? reject(e) : resolve())),
      );
      res.redirect(`${config.origin}/`);
    }),
  );
  app.use(
    "/api",
    wrap(async (req, res, next) => {
      assert(
        req.session.userId,
        401,
        "AUTHENTICATION_REQUIRED",
        "Sign in with Google to continue.",
      );
      const users = await repository.list("Users");
      const user = users.find((u) => u.user_id === req.session.userId);
      assert(
        user && user.status === "active",
        401,
        "SESSION_REVOKED",
        "This account is inactive or no longer authorized.",
      );
      req.user = publicRow(user);
      req.permissions = permissions(user);
      if (!req.session.csrfToken)
        req.session.csrfToken = randomBytes(32).toString("base64url");
      if (!["GET", "HEAD", "OPTIONS"].includes(req.method)) {
        assert(
          equal(req.header("x-csrf-token"), req.session.csrfToken),
          403,
          "INVALID_CSRF_TOKEN",
          "Refresh the page before submitting this change.",
        );
        const origin = req.header("origin");
        assert(
          !origin || origin === config.origin,
          403,
          "INVALID_ORIGIN",
          "The request origin is not allowed.",
        );
      }
      next();
    }),
  );
  const me = wrap(async (req, res) =>
    res.json({
      data: {
        user: req.user,
        permissions: req.permissions,
        csrfToken: req.session.csrfToken,
        connection: { configured: sheetsConfigured(config), connected: true },
      },
    }),
  );
  app.get("/api/me", me);
  app.get("/api/auth/me", me);
  app.post(
    "/api/auth/logout",
    wrap(async (req, res) => {
      await new Promise<void>((resolve, reject) =>
        req.session.destroy((e) => (e ? reject(e) : resolve())),
      );
      res.clearCookie("easymanage.sid", {
        path: "/",
        httpOnly: true,
        sameSite: "lax",
        secure: config.production,
      });
      res.json({ data: { signed_out: true } });
    }),
  );
}
export function requirePermission(req: Request, permission: string) {
  assert(
    req.permissions.includes(permission),
    403,
    "FORBIDDEN",
    `This action requires ${permission} permission.`,
  );
}
