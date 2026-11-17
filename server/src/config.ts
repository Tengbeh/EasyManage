import "dotenv/config";
export interface Config {
  port: number;
  origin: string;
  production: boolean;
  sessionSecret: string;
  sessionDir: string;
  googleClientId: string;
  googleClientSecret: string;
  googleRedirectUri: string;
  spreadsheetId: string;
  googleServiceAccountEmail: string;
  googlePrivateKey: string;
  googleCredentialsFile: string;
  bootstrapAdminEmail: string;
  trustProxy: number;
}
export function readConfig(env = process.env): Config {
  const origin = env.CLIENT_URL || env.APP_ORIGIN || "http://localhost:5173";
  const production = env.NODE_ENV === "production";
  const secret = env.SESSION_SECRET || "";
  if (production && secret.length < 32)
    throw new Error(
      "SESSION_SECRET must have at least 32 characters in production",
    );
  return {
    port: Number(env.SERVER_PORT || env.PORT || 3001),
    origin,
    production,
    sessionSecret: secret,
    sessionDir: env.SESSION_DIR || "./.sessions",
    googleClientId: env.GOOGLE_CLIENT_ID || "",
    googleClientSecret: env.GOOGLE_CLIENT_SECRET || "",
    googleRedirectUri:
      env.GOOGLE_CALLBACK_URL ||
      env.GOOGLE_REDIRECT_URI ||
      `${origin}/api/auth/google/callback`,
    spreadsheetId:
      env.GOOGLE_SHEETS_SPREADSHEET_ID || env.GOOGLE_SPREADSHEET_ID || "",
    googleServiceAccountEmail: env.GOOGLE_SERVICE_ACCOUNT_EMAIL || "",
    googlePrivateKey: (
      env.GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY ||
      env.GOOGLE_PRIVATE_KEY ||
      ""
    ).replace(/\\n/g, "\n"),
    googleCredentialsFile: env.GOOGLE_APPLICATION_CREDENTIALS || "",
    bootstrapAdminEmail: (env.BOOTSTRAP_ADMIN_EMAIL || "").toLowerCase(),
    trustProxy: Number(env.TRUST_PROXY || 0),
  };
}
export const googleConfigured = (c: Config) =>
  Boolean(
    c.googleClientId && c.googleClientSecret && c.sessionSecret.length >= 32,
  );
export const sheetsConfigured = (c: Config) =>
  Boolean(
    c.spreadsheetId &&
    ((c.googleServiceAccountEmail && c.googlePrivateKey) ||
      c.googleCredentialsFile),
  );
