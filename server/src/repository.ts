import { GoogleAuth } from "google-auth-library";
import { sheets, type sheets_v4 } from "@googleapis/sheets";
import { SCHEMA, ID_FIELD } from "./schema.js";
import type { Config } from "./config.js";
import { sheetsConfigured } from "./config.js";
import { AppError, unavailable } from "./errors.js";
export type Row = Record<string, any>;
export interface Change {
  table: string;
  record: Row;
}
export interface Repository {
  list(table: string): Promise<Row[]>;
  commit(changes: Change[]): Promise<void>;
  initialize(): Promise<void>;
  invalidate?(): void;
}
export class Mutex {
  private tail: Promise<unknown> = Promise.resolve();
  async run<T>(fn: () => Promise<T>): Promise<T> {
    const next = this.tail.then(fn, fn);
    this.tail = next.catch(() => {});
    return next;
  }
}
export class SheetsRepository implements Repository {
  private client: sheets_v4.Sheets | null;
  private config: Config;
  private tabs = new Map<
    string,
    { id: number; headers: string[]; rowCount: number; columnCount: number }
  >();
  private cache = new Map<string, { until: number; rows: Row[] }>();
  private loading = new Map<string, Promise<Row[]>>();
  private mutex = new Mutex();
  private uncertain = false;
  constructor(config: Config) {
    this.config = config;
    this.client = sheetsConfigured(config)
      ? sheets({
          version: "v4",
          auth: new GoogleAuth({
            scopes: ["https://www.googleapis.com/auth/spreadsheets"],
            ...(config.googleCredentialsFile
              ? { keyFile: config.googleCredentialsFile }
              : {
                  credentials: {
                    client_email: config.googleServiceAccountEmail,
                    private_key: config.googlePrivateKey,
                  },
                }),
          }),
        })
      : null;
  }
  private ready() {
    if (!this.client) throw unavailable();
    return this.client;
  }
  invalidate() {
    this.cache.clear();
  }
  private async metadata() {
    if (this.tabs.size) return;
    const api = this.ready();
    try {
      const { data } = await api.spreadsheets.get(
        {
          spreadsheetId: this.config.spreadsheetId,
          fields: "sheets.properties",
        },
        { retry: true, timeout: 20000 },
      );
      for (const s of data.sheets || []) {
        const p = s.properties!;
        this.tabs.set(p.title!, {
          id: p.sheetId!,
          headers: [],
          rowCount: p.gridProperties?.rowCount || 1000,
          columnCount: p.gridProperties?.columnCount || 26,
        });
      }
    } catch {
      throw new AppError(
        503,
        "SHEETS_CONNECTION_FAILED",
        "Could not read the company spreadsheet. Verify its ID and service-account access.",
      );
    }
  }
  async initialize() {
    await this.mutex.run(async () => {
      await this.metadata();
      const api = this.ready();
      const missing = Object.keys(SCHEMA).filter((t) => !this.tabs.has(t));
      if (missing.length) {
        try {
          await api.spreadsheets.batchUpdate(
            {
              spreadsheetId: this.config.spreadsheetId,
              requestBody: {
                requests: missing.map((title) => ({
                  addSheet: {
                    properties: {
                      title,
                      gridProperties: {
                        rowCount: 1000,
                        columnCount: Math.max(50, SCHEMA[title].length),
                        frozenRowCount: 1,
                      },
                    },
                  },
                })),
              },
            },
            { retry: false, timeout: 30000 },
          );
        } catch {
          throw new AppError(
            503,
            "SCHEMA_INITIALIZATION_FAILED",
            "Worksheet creation failed. Inspect the spreadsheet before rerunning initialization.",
          );
        }
        this.tabs.clear();
        await this.metadata();
      }
      const requests: sheets_v4.Schema$Request[] = [];
      for (const [table, columns] of Object.entries(SCHEMA)) {
        const tab = this.tabs.get(table)!;
        const { data } = await api.spreadsheets.values.get(
          { spreadsheetId: this.config.spreadsheetId, range: `'${table}'!1:1` },
          { retry: true, timeout: 20000 },
        );
        const existing = (data.values?.[0] || []).map(String);
        if (existing.some((x, i) => !x || existing.indexOf(x) !== i))
          throw new Error(`Invalid duplicate or blank header in ${table}`);
        const headers = [
          ...existing,
          ...columns.filter((c) => !existing.includes(c)),
        ];
        tab.headers = headers;
        if (headers.length > tab.columnCount) {
          requests.push({
            appendDimension: {
              sheetId: tab.id,
              dimension: "COLUMNS",
              length: headers.length - tab.columnCount,
            },
          });
          tab.columnCount = headers.length;
        }
        if (headers.length !== existing.length) {
          requests.push({
            updateCells: {
              range: {
                sheetId: tab.id,
                startRowIndex: 0,
                endRowIndex: 1,
                startColumnIndex: 0,
                endColumnIndex: headers.length,
              },
              rows: [
                {
                  values: headers.map((h) => ({
                    userEnteredValue: { stringValue: h },
                  })),
                },
              ],
              fields: "userEnteredValue",
            },
          });
          requests.push({
            repeatCell: {
              range: { sheetId: tab.id, startRowIndex: 0, endRowIndex: 1 },
              cell: {
                userEnteredFormat: {
                  backgroundColor: { red: 0.08, green: 0.15, blue: 0.25 },
                  textFormat: {
                    bold: true,
                    foregroundColor: { red: 1, green: 1, blue: 1 },
                  },
                },
              },
              fields: "userEnteredFormat",
            },
          });
        }
      }
      if (requests.length)
        await api.spreadsheets.batchUpdate(
          {
            spreadsheetId: this.config.spreadsheetId,
            requestBody: { requests },
          },
          { retry: false, timeout: 30000 },
        );
      this.invalidate();
    });
  }
  async list(table: string): Promise<Row[]> {
    if (!SCHEMA[table]) throw new Error(`Unknown worksheet ${table}`);
    const cached = this.cache.get(table);
    if (cached && cached.until > Date.now())
      return structuredClone(cached.rows);
    if (this.loading.has(table))
      return structuredClone(await this.loading.get(table)!);
    const read = this.read(table);
    this.loading.set(table, read);
    try {
      return structuredClone(await read);
    } finally {
      this.loading.delete(table);
    }
  }
  private async read(table: string): Promise<Row[]> {
    await this.metadata();
    const tab = this.tabs.get(table);
    if (!tab)
      throw new AppError(
        503,
        "SHEETS_NOT_INITIALIZED",
        `Worksheet ${table} is missing. Run npm run init-sheets.`,
      );
    try {
      const { data } = await this.ready().spreadsheets.values.get(
        {
          spreadsheetId: this.config.spreadsheetId,
          range: `'${table}'`,
          valueRenderOption: "UNFORMATTED_VALUE",
          dateTimeRenderOption: "FORMATTED_STRING",
        },
        { retry: true, timeout: 20000 },
      );
      const all = data.values || [];
      tab.headers = (all[0] || []).map(String);
      if (
        tab.headers.some((h, i) => !h || tab.headers.indexOf(h) !== i) ||
        !tab.headers.includes(ID_FIELD[table])
      )
        throw new AppError(
          503,
          "INVALID_WORKSHEET_HEADERS",
          `Worksheet ${table} has invalid headers.`,
        );
      if (SCHEMA[table].some((h) => !tab.headers.includes(h)))
        throw new AppError(
          503,
          "SHEETS_SCHEMA_OUTDATED",
          `Worksheet ${table} needs initialization.`,
        );
      if (
        all
          .slice(1)
          .some(
            (values) =>
              values.some((v) => v !== "" && v !== null && v !== undefined) &&
              !values[tab.headers.indexOf(ID_FIELD[table])],
          )
      )
        throw new AppError(
          503,
          "MISSING_WORKSHEET_IDS",
          `Worksheet ${table} contains data without a record ID; repair the row before continuing.`,
        );
      const rows = all
        .slice(1)
        .map((values, index) =>
          Object.assign(
            Object.fromEntries(tab.headers.map((h, i) => [h, values[i] ?? ""])),
            { __row: index + 1 },
          ),
        )
        .filter((row) => row[ID_FIELD[table]]);
      const ids = rows.map((r) => String(r[ID_FIELD[table]]));
      if (new Set(ids).size !== ids.length)
        throw new AppError(
          503,
          "DUPLICATE_WORKSHEET_IDS",
          `Worksheet ${table} contains duplicate IDs; resolve these before continuing.`,
        );
      this.cache.set(table, { until: Date.now() + 15000, rows });
      return rows;
    } catch (e) {
      if (e instanceof AppError) throw e;
      throw new AppError(
        503,
        "SHEETS_READ_FAILED",
        "Google Sheets could not be read. Please retry shortly.",
      );
    }
  }
  async commit(changes: Change[]): Promise<void> {
    if (!changes.length) return;
    await this.mutex.run(async () => {
      if (this.uncertain)
        throw new AppError(
          503,
          "WRITE_RECONCILIATION_REQUIRED",
          "A prior Sheets write has an uncertain outcome. Retry its original idempotency key or have an administrator reconcile it before restarting the writer.",
        );
      this.invalidate();
      const tables = [...new Set(changes.map((c) => c.table))];
      const snapshots = new Map<string, Row[]>();
      for (const t of tables) snapshots.set(t, await this.list(t));
      const requests: sheets_v4.Schema$Request[] = [];
      for (const t of tables) {
        const tab = this.tabs.get(t)!;
        const rows = snapshots.get(t)!;
        let end = Math.max(0, ...rows.map((r) => r.__row));
        const pending = new Map<string, Row>();
        for (const change of changes.filter((c) => c.table === t)) {
          const id = String(change.record[ID_FIELD[t]] || "");
          if (!id) throw new Error(`Missing ${ID_FIELD[t]}`);
          const previous =
            pending.get(id) || rows.find((r) => String(r[ID_FIELD[t]]) === id);
          const row = {
            ...previous,
            ...change.record,
            __row: previous?.__row ?? ++end,
          };
          pending.set(id, row);
        }
        if (end >= tab.rowCount) {
          requests.push({
            appendDimension: {
              sheetId: tab.id,
              dimension: "ROWS",
              length: end - tab.rowCount + 100,
            },
          });
          tab.rowCount = end + 100;
        }
        for (const row of pending.values()) {
          const keys = Object.keys(row).filter(
            (k) => k !== "__row" && !tab.headers.includes(k),
          );
          if (keys.length)
            throw new Error(`Unknown ${t} columns: ${keys.join(", ")}`);
          requests.push({
            updateCells: {
              range: {
                sheetId: tab.id,
                startRowIndex: row.__row,
                endRowIndex: row.__row + 1,
                startColumnIndex: 0,
                endColumnIndex: tab.headers.length,
              },
              rows: [
                {
                  values: tab.headers.map((key) => {
                    const v = row[key];
                    return {
                      userEnteredValue: {
                        stringValue:
                          v === undefined || v === null
                            ? ""
                            : typeof v === "object"
                              ? JSON.stringify(v)
                              : String(v),
                      },
                    };
                  }),
                },
              ],
              fields: "userEnteredValue",
            },
          });
        }
      }
      try {
        await this.ready().spreadsheets.batchUpdate(
          {
            spreadsheetId: this.config.spreadsheetId,
            requestBody: { requests },
          },
          { retry: false, timeout: 45000 },
        );
      } catch (error: any) {
        this.invalidate();
        const status = error?.response?.status;
        if (!status || status >= 500) {
          this.uncertain = true;
          throw new AppError(
            503,
            "WRITE_OUTCOME_UNKNOWN",
            "Google Sheets did not confirm this write. Retry with the same Idempotency-Key; do not repeat with a new key.",
          );
        }
        throw new AppError(
          status === 429 ? 503 : 502,
          "SHEETS_WRITE_REJECTED",
          "Google Sheets rejected the change; no batch changes were applied.",
        );
      } finally {
        this.invalidate();
      }
    });
  }
}
export function publicRow(row: Row): Row {
  const { __row, ...rest } = row;
  return rest;
}
export class RequestData {
  private rows = new Map<string, Promise<Row[]>>();
  constructor(public repository: Repository) {}
  list(table: string) {
    if (!this.rows.has(table))
      this.rows.set(table, this.repository.list(table));
    return this.rows.get(table)!;
  }
  async find(table: string, id: string) {
    const row = (await this.list(table)).find(
      (r) => String(r[ID_FIELD[table]]) === id || r.run_id === id,
    );
    if (!row)
      throw new AppError(
        404,
        "NOT_FOUND",
        "The requested record was not found.",
      );
    return row;
  }
}
