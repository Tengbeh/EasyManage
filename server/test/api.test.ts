import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import session from "express-session";
import { randomUUID } from "node:crypto";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { SCHEMA, ID_FIELD } from "../src/schema.js";
import {
  SheetsRepository,
  type Repository,
  type Row,
  type Change,
} from "../src/repository.js";
import type { GoogleProvider, GoogleIdentity } from "../src/auth.js";
import { safeCell } from "../src/reporting.js";
class MemoryRepository implements Repository {
  data: Record<string, Row[]> = Object.fromEntries(
    Object.keys(SCHEMA).map((t) => [t, []]),
  );
  commits: Change[][] = [];
  async initialize() {}
  async list(t: string) {
    return structuredClone(this.data[t]);
  }
  async commit(changes: Change[]) {
    const data = structuredClone(this.data);
    for (const { table, record } of changes) {
      assert.ok(record[ID_FIELD[table]], `Missing ${ID_FIELD[table]}`);
      for (const key of Object.keys(record))
        assert.ok(
          SCHEMA[table].includes(key) || key === "__row",
          `Unknown ${table}.${key}`,
        );
      const index = data[table].findIndex(
        (r) => r[ID_FIELD[table]] === record[ID_FIELD[table]],
      );
      const row = { ...data[table][index], ...record };
      const stored = Object.fromEntries(
        SCHEMA[table].map((k) => [
          k,
          row[k] === undefined || row[k] === null
            ? ""
            : typeof row[k] === "object"
              ? JSON.stringify(row[k])
              : String(row[k]),
        ]),
      );
      if (index >= 0) data[table][index] = stored;
      else data[table].push(stored);
    }
    this.data = data;
    this.commits.push(structuredClone(changes));
  }
}
function fixture() {
  const repo = new MemoryRepository();
  const users = ["administrator", "hr", "accountant", "viewer"].map(
    (role, i) => ({
      user_id: randomUUID(),
      full_name: `Test ${role}`,
      email: `${role}@example.test`,
      role,
      status: "active",
      permissions:
        role === "viewer"
          ? ["employees.read", "employees.write", "reports.hr"]
          : [],
      created_at: "2026-01-01T00:00:00.000Z",
    }),
  );
  repo.data.Users = users;
  const department = {
    department_id: randomUUID(),
    department_name: "Engineering",
    status: "active",
    created_at: "2026-01-01T00:00:00.000Z",
  };
  repo.data.Departments = [department];
  let identity: Partial<GoogleIdentity> = {};
  const pending = new Map<string, { nonce: string; challenge: string }>();
  const provider: GoogleProvider = {
    authorizationUrl(input) {
      pending.set(input.state, {
        nonce: input.nonce,
        challenge: input.challenge,
      });
      return `https://accounts.example.test/auth?state=${input.state}`;
    },
    async exchange(code, verifier) {
      const p = pending.get(code)!;
      assert.ok(verifier.length >= 43);
      return {
        sub: `sub-${identity.email || users[0].email}`,
        email: users[0].email,
        email_verified: true,
        nonce: p?.nonce || "",
        ...identity,
      };
    },
  };
  const config = readConfig({
    NODE_ENV: "test",
    CLIENT_URL: "http://localhost:3000",
    SESSION_SECRET: "test-session-secret-longer-than-thirty-two-characters",
    GOOGLE_CLIENT_ID: "test-client",
    GOOGLE_CLIENT_SECRET: "test-secret",
    GOOGLE_SHEETS_SPREADSHEET_ID: "test-sheet",
    GOOGLE_SERVICE_ACCOUNT_EMAIL: "service@example.test",
    GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "test-key",
  });
  const app = createApp({
    repository: repo,
    config,
    googleProvider: provider,
    sessionStore: new session.MemoryStore(),
  });
  async function login(role = "administrator") {
    identity = { email: `${role}@example.test` };
    const agent = request.agent(app);
    const started = await agent.get("/api/auth/google").expect(302);
    const state = new URL(started.headers.location).searchParams.get("state");
    await agent
      .get(`/api/auth/google/callback?state=${state}&code=${state}`)
      .expect(302);
    const me = await agent.get("/api/me").expect(200);
    return {
      agent,
      csrf: me.body.data.csrfToken,
      permissions: me.body.data.permissions,
      user: me.body.data.user,
      write: (method: string, url: string, body: any, key = randomUUID()) =>
        (agent as any)
          [method](url)
          .set("x-csrf-token", me.body.data.csrfToken)
          .set("Idempotency-Key", key)
          .send(body),
    };
  }
  const employee = (extra: Row = {}) => ({
    employee_number: `E-${randomUUID().slice(0, 6)}`,
    first_name: "Ada",
    last_name: "Lovelace",
    email: `ada-${randomUUID().slice(0, 6)}@example.test`,
    department_id: department.department_id,
    position: "Engineer",
    employment_type: "full_time",
    hire_date: "2025-01-01",
    employment_status: "active",
    basic_salary: "3000.00",
    allowances: "100.00",
    payment_frequency: "monthly",
    ...extra,
  });
  return {
    repo,
    app,
    config,
    login,
    employee,
    users,
    department,
    setIdentity: (i: Partial<GoogleIdentity>) => (identity = i),
  };
}

