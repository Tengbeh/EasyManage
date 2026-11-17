import type { Express } from "express";
import multer from "multer";
import { fileTypeFromBuffer } from "file-type";
import { createHash } from "node:crypto";
import { mkdir, writeFile, unlink } from "node:fs/promises";
import path from "node:path";
import { ApiContext } from "../context.js";
import { RequestData, type Row } from "../repository.js";
import { wrap } from "../auth.js";
import { assert } from "../errors.js";
import { access, own, employeeFor, uid, stamp } from "./shared.js";
export function installAttachments(
  app: Express,
  ctx: ApiContext,
  storageRoot: string,
) {
  const upload = multer({
    storage: multer.memoryStorage(),
    limits: { fileSize: 5 * 1024 * 1024, files: 1, fields: 1, fieldSize: 100 },
  }).single("file");
  app.post(
    "/api/workforce/leave-attachments",
    wrap(async (req, res, next) => {
      access(req, "leave.write", "self.leave");
      await new Promise<void>((resolve, reject) =>
        upload(req, res, (e) => (e ? reject(e) : resolve())),
      );
      assert(req.file, 422, "FILE_REQUIRED", "Choose a PDF, PNG or JPEG file.");
      const f = req.file,
        detected = await fileTypeFromBuffer(f.buffer);
      assert(
        detected &&
          ["application/pdf", "image/png", "image/jpeg"].includes(
            detected.mime,
          ) &&
          detected.mime === f.mimetype,
        422,
        "FILE_TYPE_REJECTED",
        "Only genuine PDF, PNG and JPEG files with matching content types are accepted.",
      );
      if (detected.mime === "application/pdf")
        assert(
          !/\/(?:JavaScript|JS|Launch|EmbeddedFile|RichMedia|OpenAction)\b/i.test(
            f.buffer.toString("latin1"),
          ),
          422,
          "ACTIVE_PDF_REJECTED",
          "PDFs containing scripts, embedded files or launch actions are not accepted.",
        );
      const digest = createHash("sha256").update(f.buffer).digest("hex");
      req.body = {
        employee_id: req.body.employee_id || req.user.employee_id,
        sha256: digest,
        size: f.size,
        content_type: detected.mime,
      };
      let written: string | undefined;
      try {
        await ctx.mutate(req, res, async (d) => {
          const e = await employeeFor(
            req,
            d,
            req.body.employee_id,
            "leave.write",
          );
          const id = uid(),
            key = `${id}.${detected.ext}`,
            directory = path.resolve(storageRoot, "leave");
          await mkdir(directory, { recursive: true, mode: 0o700 });
          written = path.join(directory, key);
          await writeFile(written, f.buffer, { mode: 0o600, flag: "wx" });
          const row: Row = {
            attachment_id: id,
            employee_id: e.employee_id,
            storage_key: key,
            content_type: detected.mime,
            size: f.size,
            sha256: digest,
            original_name: path
              .basename(f.originalname)
              .replace(/[\r\n\x00-\x1f]/g, "")
              .slice(0, 180),
            created_by: req.user.user_id,
            created_at: stamp(),
          };
          const { storage_key, ...safe } = row;
          return {
            data: safe,
            changes: [{ table: "Leave_Attachments", record: row }],
            id,
            entity: "leave-attachments",
            status: 201,
          };
        });
      } catch (e) {
        if (written) await unlink(written).catch(() => {});
        throw e;
      }
    }),
  );
  app.get(
    "/api/workforce/leave-attachments/:id/download",
    wrap(async (req, res) => {
      access(req, "leave.read", "self.leave");
      const d = new RequestData(ctx.repository),
        a = await d.find("Leave_Attachments", String(req.params.id));
      own(req, a.employee_id, "leave.read");
      assert(
        /^[a-f0-9-]+\.(?:pdf|png|jpg)$/i.test(a.storage_key),
        500,
        "INVALID_STORAGE_KEY",
        "The stored file key is invalid.",
      );
      const file = path.resolve(storageRoot, "leave", a.storage_key);
      res.setHeader("X-Content-Type-Options", "nosniff");
      res.setHeader("Content-Security-Policy", "default-src 'none'; sandbox");
      res.type(a.content_type);
      await new Promise<void>((resolve, reject) =>
        res.download(
          file,
          a.original_name || `document.${a.storage_key.split(".").at(-1)}`,
          (e) => (e ? reject(e) : resolve()),
        ),
      );
    }),
  );
}
