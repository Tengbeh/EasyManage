import express from "express";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { existsSync } from "node:fs";
import { readConfig } from "./config.js";
import { SheetsRepository } from "./repository.js";
import { createApp } from "./app.js";
import { acquireWriterLock } from "./writer-lock.js";
import { FileSessionStore } from "./session-store.js";
const config = readConfig();
const release = await acquireWriterLock(config.spreadsheetId);
const repository = new SheetsRepository(config);
const sessions = new FileSessionStore(config.sessionDir);
await sessions.prune();
const app = createApp({ repository, config, sessionStore: sessions });
const client =
  process.env.CLIENT_DIST_PATH ||
  path.resolve(
    path.dirname(fileURLToPath(import.meta.url)),
    "../../client/dist",
  );
if (existsSync(client)) {
  app.use(express.static(client));
  app.get("*", (_req, res) => res.sendFile(path.join(client, "index.html")));
}
const server = app.listen(
  config.port,
  process.env.SERVER_HOST || "127.0.0.1",
  () => console.log(`EasyManage server listening on ${config.port}`),
);
const cleanup = setInterval(
  () => void sessions.prune().catch(() => {}),
  60 * 60 * 1000,
);
cleanup.unref();
let closing = false;
async function stop() {
  if (closing) return;
  closing = true;
  clearInterval(cleanup);
  server.close(async () => {
    await release();
    process.exit(0);
  });
  setTimeout(() => process.exit(1), 15000).unref();
}
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