test("unconfigured service truthfully rejects Google sign-in and production repository reads", async () => {
  const config = readConfig({ NODE_ENV: "test" });
  const repository = new SheetsRepository(config);
  const app = createApp({
    repository,
    config,
    sessionStore: new session.MemoryStore(),
  });
  const health = await request(app).get("/api/health").expect(200);
  assert.equal(health.body.data.status, "setup_required");
  await request(app).get("/api/auth/google").expect(503);
  await request(app).get("/api/me").expect(401);
  await assert.rejects(
    repository.list("Employees"),
    (e: any) => e.status === 503,
  );
});
test("OAuth requires state, nonce, verified email and authorized account", async () => {
  const f = fixture();
  const agent = request.agent(f.app);
  await agent.get("/api/auth/google/callback?state=bad&code=bad").expect(401);
  for (const identity of [
    { nonce: "wrong" },
    { email_verified: false },
    { email: "stranger@example.test" },
  ]) {
    f.setIdentity(identity);
    const start = await agent.get("/api/auth/google").expect(302);
    const state = new URL(start.headers.location).searchParams.get("state");
    await agent
      .get(`/api/auth/google/callback?state=${state}&code=${state}`)
      .expect(identity.email ? 403 : 401);
  }
  const admin = await f.login();
  assert.ok(admin.permissions.includes("users.manage"));
  await admin.write("post", "/api/auth/logout", {}).expect(200);
  await admin.agent.get("/api/me").expect(401);
});
test("RBAC, CSRF, origin checks and sensitive employee fields are enforced", async () => {
  const f = fixture();
  const admin = await f.login();
  const created = await admin
    .write(
      "post",
      "/api/employees",
      f.employee({ bank_name: "Test bank", account_number: "1234" }),
    )
    .expect(201);
  const viewer = await f.login("viewer");
  const read = await viewer.agent
    .get(`/api/employees/${created.body.data.employee_id}`)
    .expect(200);
  assert.equal(read.body.data.basic_salary, undefined);
  assert.equal(read.body.data.account_number, undefined);
  await viewer
    .write("put", `/api/employees/${created.body.data.employee_id}`, {
      account_number: "",
    })
    .expect(403);
  await viewer
    .write("post", "/api/payroll/generate", { payroll_month: "2026-01" })
    .expect(403);
  await admin.agent
    .post("/api/departments")
    .send({ department_name: "Other" })
    .expect(403);
  await admin
    .write("post", "/api/departments", { department_name: "Other" })
    .set("Origin", "https://attacker.example")
    .expect(403);
  const accountant = await f.login("accountant");
  assert.ok(accountant.permissions.includes("salaries.write"));
  assert.ok(!accountant.permissions.includes("payroll.approve"));
});
test("employee mutation atomically includes baseline, audit, and idempotency; retries do not duplicate", async () => {
  const f = fixture();
  const admin = await f.login();
  const key = randomUUID();
  const body = f.employee();
  const first = await admin
    .write("post", "/api/employees", body, key)
    .expect(201);
  const second = await admin
    .write("post", "/api/employees", body, key)
    .expect(201);
  assert.equal(first.body.data.employee_id, second.body.data.employee_id);
  assert.equal(f.repo.data.Employees.length, 1);
  assert.equal(f.repo.data.Salary_History.length, 1);
  const committed = f.repo.commits.find((c) =>
    c.some((x) => x.table === "Employees"),
  )!;
  assert.deepEqual(
    new Set(committed.map((c) => c.table)),
    new Set(["Employees", "Salary_History", "Audit_Logs", "Idempotency"]),
  );
  await admin
    .write("post", "/api/employees", { ...body, first_name: "Different" }, key)
    .expect(409);
  await admin.write("post", "/api/employees", body).expect(409);
  await admin
    .write(
      "post",
      "/api/employees",
      f.employee({ employment_status: "terminated", employment_end_date: "" }),
    )
    .expect(422);
});
test("salary history retains baseline and employee directory filters are applied", async () => {
  const f = fixture();
  const admin = await f.login();
  const e = (
    await admin
      .write(
        "post",
        "/api/employees",
        f.employee({ employment_type: "contract" }),
      )
      .expect(201)
  ).body.data;
  await admin
    .write("post", `/api/employees/${e.employee_id}/salary`, {
      basic_salary: "4000.00",
      allowances: "200.00",
      payment_frequency: "monthly",
      effective_date: "2026-02-01",
      reason: "Annual review",
    })
    .expect(200);
  const jan = await admin
    .write("post", "/api/payroll/preview", { payroll_month: "2026-01" })
    .expect(200);
  assert.equal(jan.body.data.rows[0].basic_salary, "3000.00");
  const feb = await admin
    .write("post", "/api/payroll/preview", { payroll_month: "2026-02" })
    .expect(200);
  assert.equal(feb.body.data.rows[0].basic_salary, "4000.00");
  await admin
    .write("put", `/api/employees/${e.employee_id}`, {
      basic_salary: "5000.00",
    })
    .expect(409);
  const directory = await admin.agent
    .get("/api/employees?employment_type=contract")
    .expect(200);
  assert.equal(directory.body.meta.total, 1);
  const history = await admin.agent
    .get(`/api/employees/${e.employee_id}/history`)
    .expect(200);
  assert.equal(history.body.data[0].summary, "Employee created");
  assert.equal(history.body.data[0].new_value, undefined);
});
test("attendance and leave enforce uniqueness, chronology, and approval states", async () => {
  const f = fixture();
  const admin = await f.login();
  const e = (
    await admin.write("post", "/api/employees", f.employee()).expect(201)
  ).body.data;
  const a = {
    employee_id: e.employee_id,
    date: "2026-01-10",
    attendance_status: "late",
    check_in: "09:20",
    check_out: "17:00",
  };
  await admin.write("post", "/api/attendance", a).expect(201);
  await admin.write("post", "/api/attendance", a).expect(409);
  const list = await admin.agent.get("/api/attendance?status=late").expect(200);
  assert.equal(list.body.meta.total, 1);
  await admin
    .write("post", "/api/attendance", {
      ...a,
      date: "2026-01-11",
      check_out: "08:00",
    })
    .expect(422);
  const leave = (
    await admin
      .write("post", "/api/leave", {
        employee_id: e.employee_id,
        leave_type: "annual",
        start_date: "2026-01-12",
        end_date: "2026-01-14",
        reason: "Holiday",
      })
      .expect(201)
  ).body.data;
  await admin
    .write("patch", `/api/leave/${leave.leave_id}/approve`, {})
    .expect(200);
  await admin
    .write("post", "/api/leave", {
      employee_id: e.employee_id,
      leave_type: "sick",
      start_date: "2026-01-13",
      end_date: "2026-01-15",
      reason: "Sick",
    })
    .expect(409);
  await admin
    .write("patch", `/api/leave/${leave.leave_id}/reject`, {
      reason: "Changed",
    })
    .expect(409);
});
test("loan payments and payroll reservation reconcile exactly once through the full workflow", async () => {
  const f = fixture();
  const admin = await f.login();
  const e = (
    await admin.write("post", "/api/employees", f.employee()).expect(201)
  ).body.data;
  const loan = (
    await admin
      .write("post", "/api/loans", {
        employee_id: e.employee_id,
        loan_amount: "500.00",
        installment_amount: "200.00",
        installment_frequency: "monthly",
        start_date: "2026-01-15",
        description: "Advance",
      })
      .expect(201)
  ).body.data;
  await admin
    .write("post", `/api/loans/${loan.loan_id}/approve`, {})
    .expect(200);
  const installments = (
    await admin.agent
      .get(`/api/loans/${loan.loan_id}/installments?direction=asc`)
      .expect(200)
  ).body.data;
  assert.deepEqual(
    installments.map((r: Row) => r.installment_amount),
    ["200.00", "200.00", "100.00"],
  );
  await admin
    .write("post", `/api/loans/${loan.loan_id}/payments`, {
      installment_id: installments[0].installment_id,
      amount: "50.00",
      payment_date: "2026-01-10",
    })
    .expect(200);
  const generated = await admin
    .write("post", "/api/payroll/generate", { payroll_month: "2026-01" })
    .expect(201);
  const run = generated.body.data.run;
  assert.equal(generated.body.data.rows[0].loan_deductions, "150.00");
  await admin
    .write("post", "/api/payroll/generate", { payroll_month: "2026-01" })
    .expect(409);
  const before = await admin.agent.get("/api/reports/payroll").expect(200);
  assert.equal(before.body.meta.total, 0);
  await admin.write("post", `/api/payroll/${run.run_id}/paid`, {}).expect(409);
  await admin
    .write("post", `/api/payroll/${run.run_id}/submit`, {})
    .expect(200);
  const accountant = await f.login("accountant");
  await accountant
    .write("post", `/api/payroll/${run.run_id}/approve`, {})
    .expect(403);
  await admin
    .write("post", `/api/payroll/${run.run_id}/approve`, {})
    .expect(200);
  await admin
    .write("post", `/api/payroll/${run.run_id}/finalize`, {})
    .expect(200);
  await admin
    .write("post", `/api/loans/${loan.loan_id}/payments`, {
      installment_id: installments[0].installment_id,
      amount: "1.00",
      payment_date: "2026-01-20",
    })
    .expect(409);
  const finalized = await admin.agent.get("/api/reports/payroll").expect(200);
  assert.equal(finalized.body.meta.total, 1);
  assert.equal(f.repo.data.Loans[0].outstanding_balance, "450.00");
  const key = randomUUID();
  await admin
    .write("post", `/api/payroll/${run.run_id}/paid`, {}, key)
    .expect(200);
  await admin
    .write("post", `/api/payroll/${run.run_id}/paid`, {}, key)
    .expect(200);
  assert.equal(f.repo.data.Loans[0].outstanding_balance, "300.00");
  assert.equal(f.repo.data.Loan_Payments.length, 2);
  assert.equal(f.repo.data.Loan_Installments[0].amount_paid, "200.00");
  await admin
    .write("post", `/api/payroll/${run.run_id}/revise`, {})
    .expect(409);
});
test("payroll prevents stale source approval and requires explicit deduction review", async () => {
  const f = fixture();
  const admin = await f.login();
  const e = (
    await admin.write("post", "/api/employees", f.employee()).expect(201)
  ).body.data;
  const settings = {
    company_name: "Test",
    currency: "USD",
    date_format: "YYYY-MM-DD",
    timezone: "UTC",
    payroll_start_day: 1,
    payroll_end_day: 31,
    default_payment_frequency: "monthly",
    configured_deductions: {
      tax_percent: "30.00",
      deduction_limit_percent: "20.00",
      allowances: "0.00",
      other_deductions: "0.00",
    },
  };
  await admin.write("put", "/api/settings", settings).expect(200);
  const generated = (
    await admin
      .write("post", "/api/payroll/generate", { payroll_month: "2026-01" })
      .expect(201)
  ).body.data;
  const id = generated.run.run_id;
  assert.equal(generated.rows[0].requires_review, true);
  await admin
    .write("put", `/api/employees/${e.employee_id}`, {
      position: "Senior engineer",
    })
    .expect(200);
  await admin.write("post", `/api/payroll/${id}/submit`, {}).expect(409);
  await admin.write("post", `/api/payroll/${id}/revise`, {}).expect(200);
  await admin.write("post", `/api/payroll/${id}/submit`, {}).expect(200);
  await admin.write("post", `/api/payroll/${id}/approve`, {}).expect(422);
  await admin
    .write("post", `/api/payroll/${id}/approve`, { reviewed: true })
    .expect(200);
  await admin.write("post", `/api/payroll/${id}/finalize`, {}).expect(200);
});
test("CSV/XLSX/PDF exports work and CSV formula payloads are neutralized", async () => {
  const f = fixture();
  const admin = await f.login();
  await admin
    .write(
      "post",
      "/api/employees",
      f.employee({ first_name: '=HYPERLINK("https://example.test")' }),
    )
    .expect(201);
  const csv = await admin.agent
    .get("/api/reports/employees?format=csv")
    .expect(200);
  assert.ok(csv.text.includes("'=HYPERLINK"));
  const xlsx = await admin.agent
    .get("/api/reports/employees?format=xlsx")
    .expect(200);
  assert.match(xlsx.headers["content-type"], /spreadsheetml/);
  const pdf = await admin.agent
    .get("/api/reports/employees?format=pdf")
    .expect(200);
  assert.match(pdf.headers["content-type"], /application\/pdf/);
  assert.equal(safeCell("  =1+1"), "'  =1+1");
  const viewer = await f.login("viewer");
  const hr = await viewer.agent.get("/api/reports/employees").expect(200);
  assert.equal(hr.body.data[0].basic_salary, undefined);
  await viewer.agent.get("/api/reports/payroll").expect(403);
});
test("user self-access changes are blocked and disabled sessions lose access", async () => {
  const f = fixture();
  const admin = await f.login();
  await admin
    .write("put", `/api/users/${admin.user.user_id}`, { role: "hr" })
    .expect(409);
  const accountant = await f.login("accountant");
  await admin
    .write("put", `/api/users/${accountant.user.user_id}`, {
      status: "inactive",
    })
    .expect(200);
  await admin
    .write("put", `/api/users/${accountant.user.user_id}`, {
      full_name: "Updated disabled accountant",
    })
    .expect(200);
  assert.equal(
    f.repo.data.Users.find((u) => u.user_id === accountant.user.user_id)!
      .status,
    "inactive",
  );
  await accountant.agent.get("/api/me").expect(401);
});
test("dashboard redacts finance metrics and notifications maintain per-user read state", async () => {
  const f = fixture();
  const admin = await f.login();
  const e = (
    await admin.write("post", "/api/employees", f.employee()).expect(201)
  ).body.data;
  await admin
    .write("post", "/api/bonuses", {
      employee_id: e.employee_id,
      bonus_type: "performance",
      description: "Recognition",
      amount: "50.00",
      effective_month: "2026-01",
    })
    .expect(201);
  const dashboard = await admin.agent
    .get("/api/dashboard?month=2026-01")
    .expect(200);
  assert.equal(dashboard.body.data.metrics.total_employees, 1);
  const viewer = await f.login("viewer");
  const limited = await viewer.agent
    .get("/api/dashboard?month=2026-01")
    .expect(200);
  assert.equal(limited.body.data.metrics.monthly_gross_payroll, undefined);
  const notifications = (
    await admin.agent.get("/api/notifications").expect(200)
  ).body.data;
  assert.ok(notifications.length);
  const n = notifications[0];
  await admin
    .write(
      "patch",
      `/api/notifications/${encodeURIComponent(n.notification_id)}/read`,
      {},
    )
    .expect(200);
  const reread = (await admin.agent.get("/api/notifications").expect(200)).body
    .data;
  assert.equal(
    reread.find((r: Row) => r.notification_id === n.notification_id).read,
    true,
  );
});

