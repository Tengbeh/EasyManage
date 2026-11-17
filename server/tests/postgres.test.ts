import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { PrismaClient } from "../src/generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import {
  PostgresRepository,
  DATABASE_TABLES,
} from "../src/repositories/postgres.js";
import { importRows } from "../src/scripts/import-sheets.js";
import type { Row } from "../src/repository.js";
const enabled = process.env.RUN_DATABASE_TESTS === "1";
if (enabled && (process.env.NODE_ENV !== "test" || !process.env.DATABASE_URL))
  throw new Error(
    "Database integration tests require NODE_ENV=test and an isolated DATABASE_URL.",
  );

test(
  "real PostgreSQL foundation: tenancy, exact decimals, transactions, locks and migration fidelity",
  {
    skip: !enabled
      ? "Set RUN_DATABASE_TESTS=1 NODE_ENV=test with an isolated migrated PostgreSQL database."
      : false,
  },
  async (t) => {
    const client = new PrismaClient({
      adapter: new PrismaPg({
        connectionString: process.env.DATABASE_URL,
        max: 10,
      }),
    });
    const companyA = randomUUID(),
      companyB = randomUUID();
    await client.company.createMany({
      data: [
        { company_id: companyA, name: `Database integration A ${companyA}` },
        { company_id: companyB, name: `Database integration B ${companyB}` },
      ],
    });
    const a = new PostgresRepository({ client, companyId: companyA });
    const b = a.forCompany(companyB);
    const departmentId = randomUUID(),
      employeeId = randomUUID(),
      userId = randomUUID();
    const employee = {
      employee_id: employeeId,
      employee_number: "TEST-001",
      first_name: "Ada",
      last_name: "Example",
      email: "ada@example.test",
      department_id: departmentId,
      hire_date: "2026-01-01",
      basic_salary: "123456789012.34",
      allowances: "",
      employment_status: "active",
      employment_type: "full_time",
      payment_frequency: "monthly",
    };
    try {
      await t.test(
        "typed relational core and health are available",
        async () => {
          await a.initialize();
          assert.equal((await a.health()).connected, true);
          assert.ok(Object.keys(DATABASE_TABLES).length >= 26);
          const columns = await client.$queryRaw<
            Row[]
          >`SELECT column_name,data_type,numeric_precision,numeric_scale FROM information_schema.columns WHERE table_schema='public' AND table_name='employees'`;
          const salary = columns.find((c) => c.column_name === "basic_salary")!;
          assert.equal(salary.data_type, "numeric");
          assert.equal(salary.numeric_scale, 2);
          assert.equal(
            columns.find((c) => c.column_name === "hire_date")!.data_type,
            "date",
          );
        },
      );
      await t.test(
        "a batch permits reverse dependency order and preserves decimals/legacy extensions",
        async () => {
          await a.commit([
            {
              table: "Employees",
              record: {
                ...employee,
                legacy_custom_field: { label: "preserve this" },
              },
            },
            {
              table: "Departments",
              record: {
                department_id: departmentId,
                department_name: "Engineering",
              },
            },
            {
              table: "Users",
              record: {
                user_id: userId,
                full_name: "Admin",
                email: "admin@example.test",
                role: "administrator",
                status: "active",
                employee_id: employeeId,
                permissions: ["payroll.approve"],
              },
            },
          ]);
          const e = (await a.find("Employees", employeeId))!;
          assert.equal(e.basic_salary, "123456789012.34");
          assert.equal(e.allowances, "");
          assert.equal(e.hire_date, "2026-01-01");
          assert.deepEqual(e.legacy_custom_field, { label: "preserve this" });
          assert.deepEqual((await a.find("Users", userId))!.permissions, [
            "payroll.approve",
          ]);
        },
      );
      await t.test(
        "same UUIDs across companies are isolated on list/find/query/upsert",
        async () => {
          await b.commit([
            {
              table: "Departments",
              record: {
                department_id: departmentId,
                department_name: "Other company",
              },
            },
            {
              table: "Employees",
              record: { ...employee, first_name: "Other" },
            },
          ]);
          assert.equal(
            (await a.find("Employees", employeeId))!.first_name,
            "Ada",
          );
          assert.equal(
            (await b.find("Employees", employeeId))!.first_name,
            "Other",
          );
          assert.equal((await a.list("Employees")).length, 1);
          const q = await b.query("Employees", {
            where: { first_name: { contains: "oth" } },
            take: 10,
          });
          assert.equal(q.total, 1);
          assert.equal(q.rows[0].company_id, companyB);
          await assert.rejects(
            b.query("Employees", { where: { company_id: companyA } }),
            (e: any) => e.status === 403,
          );
          await assert.rejects(
            a.commit([
              {
                table: "Employees",
                record: { ...employee, company_id: companyB },
              },
            ]),
            (e: any) => e.status === 403,
          );
        },
      );
      await t.test(
        "foreign keys reject cross-company and wrong-employee references atomically",
        async () => {
          const isolatedDepartment = randomUUID();
          await a.commit([
            {
              table: "Departments",
              record: {
                department_id: isolatedDepartment,
                department_name: "Private A",
              },
            },
          ]);
          const invalidEmployee = randomUUID();
          await assert.rejects(
            b.commit([
              {
                table: "Employees",
                record: {
                  ...employee,
                  employee_id: invalidEmployee,
                  employee_number: "BAD-1",
                  email: "invalid@example.test",
                  department_id: isolatedDepartment,
                },
              },
            ]),
          );
          assert.equal(await b.find("Employees", invalidEmployee), null);
          const loanId = randomUUID(),
            installmentId = randomUUID();
          await a.commit([
            {
              table: "Loans",
              record: {
                loan_id: loanId,
                employee_id: employeeId,
                loan_amount: "100.00",
                outstanding_balance: "100.00",
                status: "active",
              },
            },
          ]);
          const anotherId = randomUUID();
          await a.commit([
            {
              table: "Employees",
              record: {
                ...employee,
                employee_id: anotherId,
                employee_number: "TEST-002",
                email: "another@example.test",
              },
            },
          ]);
          await assert.rejects(
            a.commit([
              {
                table: "Loan_Installments",
                record: {
                  installment_id: installmentId,
                  loan_id: loanId,
                  employee_id: anotherId,
                  installment_amount: "50.00",
                  due_date: "2026-01-31",
                },
              },
            ]),
          );
          assert.equal(await a.find("Loan_Installments", installmentId), null);
        },
      );
      await t.test(
        "full transaction rolls back business, audit and idempotency together",
        async () => {
          const id = randomUUID();
          await assert.rejects(
            a.transaction(async (tx) => {
              await tx.commit([
                {
                  table: "Bonuses",
                  record: {
                    bonus_id: id,
                    employee_id: employeeId,
                    amount: "25.50",
                    effective_month: "2026-01",
                    status: "pending",
                  },
                },
                {
                  table: "Audit_Logs",
                  record: {
                    log_id: id,
                    user_id: userId,
                    action: "test",
                    timestamp: new Date().toISOString(),
                  },
                },
                {
                  table: "Idempotency",
                  record: {
                    idempotency_id: id,
                    user_id: userId,
                    request_hash: "a",
                    response_json: "{}",
                    status_code: 200,
                  },
                },
              ]);
              throw new Error("Intentional test rollback");
            }),
            /Intentional test rollback/,
          );
          for (const table of ["Bonuses", "Audit_Logs", "Idempotency"])
            assert.equal(await a.find(table, id), null);
        },
      );
      await t.test(
        "company advisory locks serialize concurrent read/modify/write across clients",
        async () => {
          const other = new PostgresRepository({
            connectionString: process.env.DATABASE_URL,
            companyId: companyA,
          });
          try {
            await a.commit([
              {
                table: "Company_Settings",
                record: { setting_id: "counter", company_name: "0" },
              },
            ]);
            let firstRead!: () => void;
            const started = new Promise<void>(
              (resolve) => (firstRead = resolve),
            );
            let release!: () => void;
            const ready = new Promise<void>((resolve) => (release = resolve));
            const first = a.transaction(async (tx) => {
              const row = (await tx.list("Company_Settings")).find(
                (r) => r.setting_id === "counter",
              )!;
              firstRead();
              await ready;
              await tx.commit([
                {
                  table: "Company_Settings",
                  record: {
                    ...row,
                    company_name: String(Number(row.company_name) + 1),
                  },
                },
              ]);
            });
            await started;
            let secondEntered = false;
            const second = other.transaction(async (tx) => {
              secondEntered = true;
              const row = (await tx.list("Company_Settings")).find(
                (r) => r.setting_id === "counter",
              )!;
              await tx.commit([
                {
                  table: "Company_Settings",
                  record: {
                    ...row,
                    company_name: String(Number(row.company_name) + 1),
                  },
                },
              ]);
            });
            await new Promise((resolve) => setTimeout(resolve, 75));
            assert.equal(secondEntered, false);
            release();
            await Promise.all([first, second]);
            assert.equal(
              (await a.find("Company_Settings", "counter"))!.company_name,
              "2",
            );
            await a.transaction(async (tx) => {
              await assert.rejects(
                async () => tx.forCompany!(companyB),
                (e: any) => e.status === 403,
              );
            });
          } finally {
            await other.disconnect();
          }
        },
      );
      await t.test(
        "database constraints reject duplicate attendance, unsafe decimal precision and negative balances",
        async () => {
          const id = randomUUID();
          await a.commit([
            {
              table: "Attendance",
              record: {
                attendance_id: id,
                employee_id: employeeId,
                date: "2026-02-01",
                attendance_status: "present",
                work_minutes: 480,
                breaks: [
                  {
                    start: "2026-02-01T12:00:00.000Z",
                    end: "2026-02-01T12:30:00.000Z",
                  },
                ],
              },
            },
          ]);
          await assert.rejects(
            a.commit([
              {
                table: "Attendance",
                record: {
                  attendance_id: randomUUID(),
                  employee_id: employeeId,
                  date: "2026-02-01",
                },
              },
            ]),
            (e: any) => e.status === 409,
          );
          await assert.rejects(
            a.commit([
              {
                table: "Employees",
                record: { employee_id: employeeId, basic_salary: "0.001" },
              },
            ]),
            (e: any) => e.status === 422,
          );
          await assert.rejects(
            a.commit([
              {
                table: "Loans",
                record: {
                  loan_id: randomUUID(),
                  employee_id: employeeId,
                  outstanding_balance: "-1.00",
                },
              },
            ]),
            (e: any) => e.status === 422,
          );
        },
      );
      await t.test(
        "workforce relations round-trip schedules, fractional leave and circular document references",
        async () => {
          const scheduleId = randomUUID(),
            assignmentId = randomUUID(),
            holidayId = randomUUID(),
            correctionId = randomUUID(),
            typeId = randomUUID(),
            entitlementId = randomUUID(),
            leaveId = randomUUID(),
            attachmentId = randomUUID(),
            decisionId = randomUUID(),
            inputId = randomUUID(),
            bonusId = randomUUID();
          const attendance = (await a.list("Attendance"))[0];
          await a.commit([
            {
              table: "Shift_Assignments",
              record: {
                assignment_id: assignmentId,
                employee_id: employeeId,
                schedule_id: scheduleId,
                start_date: "2026-01-01",
                end_date: "2026-12-31",
              },
            },
            {
              table: "Work_Schedules",
              record: {
                schedule_id: scheduleId,
                department_id: departmentId,
                name: "Office",
                timezone: "Europe/London",
                expected_start: "09:00",
                expected_end: "17:00",
                work_days: [1, 2, 3, 4, 5],
                track_breaks: false,
                overtime_enabled: true,
                unpaid_absence_enabled: false,
                overtime_multiplier: "1.250001",
                break_minutes: 30,
                grace_minutes: 5,
              },
            },
            {
              table: "Holidays",
              record: {
                holiday_id: holidayId,
                department_id: departmentId,
                date: "2026-02-02",
                name: "Company holiday",
              },
            },
            {
              table: "Attendance_Corrections",
              record: {
                correction_id: correctionId,
                attendance_id: attendance.attendance_id,
                employee_id: employeeId,
                requested_by: userId,
                status: "pending",
                clock_in: "2026-02-01T09:00:00.000Z",
                clock_out: "2026-02-01T17:00:00.000Z",
                break_minutes: 30,
                reason: "Correct clock record",
              },
            },
            {
              table: "Leave_Entitlements",
              record: {
                entitlement_id: entitlementId,
                employee_id: employeeId,
                leave_type_id: typeId,
                year: 2026,
                days: "12.50",
              },
            },
            {
              table: "Leave_Types",
              record: {
                leave_type_id: typeId,
                name: "Study leave",
                paid: false,
                annual_entitlement: "12.50",
                carry_forward_limit: "2.25",
                accrual_mode: "monthly",
                allow_self_approval: false,
                requires_document: true,
                approval_roles: ["hr", "administrator"],
              },
            },
            {
              table: "Leave",
              record: {
                leave_id: leaveId,
                employee_id: employeeId,
                leave_type_id: typeId,
                supporting_attachment_id: attachmentId,
                start_date: "2026-02-03",
                end_date: "2026-02-03",
                days: "1.00",
                status: "pending",
                approval_roles: ["hr", "administrator"],
                approval_level: 0,
              },
            },
            {
              table: "Leave_Attachments",
              record: {
                attachment_id: attachmentId,
                employee_id: employeeId,
                leave_id: leaveId,
                storage_key: randomUUID(),
                content_type: "application/pdf",
                size: 123,
                original_name: "evidence.pdf",
                sha256: "a".repeat(64),
              },
            },
            {
              table: "Approval_Decisions",
              record: {
                decision_id: decisionId,
                request_type: "leave",
                request_id: leaveId,
                approver_id: userId,
                decision: "approved",
                approval_level: 0,
              },
            },
            {
              table: "Attendance_Payroll_Inputs",
              record: {
                input_id: inputId,
                employee_id: employeeId,
                payroll_month: "2026-02",
                type: "overtime",
                status: "approved",
                bonus_id: bonusId,
                amount: "7.50",
                attendance_ids: [attendance.attendance_id],
                calculation: { minutes: 30, rate: "15.00" },
                policy_snapshot: { overtime_multiplier: "1.250001" },
              },
            },
            {
              table: "Bonuses",
              record: {
                bonus_id: bonusId,
                employee_id: employeeId,
                amount: "7.50",
                effective_month: "2026-02",
                status: "approved",
              },
            },
          ]);
          const schedule = (await a.find("Work_Schedules", scheduleId))!;
          assert.equal(schedule.track_breaks, false);
          assert.equal(schedule.overtime_enabled, true);
          assert.equal(schedule.overtime_multiplier, "1.250001");
          assert.deepEqual(schedule.work_days, [1, 2, 3, 4, 5]);
          assert.equal(
            (await a.find("Leave_Entitlements", entitlementId))!.days,
            "12.50",
          );
          assert.equal((await a.find("Leave_Types", typeId))!.paid, false);
          assert.equal(
            (await a.find("Leave", leaveId))!.supporting_attachment_id,
            attachmentId,
          );
          assert.equal(
            (await a.find("Leave_Attachments", attachmentId))!.leave_id,
            leaveId,
          );
          assert.equal(
            (await a.find("Attendance_Corrections", correctionId))!.clock_in,
            "2026-02-01T09:00:00.000Z",
          );
          assert.deepEqual(
            (await a.find("Attendance_Payroll_Inputs", inputId))!.calculation,
            { minutes: 30, rate: "15.00" },
          );
          assert.equal(
            (await a.find("Approval_Decisions", decisionId))!.request_id,
            leaveId,
          );
          assert.equal((await b.list("Leave_Attachments")).length, 0);
          await assert.rejects(
            a.commit([
              {
                table: "Shift_Assignments",
                record: {
                  assignment_id: randomUUID(),
                  employee_id: employeeId,
                  schedule_id: scheduleId,
                  start_date: "2026-03-01",
                  end_date: "2026-02-28",
                },
              },
            ]),
          );
        },
      );
      await t.test(
        "dry-run is read-only; apply repeats safely and preserves exact payroll snapshot text",
        async () => {
          const companyC = randomUUID();
          await client.company.create({
            data: { company_id: companyC, name: "Import verification" },
          });
          const target = a.forCompany(companyC);
          const runId = randomUUID(),
            payrollId = randomUUID();
          const snapshot =
            '{ "employee_id": "' +
            employeeId +
            '", "net_salary": "1000.00", "installment_allocations": [] }';
          const source = {
            Departments: [
              { department_id: departmentId, department_name: "Imported" },
            ],
            Employees: [employee],
            Users: [
              {
                user_id: userId,
                email: "import@example.test",
                role: "administrator",
                status: "active",
              },
            ],
            Payroll_Runs: [
              {
                payroll_run_id: runId,
                payroll_month: "2026-01",
                status: "finalized",
                total_gross_salary: "1000.00",
                total_net_payroll: "1000.00",
                total_employees: "1",
              },
            ],
            Payroll: [
              {
                payroll_id: payrollId,
                payroll_run_id: runId,
                employee_id: employeeId,
                payroll_month: "2026-01",
                status: "finalized",
                basic_salary: "1000.00",
                net_salary: "1000.00",
                snapshot_json: snapshot,
              },
            ],
          };
          const duplicate = structuredClone(source);
          duplicate.Employees.push({
            ...employee,
            employee_id: employeeId.toUpperCase(),
          });
          const duplicateReport = await importRows(target, duplicate, {
            companyId: companyC,
            apply: true,
          });
          assert.ok(
            duplicateReport.conflicts.some((c) =>
              c.reason.includes("duplicate source record ID"),
            ),
          );
          const brokenReference = structuredClone(source);
          brokenReference.Employees[0].department_id = randomUUID();
          const referenceReport = await importRows(target, brokenReference, {
            companyId: companyC,
            apply: true,
          });
          assert.ok(
            referenceReport.conflicts.some((c) =>
              c.reason.includes("department_id reference"),
            ),
          );
          const uniqueCollision = structuredClone(source);
          uniqueCollision.Employees.push({
            ...employee,
            employee_id: randomUUID(),
            employee_number: "TEST-003",
            email: employee.email.toUpperCase(),
          });
          const uniqueReport = await importRows(target, uniqueCollision, {
            companyId: companyC,
            apply: true,
          });
          assert.ok(
            uniqueReport.conflicts.some((c) =>
              c.reason.includes("Duplicate unique fields: email"),
            ),
          );
          for (const table of Object.keys(source))
            assert.equal((await target.list(table)).length, 0);
          const dry = await importRows(target, source, { companyId: companyC });
          assert.equal(dry.conflicts.length, 0);
          assert.equal(dry.tables.Employees.insert, 1);
          assert.equal((await target.list("Employees")).length, 0);
          const applied = await importRows(target, source, {
            apply: true,
            companyId: companyC,
          });
          assert.equal(applied.tables.Payroll.verified, 1);
          assert.equal(
            (await target.find("Payroll", payrollId))!.snapshot_json,
            snapshot,
          );
          const again = await importRows(target, source, {
            apply: true,
            companyId: companyC,
          });
          assert.equal(again.conflicts.length, 0);
          assert.equal(again.tables.Employees.insert, 0);
          assert.equal(again.tables.Employees.identical, 1);
          const changed = structuredClone(source);
          changed.Employees[0].first_name = "Conflict";
          const conflict = await importRows(target, changed, {
            apply: true,
            companyId: companyC,
          });
          assert.ok(conflict.conflicts.some((c) => c.table === "Employees"));
          assert.equal(
            (await target.find("Employees", employeeId))!.first_name,
            "Ada",
          );
        },
      );
    } finally {
      await client.$disconnect();
    }
  },
);
