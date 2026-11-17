import { mkdir } from "node:fs/promises";
import { createHash } from "node:crypto";
import { spawn } from "node:child_process";
import path from "node:path";
/** Kernel-backed lock shared by server/CLI. Only one host may write a spreadsheet. */
export async function acquireWriterLock(
  spreadsheetId: string,
): Promise<() => Promise<void>> {
  const dir = process.env.WRITER_LOCK_DIR || "/tmp/easymanage-writers";
  await mkdir(dir, { recursive: true, mode: 0o700 });
  const file = path.join(
    dir,
    `${createHash("sha256")
      .update(spreadsheetId || "unconfigured")
      .digest("hex")}.lock`,
  );
  return new Promise((resolve, reject) => {
    let acquired = false;
    let releasing = false;
    const child = spawn(
      "flock",
      [
        "--nonblock",
        "--exclusive",
        file,
        "sh",
        "-c",
        'printf "LOCKED\\n"; cat >/dev/null',
      ],
      { stdio: ["pipe", "pipe", "pipe"] },
    );
    child.once("error", () =>
      reject(
        new Error(
          "Cannot acquire kernel writer lock. Install util-linux (flock).",
        ),
      ),
    );
    child.stdout.once("data", () => {
      acquired = true;
      resolve(async () => {
        releasing = true;
        await new Promise<void>((done) => {
          if (child.exitCode !== null) return done();
          child.once("close", () => done());
          child.stdin.end();
        });
      });
    });
    child.once("close", (code) => {
      if (!acquired)
        reject(
          new Error(
            `Another EasyManage process owns this spreadsheet writer lock (flock exit ${code}). Stop it before running another server or maintenance script.`,
          ),
        );
      else if (!releasing) {
        console.error(
          "Spreadsheet writer lock was lost. Stopping to prevent concurrent writes.",
        );
        process.exit(1);
      }
    });
  });
}
