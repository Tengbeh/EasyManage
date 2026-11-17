import { AsyncLocalStorage } from "node:async_hooks";
import type { Request, Response } from "express";
import { gzipSync, gunzipSync } from "node:zlib";
import { createHash, randomUUID } from "node:crypto";
import {
  RequestData,
  Mutex,
  publicRow,
  type Repository,
  type Row,
  type Change,
} from "./repository.js";
import { assert } from "./errors.js";
import { querySchema } from "./validation.js";
export interface MutationResult {
  data: any;
  changes: Change[];
  entity?: string;
  id?: string;
  previous?: any;
  status?: number;
}
export class ApiContext {
  readonly mutex = new Mutex();
  private scope = new AsyncLocalStorage<Repository>();
  constructor(private base: Repository) {}
  get repository() {
    return this.scope.getStore() || this.base;
  }
  withRepository<T>(repository: Repository, fn: () => T): T {
    return this.scope.run(repository, fn);
  }
  async transaction<T>(fn: (repository: Repository) => Promise<T>): Promise<T> {
    const repository = this.repository;
    const run = (tx: Repository) => this.withRepository(tx, () => fn(tx));
    return repository.transaction
      ? repository.transaction(run)
      : this.mutex.run(() => run(repository));
  }
  async mutate(
    req: Request,
    res: Response,
    fn: (data: RequestData) => Promise<MutationResult>,
  ) {
    const response = await this.transaction(async (repository) => {
      const key = req.header("Idempotency-Key");
      assert(
        key && /^[A-Za-z0-9_-]{16,128}$/.test(key),
        400,
        "IDEMPOTENCY_KEY_REQUIRED",
        "Provide a unique Idempotency-Key (16–128 characters) and retain it when retrying.",
      );
      const hash = createHash("sha256")
        .update(
          JSON.stringify({
            user: req.user.user_id,
            method: req.method,
            path: req.originalUrl,
            body: req.body,
          }),
        )
        .digest("hex");
      repository.invalidate?.();
      const d = new RequestData(repository);
      const ledger = repository.find
        ? await repository.find("Idempotency", key)
        : (await d.list("Idempotency")).find((r) => r.idempotency_id === key);
      if (ledger) {
        assert(
          ledger.user_id === req.user.user_id && ledger.request_hash === hash,
          409,
          "IDEMPOTENCY_CONFLICT",
          "This Idempotency-Key was already used for another request.",
        );
        return {
          status: Number(ledger.status_code) || 200,
          body: JSON.parse(
            String(ledger.response_json).startsWith("gz:")
              ? gunzipSync(
                  Buffer.from(ledger.response_json.slice(3), "base64"),
                ).toString()
              : ledger.response_json,
          ),
        };
      }
      const result = await fn(d);
      const body = { data: result.data };
      const now = new Date().toISOString();
      const auditValue = (value: any) => {
        const v = JSON.stringify(value);
        return v.length > 32000
          ? JSON.stringify({
              summary: "Large operation; use record snapshots for full details",
              sha256: createHash("sha256").update(v).digest("hex"),
            })
          : v;
      };
      const audit: Row = {
        log_id: randomUUID(),
        user_id: req.user.user_id,
        user_email: req.user.email,
        action: `${req.method} ${req.path}`,
        module: result.entity || req.path.split("/")[2] || "system",
        record_id: result.id || "",
        previous_value: auditValue(result.previous ?? null),
        new_value: auditValue(result.data),
        timestamp: now,
        created_at: now,
        ip_address: req.ip || "",
      };
      const response =
        "gz:" + gzipSync(JSON.stringify(body)).toString("base64");
      assert(
        response.length < 45000,
        422,
        "RESPONSE_TOO_LARGE",
        "This operation exceeds the supported single-batch response size. Contact an administrator.",
      );
      await repository.commit([
        ...result.changes,
        { table: "Audit_Logs", record: audit },
        {
          table: "Idempotency",
          record: {
            idempotency_id: key,
            user_id: req.user.user_id,
            request_hash: hash,
            response_json: response,
            status_code: result.status || 200,
            created_at: now,
          },
        },
      ]);
      return { status: result.status || 200, body };
    });
    // Never acknowledge a successful mutation before the database transaction commits.
    res.status(response.status).json(response.body);
  }
}
export function filtered(
  rows: Row[],
  query: unknown,
  dateField?: string,
): { rows: Row[]; page: number; pageSize: number } {
  const q = querySchema.parse(query);
  let out = rows.map(publicRow);
  for (const key of [
    "employee_id",
    "department_id",
    "employment_status",
    "employment_type",
    "status",
  ] as const)
    if (q[key])
      out = out.filter(
        (r) =>
          String(
            key === "status" ? r.status || r.attendance_status : r[key],
          ) === q[key],
      );
  if (q.search) {
    const search = q.search.toLowerCase();
    out = out.filter((r) =>
      Object.values(r).some(
        (v) => typeof v === "string" && v.toLowerCase().includes(search),
      ),
    );
  }
  if (q.month || q.year) {
    const prefix = q.month?.includes("-")
      ? q.month
      : q.year && q.month
        ? `${q.year}-${q.month.padStart(2, "0")}`
        : q.year
          ? String(q.year)
          : undefined;
    out = out.filter((r) => {
      const date = String(
        r[dateField || ""] ||
          r.payroll_month ||
          r.effective_month ||
          r.date ||
          r.payment_date ||
          r.start_date ||
          r.created_at ||
          "",
      );
      return prefix
        ? date.startsWith(prefix)
        : date.slice(5, 7) === q.month?.padStart(2, "0");
    });
  }
  const sort = q.sort || dateField || "created_at";
  out.sort(
    (a, b) =>
      String(a[sort] ?? "").localeCompare(String(b[sort] ?? ""), undefined, {
        numeric: true,
      }) * (q.direction === "asc" ? 1 : -1),
  );
  return { rows: out, page: q.page, pageSize: q.pageSize };
}
export function listResponse(
  res: Response,
  rows: Row[],
  query: unknown,
  dateField?: string,
) {
  const result = filtered(rows, query, dateField);
  res.json({
    data: result.rows.slice(
      (result.page - 1) * result.pageSize,
      result.page * result.pageSize,
    ),
    meta: {
      total: result.rows.length,
      page: result.page,
      pageSize: result.pageSize,
    },
  });
}
