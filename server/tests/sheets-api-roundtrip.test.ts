import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import supertest from "supertest";
import session from "express-session";
import { SheetsRepository } from "../src/repository.js";
import { SCHEMA } from "../src/schema.js";
import { readConfig } from "../src/config.js";
import { createApp } from "../src/app.js";
import { defaultSettings } from "../src/domain.js";
/** Uses the production Sheets adapter, with only its Google HTTP transport replaced.
 * Every cell round-trips through strings, as a real Sheets write does. */
test("full payroll workflow survives Sheets cell serialization and validates every written schema column", async () => {
  const config = readConfig({
    NODE_ENV: "test",
    CLIENT_URL: "http://localhost:3000",
    SESSION_SECRET: "test-session-secret-at-least-thirty-two-characters",
    GOOGLE_CLIENT_ID: "test",
    GOOGLE_CLIENT_SECRET: "test",
    GOOGLE_SHEETS_SPREADSHEET_ID: "test",
    GOOGLE_SERVICE_ACCOUNT_EMAIL: "test@example.test",
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "test",
  });
  const repo = new SheetsRepository(config);
  const names = Object.keys(SCHEMA);
  const data: Record<string, string[][]> = Object.fromEntries(
    Object.entries(SCHEMA).map(([t, cols]) => [t, [[...cols]]]),
  );
  (repo as any).client = {
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
        get: async ({ range }: any) => ({
          data: {
            values: structuredClone(data[range.match(/^'([^']+)'/)![1]]),
          },
        }),
      },
      batchUpdate: async ({ requestBody }: any) => {
        for (const r of requestBody.requests) {
          if (r.updateCells) {
            const c = r.updateCells;
            for (let i = 0; i < c.rows.length; i++)
              data[names[c.range.sheetId]][c.range.startRowIndex + i] = c.rows[
                i
              ].values.map((v: any) => v.userEnteredValue?.stringValue ?? "");
          }
        }
        return { data: {} };
      },
    },
  };
  const admin = {
    user_id: randomUUID(),
    email: "admin@example.test",
    full_name: "Test Administrator",
    role: "administrator",
    status: "active",
    permissions: [],
  };
  await repo.commit([
    { table: "Users", record: admin },
    {
      table: "Company_Settings",
      record: { ...defaultSettings(), company_name: "Test company" },
    },
  ]);
  let nonce = "";
  const provider = {
    authorizationUrl: (o: any) => {
      nonce = o.nonce;
      return `http://google.example.test/?state=${o.state}`;
    },
    exchange: async () => ({
      email: admin.email,
      sub: "test-subject",
      email_verified: true,
      nonce,
    }),
  };
  const api = supertest.agent(
    createApp({
      repository: repo,
      config,
      googleProvider: provider,
      sessionStore: new session.MemoryStore(),
    }),
  );
  const start = await api.get("/api/auth/google");
  const state = new URL(start.headers.location).searchParams.get("state");
  const login = await api.get(
    `/api/auth/google/callback?code=test&state=${state}`,
  );
  assert.equal(login.status, 302, JSON.stringify(login.body));
  const me = await api.get("/api/auth/me");
  const csrf = me.body.data.csrfToken;
  const mutate = async (
    method: "post" | "put" | "patch",
    url: string,
    body: any = {},
  ) => {
    const res = await api[method](url)
      .set("x-csrf-token", csrf)
      .set("Idempotency-Key", randomUUID())
      .send(body);
    assert.ok(
      res.status < 300,
      `${method} ${url}: ${res.status} ${JSON.stringify(res.body)}`,
    );
    return res.body.data;
  };
  const dept = await mutate("post", "/api/departments", {
    department_name: "Engineering",
    status: "active",
  });
  const employee = await mutate("post", "/api/employees", {
    employee_number: "E001",
    first_name: "Amina",
    last_name: "Cole",
    email: "amina@example.test",
    department_id: dept.department_id,
    position: "Engineer",
    employment_type: "full_time",
    hire_date: "2026-01-01",
    basic_salary: "3100.00",
    payment_frequency: "monthly",
    employment_status: "active",
  });
  const bonus = await mutate("post", "/api/bonuses", {
    employee_id: employee.employee_id,
    bonus_type: "performance",
    amount: "100.10",
    effective_month: "2026-01",
    description: "Test bonus",
  });
  await mutate("patch", `/api/bonuses/${bonus.bonus_id}/approve`);
  const penalty = await mutate("post", "/api/penalties", {
    employee_id: employee.employee_id,
    penalty_type: "other",
    amount: "20.20",
    effective_month: "2026-01",
    description: "Approved test deduction",
  });
  await mutate("patch", `/api/penalties/${penalty.penalty_id}/approve`);
  const loan = await mutate("post", "/api/loans", {
    employee_id: employee.employee_id,
    loan_amount: "400.00",
    installment_amount: "100.00",
    installment_frequency: "monthly",
    start_date: "2026-01-20",
    description: "Test loan",
  });
  await mutate("post", `/api/loans/${loan.loan_id}/approve`);
  const run = await mutate("post", "/api/payroll/generate", {
    payroll_month: "2026-01",
  });
  assert.equal(run.rows[0].net_salary, "3079.90");
  const id = run.run.payroll_run_id;
  await mutate("post", `/api/payroll/${id}/submit`);
  await mutate("post", `/api/payroll/${id}/approve`, { reviewed: true });
  await mutate("post", `/api/payroll/${id}/finalize`);
  let saved = await api.get(`/api/payroll/${id}`);
  assert.equal(saved.body.data.rows[0].payment_status, "unpaid");
  assert.equal(saved.body.data.rows[0].net_salary, "3079.90");
  await mutate("post", `/api/payroll/${id}/paid`);
  saved = await api.get(`/api/payroll/${id}`);
  assert.equal(saved.body.data.rows[0].payment_status, "paid");
  const loans = await api.get(`/api/loans/${loan.loan_id}`);
  assert.equal(loans.body.data.outstanding_balance, "300.00");
  assert.equal((await repo.list("Loan_Payments")).length, 1);
  assert.equal((await repo.list("Payroll")).length, 1);
  assert.equal(
    (await api.get("/api/reports/payroll?month=2026-01")).body.data[0]
      .net_salary,
    "3079.90",
  );
});
