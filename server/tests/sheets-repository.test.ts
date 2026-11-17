import test from "node:test";
import assert from "node:assert/strict";
import { SheetsRepository } from "../src/repository.js";
import { readConfig } from "../src/config.js";
import { SCHEMA } from "../src/schema.js";
function fixture() {
  const repo = new SheetsRepository(readConfig({ NODE_ENV: "test" }));
  const data: Record<string, any[][]> = Object.fromEntries(
    Object.entries(SCHEMA).map(([t, cols]) => [t, [[...cols]]]),
  );
  const names = Object.keys(SCHEMA);
  let reads = 0;
  let writes = 0;
  let captured: any[] = [];
  let failure: any;
  const client = {
    spreadsheets: {
      get: async () => ({
        data: {
          sheets: names.map((title, sheetId) => ({
            properties: {
              title,
              sheetId,
              gridProperties: { rowCount: 1000, columnCount: 100 },
            },
          })),
        },
      }),
      values: {
        get: async ({ range }: { range: string }) => {
          reads++;
          const table = range.match(/^'([^']+)'/)![1];
          return {
            data: {
              values: structuredClone(
                range.endsWith("1:1") ? [data[table][0]] : data[table],
              ),
            },
          };
        },
      },
      batchUpdate: async ({ requestBody }: any) => {
        writes++;
        captured = requestBody.requests;
        if (failure) throw failure;
        for (const r of requestBody.requests) {
          if (r.updateCells) {
            const c = r.updateCells;
            const table = names[c.range.sheetId];
            for (let i = 0; i < c.rows.length; i++) {
              data[table][c.range.startRowIndex + i] = c.rows[i].values.map(
                (v: any) => v.userEnteredValue?.stringValue ?? "",
              );
            }
          }
        }
        return { data: {} };
      },
    },
  };
  (repo as any).client = client;
  return {
    repo,
    data,
    names,
    get reads() {
      return reads;
    },
    get writes() {
      return writes;
    },
    get requests() {
      return captured;
    },
    fail: (err: any) => {
      failure = err;
    },
  };
}
test("Sheets schema initialization preserves existing data and checks every required worksheet", async () => {
  const f = fixture();
  await f.repo.initialize();
  assert.equal(f.reads, Object.keys(SCHEMA).length);
  assert.equal(f.writes, 0);
});
test("Sheets writes entity, audit, and idempotency together using literal values", async () => {
  const f = fixture();
  await f.repo.commit([
    {
      table: "Departments",
      record: {
        department_id: "d1",
        department_name: '=IMPORTXML("malicious")',
      },
    },
    { table: "Audit_Logs", record: { log_id: "a1", action: "create" } },
    {
      table: "Idempotency",
      record: { idempotency_id: "key-1", response_json: "{}" },
    },
  ]);
  assert.equal(f.writes, 1);
  assert.equal(f.requests.length, 3);
  const cell =
    f.requests[0].updateCells.rows[0].values[
      SCHEMA.Departments.indexOf("department_name")
    ];
  assert.deepEqual(cell, {
    userEnteredValue: { stringValue: '=IMPORTXML("malicious")' },
  });
  assert.equal((await f.repo.list("Departments"))[0].department_id, "d1");
});
test("durable IDs resolve fresh row locations for an update", async () => {
  const f = fixture();
  const headers = SCHEMA.Departments;
  const row = (id: string, name: string) =>
    headers.map((h) =>
      h === "department_id" ? id : h === "department_name" ? name : "",
    );
  f.data.Departments.push(row("d1", "People"), row("d2", "Finance"));
  await f.repo.list("Departments");
  f.data.Departments = [
    f.data.Departments[0],
    row("d2", "Finance"),
    row("d1", "People"),
  ];
  await f.repo.commit([
    {
      table: "Departments",
      record: { department_id: "d1", department_name: "People operations" },
    },
  ]);
  assert.equal(f.requests[0].updateCells.range.startRowIndex, 2);
  assert.equal(f.data.Departments[1][1], "Finance");
  assert.equal(f.data.Departments[2][1], "People operations");
});
test("cache avoids repeated reads and returned rows are safe to mutate", async () => {
  const f = fixture();
  await f.repo.commit([
    {
      table: "Departments",
      record: { department_id: "d1", department_name: "People" },
    },
  ]);
  const first = await f.repo.list("Departments");
  const reads = f.reads;
  first[0].department_name = "Changed only in caller";
  const second = await f.repo.list("Departments");
  assert.equal(f.reads, reads);
  assert.equal(second[0].department_name, "People");
});
test("uncertain write failures do not silently retry or permit a fresh write", async () => {
  const f = fixture();
  f.fail({ response: { status: 503 } });
  await assert.rejects(
    f.repo.commit([
      {
        table: "Departments",
        record: { department_id: "d1", department_name: "People" },
      },
    ]),
    (err: any) => err.code === "WRITE_OUTCOME_UNKNOWN",
  );
  assert.equal(f.writes, 1);
  await assert.rejects(
    f.repo.commit([
      {
        table: "Departments",
        record: { department_id: "d2", department_name: "Finance" },
      },
    ]),
    (err: any) => err.code === "WRITE_RECONCILIATION_REQUIRED",
  );
  assert.equal(f.writes, 1);
});
test("missing credentials fail explicitly; there is no fallback business store", async () => {
  const repo = new SheetsRepository(readConfig({ NODE_ENV: "test" }));
  await assert.rejects(
    repo.list("Employees"),
    (err: any) => err.status === 503,
  );
});
