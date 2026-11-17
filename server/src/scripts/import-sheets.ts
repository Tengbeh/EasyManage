import "dotenv/config";
import { createHash } from "node:crypto";
import { pathToFileURL } from "node:url";
import { writeFile } from "node:fs/promises";
import { GoogleAuth } from "google-auth-library";
import { sheets } from "@googleapis/sheets";
import { readConfig } from "../config.js";
import type { Repository, Row, Change } from "../repository.js";
import { AppError } from "../errors.js";
import {
  DATABASE_TABLES,
  DEFAULT_COMPANY_ID,
  PostgresRepository,
  normalizedDatabaseRow,
} from "../repositories/postgres.js";

export type ImportData = Record<string, Row[]>;
export interface ImportReport {
  mode: "dry-run" | "apply";
  company_id: string;
  tables: Record<
    string,
    {
      source: number;
      existing: number;
      insert: number;
      identical: number;
      verified?: number;
    }
  >;
  source_checksum: string;
  payroll_snapshot_checksum: string;
  conflicts: { table: string; id: string; reason: string }[];
}
function stable(value: any): string {
  if (value === undefined) return "null";
  if (value === null || typeof value !== "object") return JSON.stringify(value);
  if (Array.isArray(value)) return `[${value.map(stable).join(",")}]`;
  return `{${Object.keys(value)
    .sort()
    .map((k) => `${JSON.stringify(k)}:${stable(value[k])}`)
    .join(",")}}`;
}
function digest(value: any) {
  return createHash("sha256").update(stable(value)).digest("hex");
}
const snapshots = (data: ImportData) =>
  Object.entries(data)
    .filter(([table]) => table === "Payroll")
    .flatMap(([, rows]) =>
      rows.map((row) => ({
        payroll_id: row.payroll_id,
        snapshot_json: row.snapshot_json || "",
      })),
    )
    .sort((a, b) => a.payroll_id.localeCompare(b.payroll_id));

