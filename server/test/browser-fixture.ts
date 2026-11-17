/** LOCAL QA ONLY. Never imported by production. No Google or business data leaves this fixture. */
import express from "express";
import session from "express-session";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import { SCHEMA, ID_FIELD } from "../src/schema.js";
import type { Repository, Change, Row } from "../src/repository.js";
import { calculatePayroll } from "../src/services/payroll-engine.js";
import { payrollRecord } from "../src/payroll.js";
if (process.env.NODE_ENV !== "test")
  throw new Error("The browser fixture only runs with NODE_ENV=test.");
class FixtureRepository implements Repository {
  data: Record<string, Row[]> = Object.fromEntries(
    Object.keys(SCHEMA).map((t) => [t, []]),
  );
  async initialize() {}
  async list(t: string) {
    return structuredClone(this.data[t] || []);
  }
  async commit(changes: Change[]) {
    const next = structuredClone(this.data);
    for (const { table, record } of changes) {
      const id = ID_FIELD[table];
      const existing = next[table].findIndex((r) => r[id] === record[id]);
      if (existing < 0) next[table].push(structuredClone(record));
      else
        next[table][existing] = {
          ...next[table][existing],
          ...structuredClone(record),
        };
    }
    this.data = next;
  }
}
const repo = new FixtureRepository();
const stamp = "2026-11-01T09:00:00.000Z";
const admin = {
  user_id: randomUUID(),
  full_name: "Alex Morgan",
  email: "alex@example.test",
  role: "administrator",
  status: "active",
  permissions: [],
  created_at: stamp,
  updated_at: stamp,
};
repo.data.Users.push(
  admin,
  {
    ...admin,
    user_id: randomUUID(),
    full_name: "HR Reviewer",
    email: "hr@example.test",
    role: "hr",
  },
  {
    ...admin,
    user_id: randomUUID(),
    full_name: "Finance Reviewer",
    email: "accountant@example.test",
    role: "accountant",
  },
);
const departments = ["Engineering", "People & Operations", "Finance"].map(
  (name) => ({
    department_id: randomUUID(),
    department_name: name,
    description: "QA fictional department",
    department_head: "",
    status: "active",
    created_at: stamp,
  }),
);
repo.data.Departments = departments;
const names = [
  "Amina Cole",
  "James Wilson",
  "Sofia Patel",
  "Liam Chen",
  "Isabella Brooks",
  "Noah Williams",
  "Olivia Carter",
  "Ethan Davis",
  "Maya Thompson",
  "Lucas Martinez",
  "Grace Kim",
  "Daniel Reed",
];
repo.data.Employees = names.map((name, i) => {
  const [first_name, last_name] = name.split(" ");
  return {
    employee_id: randomUUID(),
    employee_number: `DEMO-${String(i + 1).padStart(3, "0")}`,
    first_name,
    last_name,
    email: `${first_name.toLowerCase()}@example.test`,
    phone: "+1 202 555 0100",
    address: "Fictional test record",
    department_id: departments[i % 3].department_id,
    position: ["Product engineer", "People partner", "Financial analyst"][
      i % 3
    ],
    employment_type: i === 9 ? "contract" : "full_time",
    hire_date: `2025-${String((i % 9) + 1).padStart(2, "0")}-01`,
    employment_status: i === 10 ? "on_leave" : i === 11 ? "inactive" : "active",
    employment_end_date: "",
    basic_salary: String(3500 + i * 275) + ".00",
    allowances: "150.00",
    payment_frequency: "monthly",
    bank_name: "Test bank",
    account_number: "TEST-0000",
    emergency_contact: "Test contact",
    profile_image: "",
    created_at: `2026-11-${String(i + 1).padStart(2, "0")}T09:00:00.000Z`,
    updated_at: stamp,
  };
});
repo.data.Company_Settings = [
  {
    setting_id: "company",
    company_name: "Northstar · QA fixture",
    company_logo: "",
    currency: "USD",
    date_format: "YYYY-MM-DD",
    timezone: "UTC",
    payroll_start_day: 1,
    payroll_end_day: 31,
    default_payment_frequency: "monthly",
    configured_deductions: {
      tax_percent: "10.00",
      other_deductions: "0.00",
      allowances: "0.00",
      deduction_limit_percent: "40.00",
    },
    updated_at: stamp,
  },
];
const e = repo.data.Employees;
repo.data.Bonuses = [
  {
    bonus_id: randomUUID(),
    employee_id: e[0].employee_id,
    bonus_type: "performance",
    amount: "450.00",
    effective_month: "2026-11",
    description: "Fictional performance recognition",
    status: "approved",
    approved_by: admin.user_id,
    created_by: admin.user_id,
    created_at: stamp,
  },
  {
    bonus_id: randomUUID(),
    employee_id: e[3].employee_id,
    bonus_type: "recognition",
    amount: "250.00",
    effective_month: "2026-11",
    description: "QA pending recognition",
    status: "pending",
    created_by: admin.user_id,
    created_at: stamp,
  },
];
repo.data.Penalties = [
  {
    penalty_id: randomUUID(),
    employee_id: e[2].employee_id,
    penalty_type: "other",
    amount: "50.00",
    effective_month: "2026-11",
    description: "Fictional policy-reviewed deduction",
    status: "approved",
    approved_by: admin.user_id,
    created_by: admin.user_id,
    created_at: stamp,
  },
];
const loan = {
  loan_id: randomUUID(),
  employee_id: e[1].employee_id,
  loan_amount: "1200.00",
  outstanding_balance: "1200.00",
  installment_amount: "200.00",
  installment_frequency: "monthly",
  description: "QA employee advance",
  start_date: "2026-11-20",
  end_date: "2027-04-20",
  status: "active",
  approved_by: admin.user_id,
  created_at: stamp,
};
repo.data.Loans = [loan];
repo.data.Loan_Installments = Array.from({ length: 6 }, (_, i) => {
  const due = new Date(Date.UTC(2026, 10 + i, 20)).toISOString().slice(0, 10);
  return {
    installment_id: randomUUID(),
    loan_id: loan.loan_id,
    employee_id: loan.employee_id,
    installment_amount: "200.00",
    due_date: due,
    amount_paid: "0.00",
    remaining_balance: "200.00",
    status: "pending",
    created_at: stamp,
  };
});
for (const month of ["2026-06", "2026-07", "2026-08", "2026-09", "2026-10"]) {
  const result = calculatePayroll({
    payroll_month: month,
    employees: e.filter((_, i) => i < 6 + Number(month.slice(-2)) - 6),
    salary_history: [],
    bonuses: [],
    penalties: [],
    loans: [],
    installments: [],
    settings: repo.data.Company_Settings[0],
  });
  const run = {
    payroll_run_id: randomUUID(),
    payroll_month: month,
    ...result.totals,
    status: "finalized",
    generated_by: admin.user_id,
    approved_by: admin.user_id,
    approved_at: stamp,
    created_at: stamp,
    warnings_json: "[]",
  };
  repo.data.Payroll_Runs.push(run);
  repo.data.Payroll.push(...result.rows.map((row) => payrollRecord(row, run)));
}
repo.data.Attendance = e
  .slice(0, 8)
  .map((x, i) => ({
    attendance_id: randomUUID(),
    employee_id: x.employee_id,
    date: "2026-11-17",
    check_in: i === 2 ? "09:20" : "09:00",
    check_out: "17:00",
    attendance_status: i === 2 ? "late" : "present",
    notes: "QA record",
  }));