test("blank allowances inherit company defaults while explicit zero overrides dated salary history", async () => {
  const f = fixture();
  const admin = await f.login();
  await admin
    .write("put", "/api/settings", {
      company_name: "Allowance inheritance test",
      currency: "USD",
      date_format: "YYYY-MM-DD",
      timezone: "UTC",
      payroll_start_day: 1,
      payroll_end_day: 31,
      default_payment_frequency: "monthly",
      configured_deductions: { allowances: "125.50" },
    })
    .expect(200);
  const create = async (allowances: string | undefined) =>
    (
      await admin
        .write("post", "/api/employees", f.employee({ allowances }))
        .expect(201)
    ).body.data;
  const inherited = await create(undefined);
  const blank = await create("");
  const zero = await create("0.00");
  const baseline = f.repo.data.Salary_History.find(
    (h) => h.employee_id === inherited.employee_id,
  )!;
  assert.equal(baseline.allowances, "");
  assert.equal(baseline.previous_allowances, "");
  const preview = async (payroll_month: string) =>
    (
      await admin
        .write("post", "/api/payroll/preview", { payroll_month })
        .expect(200)
    ).body.data.rows as Row[];
  const january = await preview("2026-01");
  assert.equal(
    january.find((r) => r.employee_id === inherited.employee_id)!.allowances,
    "125.50",
  );
  assert.equal(
    january.find((r) => r.employee_id === blank.employee_id)!.allowances,
    "125.50",
  );
  assert.equal(
    january.find((r) => r.employee_id === zero.employee_id)!.allowances,
    "0.00",
  );
  const salary = {
    basic_salary: "3000.00",
    payment_frequency: "monthly",
    reason: "Allowance policy change",
  };
  const overridden = await admin
    .write("post", `/api/employees/${inherited.employee_id}/salary`, {
      ...salary,
      allowances: "0.00",
      effective_date: "2026-02-01",
    })
    .expect(200);
  assert.equal(overridden.body.data.previous_allowances, "");
  const restored = await admin
    .write("post", `/api/employees/${inherited.employee_id}/salary`, {
      ...salary,
      effective_date: "2026-03-01",
    })
    .expect(200);
  assert.equal(restored.body.data.allowances, "");
  assert.equal(restored.body.data.previous_allowances, "0.00");
  await admin
    .write("post", `/api/employees/${zero.employee_id}/salary`, {
      ...salary,
      allowances: "",
      effective_date: "2026-03-01",
    })
    .expect(200);
  const february = await preview("2026-02");
  const march = await preview("2026-03");
  assert.equal(
    february.find((r) => r.employee_id === inherited.employee_id)!.allowances,
    "0.00",
  );
  assert.equal(
    march.find((r) => r.employee_id === inherited.employee_id)!.allowances,
    "125.50",
  );
  assert.equal(
    march.find((r) => r.employee_id === zero.employee_id)!.allowances,
    "125.50",
  );
});

test("scheduled termination remains active through its inclusive end date", async () => {
  const f = fixture();
  const admin = await f.login();
  const employee = (
    await admin.write("post", "/api/employees", f.employee()).expect(201)
  ).body.data;
  const today = new Date().toISOString().slice(0, 10);
  const future = new Date(Date.now() + 7 * 86400000).toISOString().slice(0, 10);
  const yesterday = new Date(Date.now() - 86400000).toISOString().slice(0, 10);
  for (const [end, status] of [
    [future, "active"],
    [today, "active"],
    [yesterday, "terminated"],
  ]) {
    const changed = await admin
      .write("patch", `/api/employees/${employee.employee_id}/status`, {
        employment_status: "terminated",
        employment_end_date: end,
      })
      .expect(200);
    assert.equal(changed.body.data.employment_status, status);
    const profile = await admin.agent
      .get(`/api/employees/${employee.employee_id}`)
      .expect(200);
    assert.equal(profile.body.data.employment_status, status);
    assert.equal(profile.body.data.employment_end_date, end);
  }
});
