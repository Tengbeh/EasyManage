import session from "express-session";
import { promises as fs } from "node:fs";
import path from "node:path";
import { createHash, randomUUID } from "node:crypto";
export class FileSessionStore extends session.Store {
  constructor(private directory: string) {
    super();
  }
  private file(sid: string) {
    return path.join(
      this.directory,
      `${createHash("sha256").update(sid).digest("hex")}.json`,
    );
  }
  get(sid: string, cb: (err: any, s?: session.SessionData | null) => void) {
    void fs
      .readFile(this.file(sid), "utf8")
      .then((text) => {
        const s = JSON.parse(text);
        if (new Date(s.cookie.expires).getTime() < Date.now()) {
          this.destroy(sid, () => {});
          cb(null, null);
        } else cb(null, s);
      })
      .catch((e) => cb(e.code === "ENOENT" ? null : e, null));
  }
  set(sid: string, s: session.SessionData, cb?: (err?: any) => void) {
    void (async () => {
      await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
      const tmp = `${this.file(sid)}.${randomUUID()}`;
      await fs.writeFile(tmp, JSON.stringify(s), { mode: 0o600 });
      await fs.rename(tmp, this.file(sid));
    })().then(
      () => cb?.(),
      (e) => cb?.(e),
    );
  }
  destroy(sid: string, cb?: (err?: any) => void) {
    void fs.unlink(this.file(sid)).then(
      () => cb?.(),
      (e) => cb?.(e.code === "ENOENT" ? undefined : e),
    );
  }
  touch(sid: string, s: session.SessionData, cb?: (err?: any) => void) {
    this.set(sid, s, cb);
  }
  async prune() {
    await fs.mkdir(this.directory, { recursive: true, mode: 0o700 });
    for (const file of await fs.readdir(this.directory)) {
      if (!file.endsWith(".json")) continue;
      try {
        const full = path.join(this.directory, file);
        const s = JSON.parse(await fs.readFile(full, "utf8"));
        if (new Date(s.cookie.expires).getTime() < Date.now())
          await fs.unlink(full);
      } catch {
        /* A concurrently expired session may already be gone. */
      }
    }
  }
}