/** Repeatable insert-only migration; dry-run performs reads and validation only. */
export async function importRows(
  repository: Repository,
  source: ImportData,
  options: { apply?: boolean; companyId?: string } = {},
): Promise<ImportReport> {
  const scope = options.companyId || DEFAULT_COMPANY_ID;
  if (!repository.transaction)
    throw new AppError(
      503,
      "TRANSACTIONS_REQUIRED",
      "Import requires a transaction-capable PostgreSQL repository.",
    );
  return repository.transaction(async (tx) => {
    const report: ImportReport = {
      mode: options.apply ? "apply" : "dry-run",
      company_id: scope,
      tables: {},
      source_checksum: "",
      payroll_snapshot_checksum: digest(snapshots(source)),
      conflicts: [],
    };
    const target: ImportData = {};
    const normalized: ImportData = {};
    const changes: Change[] = [];
    for (const table of Object.keys(source))
      if (!DATABASE_TABLES[table])
        throw new AppError(
          422,
          "UNKNOWN_IMPORT_TABLE",
          `Cannot import unknown table ${table}.`,
        );
    for (const [table, spec] of Object.entries(DATABASE_TABLES)) {
      target[table] = await tx.list(table);
      const byId = new Map(
        target[table].map((row) => [
          String(row[spec.id]),
          normalizedDatabaseRow(table, row, scope),
        ]),
      );
      const seen = new Set<string>();
      normalized[table] = [];
      const stats = {
        source: source[table]?.length || 0,
        existing: target[table].length,
        insert: 0,
        identical: 0,
      };
      report.tables[table] = stats;
      for (const raw of source[table] || []) {
        const id =
          spec.fields[spec.id] === "uuid"
            ? String(raw[spec.id] || "").toLowerCase()
            : String(raw[spec.id] || "");
        if (raw.company_id && raw.company_id !== scope) {
          report.conflicts.push({
            table,
            id,
            reason: "Source company does not match import scope",
          });
          continue;
        }
        if (!id || seen.has(id)) {
          report.conflicts.push({
            table,
            id,
            reason: "Missing or duplicate source record ID",
          });
          continue;
        }
        seen.add(id);
        let row: Row;
        try {
          row = normalizedDatabaseRow(table, raw, scope);
        } catch (error) {
          report.conflicts.push({
            table,
            id,
            reason:
              error instanceof AppError ? error.code : "Invalid source field",
          });
          continue;
        }
        normalized[table].push(row);
        const existing = byId.get(id);
        if (existing) {
          if (stable(existing) !== stable(row))
            report.conflicts.push({
              table,
              id,
              reason:
                "Target record differs; importer never overwrites target rows",
            });
          else stats.identical++;
        } else {
          stats.insert++;
          changes.push({ table, record: { ...raw, company_id: scope } });
          byId.set(id, row);
        }
      }
      target[table] = [...byId.values()];
    }
    // Validate same-company parent relationships and business uniqueness before any INSERT.
    const allIds = Object.fromEntries(
      Object.entries(target).map(([table, rows]) => [
        table,
        new Map(rows.map((row) => [row[DATABASE_TABLES[table].id], row])),
      ]),
    );
    for (const [table, rows] of Object.entries(normalized)) {
      const spec = DATABASE_TABLES[table];
      for (const row of rows) {
        for (const ref of spec.references) {
          const id = row[ref.field];
          if (!id) {
            if (ref.required)
              report.conflicts.push({
                table,
                id: row[spec.id],
                reason: `Required ${ref.field} is missing`,
              });
            continue;
          }
          const parent = allIds[ref.table].get(id);
          if (
            !parent ||
            ref.extra.some((field) => row[field] !== parent[field])
          )
            report.conflicts.push({
              table,
              id: row[spec.id],
              reason: `Invalid same-company ${ref.field} reference`,
            });
        }
      }
    }
    for (const [table, spec] of Object.entries(DATABASE_TABLES)) {
      for (const keys of spec.unique) {
        const values = new Map<string, string>();
        for (const row of target[table]) {
          if (keys.some((key) => row[key] === "" || row[key] == null)) continue;
          const value = stable(
            keys.map((key) =>
              key === "email" ? String(row[key]).toLowerCase() : row[key],
            ),
          );
          if (values.has(value) && values.get(value) !== row[spec.id])
            report.conflicts.push({
              table,
              id: row[spec.id],
              reason: `Duplicate unique fields: ${keys.join(", ")}`,
            });
          values.set(value, row[spec.id]);
        }
      }
    }
    report.source_checksum = digest(normalized);
    if (report.conflicts.length || !options.apply) return report;
    await tx.commit(changes);
    const readback: ImportData = {};
    for (const [table, stats] of Object.entries(report.tables)) {
      const all = await tx.list(table);
      if (all.length !== stats.existing + stats.insert)
        throw new AppError(
          409,
          "IMPORT_VERIFICATION_FAILED",
          `Row counts did not reconcile for ${table}; import rolled back.`,
        );
      const spec = DATABASE_TABLES[table];
      const sourceIds = new Set(normalized[table].map((row) => row[spec.id]));
      readback[table] = all
        .filter((row) => sourceIds.has(row[spec.id]))
        .map((row) => normalizedDatabaseRow(table, row, scope))
        .sort((a, b) => String(a[spec.id]).localeCompare(String(b[spec.id])));
      const expected = [...normalized[table]].sort((a, b) =>
        String(a[spec.id]).localeCompare(String(b[spec.id])),
      );
      if (stable(readback[table]) !== stable(expected))
        throw new AppError(
          409,
          "IMPORT_VERIFICATION_FAILED",
          `Stored values did not reconcile for ${table}; import rolled back.`,
        );
      stats.verified = readback[table].length;
    }
    if (digest(snapshots(readback)) !== report.payroll_snapshot_checksum)
      throw new AppError(
        409,
        "PAYROLL_SNAPSHOT_MISMATCH",
        "Immutable payroll snapshots changed during migration; import rolled back.",
      );
    return report;
  });
}