repo.data.Leave = [
  {
    leave_id: randomUUID(),
    employee_id: e[10].employee_id,
    leave_type: "annual",
    start_date: "2026-11-16",
    end_date: "2026-11-20",
    reason: "Fictional leave record",
    status: "approved",
    created_at: stamp,
  },
];
repo.data.Audit_Logs = e
  .slice(0, 6)
  .map((x) => ({
    log_id: randomUUID(),
    user_id: admin.user_id,
    action: "POST /api/employees",
    module: "employees",
    record_id: x.employee_id,
    previous_value: "null",
    new_value: JSON.stringify(x),
    timestamp: x.created_at,
    created_at: x.created_at,
  }));
const config = readConfig({
  NODE_ENV: "test",
  CLIENT_URL: "http://127.0.0.1:3101",
  SESSION_SECRET: "local-qa-session-secret-not-a-production-credential",
  DATABASE_URL: "postgresql://test-only-injected-repository",
  GOOGLE_CLIENT_ID: "test-client",
  GOOGLE_CLIENT_SECRET: "test-secret",
  GOOGLE_SHEETS_SPREADSHEET_ID: "test-sheet",
  GOOGLE_SERVICE_ACCOUNT_EMAIL: "test@example.test",
  GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY: "test-key",
});
const nonces = new Map<string, string>();
const provider = {
  authorizationUrl({ state, nonce }: { state: string; nonce: string }) {
    nonces.set(state, nonce);
    return `${config.origin}/api/auth/google/callback?state=${encodeURIComponent(state)}&code=${encodeURIComponent(state)}`;
  },
  async exchange(code: string) {
    const nonce = nonces.get(code) || "";
    nonces.delete(code);
    return {
      sub: "fixture-admin-google-id",
      email: admin.email,
      email_verified: true,
      nonce,
      name: admin.full_name,
    };
  },
};
const app = createApp({
  repository: repo,
  config,
  googleProvider: provider,
  sessionStore: new session.MemoryStore(),
});
const client = path.resolve("../client/dist");
app.use(express.static(client));
app.get("*", (_req, res) => res.sendFile(path.join(client, "index.html")));
app.listen(3101, "127.0.0.1", () =>
  console.log(
    "Local QA fixture http://127.0.0.1:3101; fictional test data only.",
  ),
);
