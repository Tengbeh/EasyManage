import request from "supertest";
import session from "express-session";
import { randomUUID } from "node:crypto";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { PostgresRepository } from "../src/repositories/postgres.js";
import { createApp } from "../src/app.js";
import { readConfig } from "../src/config.js";
import type { GoogleProvider } from "../src/auth.js";
import type { Row } from "../src/repository.js";
export async function workforceFixture() {
  if (process.env.NODE_ENV !== "test" || !process.env.DATABASE_URL)
    throw new Error("An isolated PostgreSQL test database is required.");
  const client = new PrismaClient({
    adapter: new PrismaPg({
      connectionString: process.env.DATABASE_URL,
      max: 5,
    }),
  });
  const companyId = randomUUID();
  await client.company.create({
    data: { company_id: companyId, name: `Workforce tests ${companyId}` },
  });
  const repo = new PostgresRepository({ client, companyId });
  const directory = await mkdtemp(
    path.join(os.tmpdir(), "easymanage-workforce-"),
  );
  const department = {
    department_id: randomUUID(),
    department_name: "Quality",
    status: "active",
  };
  const employees = ["Employee One", "Employee Two"].map((name, i) => ({
    employee_id: randomUUID(),
    employee_number: `W-${i + 1}`,
    first_name: name.split(" ")[0],
    last_name: name.split(" ")[1],
    email: `employee${i + 1}@example.test`,
    department_id: department.department_id,
    basic_salary: "3100.00",
    payment_frequency: "monthly",
    hire_date: "2025-01-01",
    employment_status: "active",
    employment_type: "full_time",
  }));
  const users: Row[] = [
    "administrator",
    "hr",
    "employee",
    "employee2",
    "accountant",
  ].map((role, i) => ({
    user_id: randomUUID(),
    full_name: role,
    email: `${role}@example.test`,
    role: role === "employee2" ? "employee" : role,
    status: "active",
    permissions: [],
    ...(role === "employee"
      ? { employee_id: employees[0].employee_id }
      : role === "employee2"
        ? { employee_id: employees[1].employee_id }
        : {}),
  }));
  await repo.commit([
    { table: "Departments", record: department },
    ...employees.map((record) => ({ table: "Employees", record })),
    ...users.map((record) => ({ table: "Users", record })),
    {
      table: "Company_Settings",
      record: {
        setting_id: "company",
        company_name: "Workforce Test",
        currency: "USD",
        timezone: "UTC",
        payroll_start_day: 1,
        payroll_end_day: 31,
        default_payment_frequency: "monthly",
        date_format: "YYYY-MM-DD",
        configured_deductions: {
          tax_percent: "0.00",
          other_deductions: "0.00",
          allowances: "0.00",
          deduction_limit_percent: "100.00",
        },
      },
    },
  ]);
  const nonces = new Map<string, string>();
  let requestedEmail = users[0].email;
  const provider: GoogleProvider = {
    authorizationUrl({ state, nonce }) {
      nonces.set(state, nonce);
      return `https://accounts.example.test/auth?state=${state}`;
    },
    async exchange(code) {
      return {
        sub: `verified-${requestedEmail}`,
        email: requestedEmail,
        email_verified: true,
        nonce: nonces.get(code) || "",
      };
    },
  };
  const config = readConfig({
    ...process.env,
    NODE_ENV: "test",
    DEFAULT_COMPANY_ID: companyId,
    CLIENT_URL: "http://localhost:3102",
    SESSION_SECRET: "test-only-long-session-secret-for-workforce",
    GOOGLE_CLIENT_ID: "test-only",
    GOOGLE_CLIENT_SECRET: "test-only",
    STORAGE_ROOT: directory,
  });
  const app = createApp({
    repository: repo,
    config,
    googleProvider: provider,
    sessionStore: new session.MemoryStore(),
  });
  async function login(role = "administrator") {
    requestedEmail = `${role}@example.test`;
    const agent = request.agent(app),
      start = await agent.get("/api/auth/google").expect(302),
      state = new URL(start.headers.location).searchParams.get("state");
    await agent
      .get(`/api/auth/google/callback?state=${state}&code=${state}`)
      .expect(302);
    const me = (await agent.get("/api/auth/me").expect(200)).body.data;
    return {
      agent,
      csrf: me.csrfToken,
      user: me.user,
      write(
        method: "post" | "put" | "patch",
        url: string,
        body: unknown = {},
        key = randomUUID(),
      ) {
        return agent[method](url)
          .set("x-csrf-token", me.csrfToken)
          .set("Idempotency-Key", key)
          .send(body);
      },
    };
  }
  const schedule = {
    name: "Standard",
    timezone: "UTC",
    work_days: [0, 1, 2, 3, 4, 5, 6],
    expected_start: "09:00",
    expected_end: "17:00",
    grace_minutes: 5,
    break_minutes: 0,
    track_breaks: true,
    overtime_enabled: true,
    overtime_after_minutes: 480,
    overtime_multiplier: "1.5",
    unpaid_absence_enabled: true,
    attendance_bonus_enabled: true,
    half_day_minutes: 240,
    status: "active",
  };
  return {
    app,
    repo,
    client,
    companyId,
    department,
    employees,
    users,
    login,
    schedule,
    provider,
    setEmail: (email: string) => (requestedEmail = email),
    async close() {
      await client.$disconnect();
      await rm(directory, { recursive: true, force: true });
    },
  };
}