/** Read-only Google transport. Never calls legacy initialize() or changes worksheets. */
export async function readLegacySheets(): Promise<ImportData> {
  const c = readConfig();
  if (
    !c.spreadsheetId ||
    (!c.googleCredentialsFile &&
      !(c.googleServiceAccountEmail && c.googlePrivateKey))
  )
    throw new AppError(
      503,
      "LEGACY_SHEETS_NOT_CONFIGURED",
      "Configure the legacy spreadsheet and read-only service-account access for import.",
    );
  const auth = new GoogleAuth({
    scopes: ["https://www.googleapis.com/auth/spreadsheets.readonly"],
    ...(c.googleCredentialsFile
      ? { keyFile: c.googleCredentialsFile }
      : {
          credentials: {
            client_email: c.googleServiceAccountEmail,
            private_key: c.googlePrivateKey,
          },
        }),
  });
  const api = sheets({ version: "v4", auth });
  const metadata = await api.spreadsheets.get(
    { spreadsheetId: c.spreadsheetId, fields: "sheets.properties.title" },
    { retry: true, timeout: 30000 },
  );
  const available = (metadata.data.sheets || []).map(
    (s) => s.properties!.title!,
  );
  const legacy = [
    "Users",
    "Employees",
    "Departments",
    "Bonuses",
    "Penalties",
    "Loans",
    "Loan_Installments",
    "Payroll",
    "Payroll_Runs",
    "Attendance",
    "Audit_Logs",
    "Company_Settings",
  ];
  for (const table of legacy)
    if (!available.includes(table))
      throw new AppError(
        422,
        "MISSING_SOURCE_WORKSHEET",
        `Required legacy worksheet ${table} is missing.`,
      );
  const names = Object.keys(DATABASE_TABLES).filter((t) =>
    available.includes(t),
  );
  const batch = await api.spreadsheets.values.batchGet(
    {
      spreadsheetId: c.spreadsheetId,
      ranges: names.map((name) => `'${name}'`),
      valueRenderOption: "UNFORMATTED_VALUE",
      dateTimeRenderOption: "FORMATTED_STRING",
    },
    { retry: true, timeout: 60000 },
  );
  const result: ImportData = {};
  for (let i = 0; i < names.length; i++) {
    const table = names[i];
    const values = batch.data.valueRanges?.[i].values || [];
    const headers = (values[0] || []).map(String);
    const id = DATABASE_TABLES[table].id;
    if (
      !headers.includes(id) ||
      headers.some((h, j) => !h || headers.indexOf(h) !== j)
    )
      throw new AppError(
        422,
        "INVALID_SOURCE_HEADERS",
        `Source ${table} has missing or duplicate headers.`,
      );
    result[table] = values
      .slice(1)
      .filter((row) => row.some((v) => v !== "" && v != null))
      .map((row) =>
        Object.fromEntries(headers.map((h, j) => [h, row[j] ?? ""])),
      );
  }
  return result;
}

async function main() {
  const args = process.argv.slice(2);
  const allowed = new Set(["--apply", "--dry-run", "--company-id", "--report"]);
  for (let i = 0; i < args.length; i++) {
    if (!allowed.has(args[i])) throw new Error(`Unknown argument ${args[i]}`);
    if (["--company-id", "--report"].includes(args[i])) i++;
  }
  if (args.includes("--apply") && args.includes("--dry-run"))
    throw new Error("Choose --apply or --dry-run, not both.");
  const value = (flag: string) => {
    const i = args.indexOf(flag);
    return i >= 0 ? args[i + 1] : undefined;
  };
  const scope =
    value("--company-id") ||
    process.env.DEFAULT_COMPANY_ID ||
    DEFAULT_COMPANY_ID;
  const repository = new PostgresRepository({
    companyId: scope,
    transactionTimeoutMs: 300000,
  });
  try {
    await repository.initialize();
    const source = await readLegacySheets();
    const report = await importRows(repository, source, {
      apply: args.includes("--apply"),
      companyId: scope,
    });
    const output = JSON.stringify(report, null, 2) + "\n";
    if (value("--report"))
      await writeFile(value("--report")!, output, { mode: 0o600 });
    console.log(output);
    if (report.conflicts.length) process.exitCode = 2;
  } finally {
    await repository.disconnect();
  }
}
if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href)
  main().catch((error) => {
    console.error(error instanceof Error ? error.message : "Import failed");
    process.exitCode = 1;
  });
