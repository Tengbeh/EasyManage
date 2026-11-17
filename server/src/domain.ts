import { employmentStatusAt } from "./services/employment.js";
import type { Express, Request } from "express";
import { randomUUID } from "node:crypto";
import { Decimal } from "decimal.js";
import { z } from "zod";
import { ApiContext, listResponse, type MutationResult } from "./context.js";
import { RequestData, publicRow, type Row, type Change } from "./repository.js";
import { ID_FIELD } from "./schema.js";
import { wrap, requirePermission } from "./auth.js";
import { assert } from "./errors.js";
import { sanitizeEmployee, parseJSON } from "./permissions.js";
import * as V from "./validation.js";
const now = () => new Date().toISOString();
const dec = (v: any) => new Decimal(v || 0);
const fixed = (v: Decimal) => v.toFixed(2);
const descriptors: Record<
  string,
  { table: string; read: string; write: string; schema: z.ZodObject<any> }
> = {
  employees: {
    table: "Employees",
    read: "employees.read",
    write: "employees.write",
    schema: V.employeeSchema,
  },
  departments: {
    table: "Departments",
    read: "employees.read",
    write: "departments.write",
    schema: V.departmentSchema,
  },
  bonuses: {
    table: "Bonuses",
    read: "bonuses.read",
    write: "bonuses.write",
    schema: V.bonusSchema,
  },
  penalties: {
    table: "Penalties",
    read: "penalties.read",
    write: "penalties.write",
    schema: V.penaltySchema,
  },
  loans: {
    table: "Loans",
    read: "loans.read",
    write: "loans.write",
    schema: V.loanSchema,
  },
  attendance: {
    table: "Attendance",
    read: "attendance.read",
    write: "attendance.write",
    schema: V.attendanceSchema,
  },
  leave: {
    table: "Leave",
    read: "leave.read",
    write: "leave.write",
    schema: V.leaveSchema,
  },
  users: {
    table: "Users",
    read: "users.manage",
    write: "users.manage",
    schema: V.userSchema,
  },
};
function present(req: Request, table: string, row: Row) {
  const result = publicRow(row);
  if (table === "Employees")
    return sanitizeEmployee(effectiveEmployee(result), req.permissions);
  if (table === "Users") {
    delete result.google_id;
    result.permissions = parseJSON(result.permissions, []);
  }
  return result;
}
async function validateRecord(
  req: Request,
  d: RequestData,
  table: string,
  row: Row,
  previous?: Row,
) {
  if (table === "Employees") {
    assert(
      row.employment_status !== "terminated" || row.employment_end_date,
      422,
      "END_DATE_REQUIRED",
      "Termination requires an employment end date.",
    );
    await d.find("Departments", row.department_id);
    assert(
      !row.employment_end_date || row.employment_end_date >= row.hire_date,
      422,
      "INVALID_EMPLOYMENT_DATES",
      "Employment end date cannot precede hire date.",
    );
    assert(
      !row.date_of_birth || row.date_of_birth < row.hire_date,
      422,
      "INVALID_BIRTH_DATE",
      "Birth date must precede hire date.",
    );
    const all = await d.list(table);
    assert(
      !all.some(
        (r) =>
          r.employee_id !== row.employee_id &&
          (r.employee_number === row.employee_number ||
            String(r.email).toLowerCase() === row.email.toLowerCase()),
      ),
      409,
      "DUPLICATE_EMPLOYEE",
      "Employee number and email must be unique.",
    );
    for (const key of ["basic_salary", "allowances", "payment_frequency"])
      if (row[key] !== previous?.[key]) {
        if (
          !(key === "basic_salary" && !previous && dec(row[key]).isZero()) &&
          !(key === "allowances" && !previous && dec(row[key]).isZero()) &&
          !(key === "payment_frequency" && !previous)
        )
          requirePermission(req, "salaries.write");
        if (previous)
          assert(
            String(row[key] ?? "") === String(previous[key] ?? ""),
            409,
            "USE_SALARY_ADJUSTMENT",
            "Use the salary adjustment action to preserve dated salary history.",
          );
      }
    for (const key of ["bank_name", "account_number"])
      if (
        row[key] !== previous?.[key] &&
        (previous || (row[key] !== undefined && row[key] !== ""))
      )
        requirePermission(req, "banking.write");
  }
  if (table === "Departments")
    assert(
      !(await d.list(table)).some(
        (r) =>
          r.department_id !== row.department_id &&
          String(r.department_name).toLowerCase() ===
            row.department_name.toLowerCase(),
      ),
      409,
      "DUPLICATE_DEPARTMENT",
      "A department with this name already exists.",
    );
  if (
    ["Bonuses", "Penalties", "Loans", "Attendance", "Leave"].includes(table)
  ) {
    const e = await d.find("Employees", row.employee_id);
    assert(
      e.employment_status !== "archived",
      422,
      "EMPLOYEE_ARCHIVED",
      "An archived employee cannot receive new records.",
    );
    if (previous && ["Bonuses", "Penalties", "Loans", "Leave"].includes(table))
      assert(
        previous.status === "pending",
        409,
        "RECORD_LOCKED",
        "Only pending records can be edited.",
      );
  }
  if (table === "Loans") {
    assert(
      dec(row.installment_amount).lte(row.loan_amount),
      422,
      "INSTALLMENT_EXCEEDS_LOAN",
      "Installment amount cannot exceed the loan amount.",
    );
    assert(
      dec(row.loan_amount).div(row.installment_amount).ceil().lte(600),
      422,
      "LOAN_TOO_LONG",
      "A loan cannot exceed 600 installments.",
    );
  }
  if (table === "Attendance") {
    assert(
      !(await d.list(table)).some(
        (r) =>
          r.attendance_id !== row.attendance_id &&
          r.employee_id === row.employee_id &&
          r.date === row.date,
      ),
      409,
      "DUPLICATE_ATTENDANCE",
      "Attendance already exists for this employee and date.",
    );
    assert(
      !row.check_in || !row.check_out || row.check_out > row.check_in,
      422,
      "INVALID_ATTENDANCE_TIME",
      "Check-out must follow check-in on the same date.",
    );
  }
  if (table === "Leave") {
    assert(
      row.end_date >= row.start_date,
      422,
      "INVALID_LEAVE_DATES",
      "Leave end date cannot precede start date.",
    );
    assert(
      !(await d.list(table)).some(
        (r) =>
          r.leave_id !== row.leave_id &&
          r.employee_id === row.employee_id &&
          ["pending", "approved"].includes(r.status) &&
          r.start_date <= row.end_date &&
          r.end_date >= row.start_date,
      ),
      409,
      "OVERLAPPING_LEAVE",
      "This leave overlaps an existing pending or approved request.",
    );
  }
  if (table === "Users") {
    if (row.employee_id) {
      await d.find("Employees", row.employee_id);
      assert(
        !(await d.list("Users")).some(
          (u) => u.employee_id === row.employee_id && u.user_id !== row.user_id,
        ),
        409,
        "EMPLOYEE_ACCOUNT_EXISTS",
        "This employee is already linked to another account.",
      );
    }
    assert(
      row.role !== "employee" || row.employee_id,
      422,
      "EMPLOYEE_LINK_REQUIRED",
      "Employee accounts must be linked to an employee record.",
    );

    assert(
      req.user.role === "administrator",
      403,
      "ADMINISTRATOR_REQUIRED",
      "Only administrators may create or change user access.",
    );
    assert(
      !previous ||
        previous.user_id !== req.user.user_id ||
        (row.role === previous.role &&
          row.status === "active" &&
          JSON.stringify(parseJSON(row.permissions, [])) ===
            JSON.stringify(parseJSON(previous.permissions, []))),
      409,
      "SELF_ACCESS_CHANGE",
      "You cannot change your own role, permissions, or active status.",
    );
    const all = await d.list(table);
    assert(
      !all.some(
        (r) =>
          r.user_id !== row.user_id &&
          String(r.email).toLowerCase() === row.email.toLowerCase(),
      ),
      409,
      "DUPLICATE_USER",
      "This email already has access.",
    );
    assert(
      !previous?.google_id || row.email === previous.email,
      409,
      "LINKED_EMAIL_LOCKED",
      "A Google-linked user email cannot be changed. Create a new authorized user instead.",
    );
    if (
      previous?.role === "administrator" &&
      (row.role !== "administrator" || row.status !== "active")
    )
      assert(
        all.some(
          (r) =>
            r.user_id !== row.user_id &&
            r.role === "administrator" &&
            r.status === "active",
        ),
        409,
        "LAST_ADMINISTRATOR",
        "At least one active administrator must remain.",
      );
  }
}
export function effectiveEmployee(row: Row): Row {
  return { ...row, employment_status: employmentStatusAt(row) };
}
export const defaultSettings = () => ({
  setting_id: "company",
  company_name: "",
  company_logo: "",
  currency: "USD",
  date_format: "YYYY-MM-DD",
  timezone: "UTC",
  payroll_start_day: 1,
  payroll_end_day: 31,
  default_payment_frequency: "monthly",
  configured_deductions: {
    tax_percent: "0.00",
    other_deductions: "0.00",
    allowances: "0.00",
    deduction_limit_percent: "100.00",
  },
});
export async function getSettings(d: RequestData): Promise<Row> {
  const row = (await d.list("Company_Settings"))[0] || defaultSettings();
  return {
    ...publicRow(row),
    configured_deductions: parseJSON(row.configured_deductions, {}),
  };
}
export function installDomain(app: Express, ctx: ApiContext) {
  for (const [path, def] of Object.entries(descriptors)) {
    app.get(
      `/api/${path}`,
      wrap(async (req, res) => {
        requirePermission(req, def.read);
        let rows = await ctx.repository.list(def.table);
        if (
          ["Bonuses", "Penalties", "Loans", "Attendance", "Leave"].includes(
            def.table,
          )
        ) {
          const employees = await ctx.repository.list("Employees");
          rows = rows.map((row) => {
            const e = employees.find((e) => e.employee_id === row.employee_id);
            return {
              ...row,
              department_id: e?.department_id || "",
              employee_number: e?.employee_number || "",
              employee_name: e ? `${e.first_name} ${e.last_name}` : "",
            };
          });
        }
        listResponse(
          res,
          rows.map((r) => present(req, def.table, r)),
          req.query,
        );
      }),
    );
    app.get(
      `/api/${path}/:id`,
      wrap(async (req, res) => {
        requirePermission(req, def.read);
        res.json({
          data: present(
            req,
            def.table,
            await new RequestData(ctx.repository).find(
              def.table,
              String(req.params.id),
            ),
          ),
        });
      }),
    );
    app.post(
      `/api/${path}`,
      wrap(async (req, res) => {
        requirePermission(req, def.write);
        assert(
          !["Attendance", "Leave"].includes(def.table),
          409,
          "WORKFORCE_WORKFLOW_REQUIRED",
          "Use the attendance and leave workforce workflow for this change.",
        );
        await ctx.mutate(req, res, async (d) => {
          const body = def.schema.parse(req.body);
          const stamp = now();
          let row: Row = {
            ...body,
            [ID_FIELD[def.table]]: randomUUID(),
            created_at: stamp,
            updated_at: stamp,
          };
          if (
            [
              "Employees",
              "Bonuses",
              "Penalties",
              "Loans",
              "Attendance",
              "Leave",
            ].includes(def.table)
          )
            row.created_by = req.user.user_id;
          if (["Bonuses", "Penalties", "Loans", "Leave"].includes(def.table))
            row.status = "pending";
          if (def.table === "Loans") row.outstanding_balance = row.loan_amount;
          if (def.table === "Leave")
            row.days =
              Math.floor(
                (Date.parse(row.end_date) - Date.parse(row.start_date)) /
                  86400000,
              ) + 1;
          await validateRecord(req, d, def.table, row);
          const changes: Change[] = [{ table: def.table, record: row }];
          if (def.table === "Employees")
            changes.push({
              table: "Salary_History",
              record: {
                salary_history_id: randomUUID(),
                employee_id: row.employee_id,
                basic_salary: row.basic_salary,
                allowances: row.allowances ?? "",
                payment_frequency: row.payment_frequency,
                previous_amount: row.basic_salary,
                previous_allowances: row.allowances ?? "",
                previous_payment_frequency: row.payment_frequency,
                effective_date: row.hire_date,
                reason: "Initial salary",
                changed_by: req.user.user_id,
                created_at: stamp,
              },
            });
          return {
            data: present(req, def.table, row),
            changes,
            status: 201,
            entity: path,
            id: row[ID_FIELD[def.table]],
          };
        });
      }),
    );
    app.put(
      `/api/${path}/:id`,
      wrap(async (req, res) => {
        requirePermission(req, def.write);
        assert(
          !["Attendance", "Leave"].includes(def.table),
          409,
          "WORKFORCE_WORKFLOW_REQUIRED",
          "Use the attendance and leave workforce workflow for this change.",
        );
        await ctx.mutate(req, res, async (d) => {
          const parsed = def.schema.partial().parse(req.body);
          // Zod defaults must not turn an omitted PATCH-like PUT field into an update.
          const body = Object.fromEntries(
            Object.entries(parsed).filter(([key]) =>
              Object.hasOwn(req.body, key),
            ),
          );
          assert(
            Object.keys(body).length,
            422,
            "EMPTY_CHANGE",
            "Provide at least one field to update.",
          );
          const previous = await d.find(def.table, String(req.params.id));
          const row: Row = { ...previous, ...body, updated_at: now() };
          if (def.table === "Leave")
            row.days =
              Math.floor(
                (Date.parse(row.end_date) - Date.parse(row.start_date)) /
                  86400000,
              ) + 1;
          if (def.table === "Loans") row.outstanding_balance = row.loan_amount;
          await validateRecord(req, d, def.table, row, previous);
          return {
            data: present(req, def.table, row),
            changes: [{ table: def.table, record: row }],
            entity: path,
            id: String(req.params.id),
            previous,
          };
        });
      }),
    );
  }
  app.get(
    "/api/employees/:id/history",
    wrap(async (req, res) => {
      requirePermission(req, "employees.read");
      const d = new RequestData(ctx.repository);
      const e = await d.find("Employees", String(req.params.id));
      const events = (await d.list("Audit_Logs"))
        .filter(
          (r) => r.record_id === e.employee_id && r.module === "employees",
        )
        .map((r) => ({
          log_id: r.log_id,
          action: r.action,
          timestamp: r.timestamp,
          user_id: r.user_id,
          summary: r.action.includes("/status")
            ? "Employment status updated"
            : r.action.startsWith("POST")
              ? "Employee created"
              : "Employee profile updated",
        }));
      listResponse(res, events, req.query, "timestamp");
    }),
  );
  app.get(
    "/api/employees/:id/salary",
    wrap(async (req, res) => {
      requirePermission(req, "salaries.read");
      const d = new RequestData(ctx.repository);
      await d.find("Employees", String(req.params.id));
      listResponse(
        res,
        (await d.list("Salary_History")).filter(
          (r) => r.employee_id === req.params.id,
        ),
        req.query,
        "effective_date",
      );
    }),
  );
  app.post(
    "/api/employees/:id/salary",
    wrap(async (req, res) => {
      requirePermission(req, "salaries.write");
      await ctx.mutate(req, res, async (d) => {
        const b = V.salarySchema.parse(req.body);
        const e = await d.find("Employees", String(req.params.id));
        assert(
          b.effective_date >= e.hire_date,
          422,
          "SALARY_BEFORE_HIRE",
          "Salary effective date cannot precede hire date.",
        );
        const history = (await d.list("Salary_History"))
          .filter((h) => h.employee_id === e.employee_id)
          .sort((a, b) => a.effective_date.localeCompare(b.effective_date));
        assert(
          !history.some((h) => h.effective_date === b.effective_date),
          409,
          "DUPLICATE_SALARY_DATE",
          "A salary history entry already exists on this date.",
        );
        assert(
          !history.length || b.effective_date > history.at(-1)!.effective_date,
          422,
          "SALARY_HISTORY_ORDER",
          "Add salary changes after the latest effective date.",
        );
        assert(
          !(await d.list("Payroll_Runs")).some(
            (r) =>
              ["finalized", "paid"].includes(r.status) &&
              r.payroll_month >= b.effective_date.slice(0, 7),
          ),
          409,
          "FINALIZED_PERIOD",
          "This salary change would alter a finalized payroll period. Choose a later effective date.",
        );
        const row: Row = {
          salary_history_id: randomUUID(),
          employee_id: e.employee_id,
          ...b,
          previous_amount: e.basic_salary,
          previous_allowances: e.allowances ?? "",
          previous_payment_frequency: e.payment_frequency,
          changed_by: req.user.user_id,
          created_at: now(),
        };
        const updated: Row = {
          ...e,
          basic_salary: b.basic_salary,
          allowances: b.allowances,
          payment_frequency: b.payment_frequency,
          updated_at: now(),
        };
        return {
          data: row,
          changes: [
            { table: "Salary_History", record: row },
            { table: "Employees", record: updated },
          ],
          entity: "salary",
          id: row.salary_history_id,
          previous: {
            basic_salary: e.basic_salary,
            allowances: e.allowances,
            payment_frequency: e.payment_frequency,
          },
        };
      });
    }),
  );
  app.patch(
    "/api/employees/:id/status",
    wrap(async (req, res) => {
      requirePermission(req, "employees.write");
      await ctx.mutate(req, res, async (d) => {
        const b = V.statusSchema.parse(req.body);
        const e = await d.find("Employees", String(req.params.id));
        const row: Row = { ...e, ...b, updated_at: now() };
        assert(
          !row.employment_end_date || row.employment_end_date >= row.hire_date,
          422,
          "INVALID_EMPLOYMENT_DATES",
          "Employment end date cannot precede hire date.",
        );
        assert(
          row.employment_status !== "terminated" || row.employment_end_date,
          422,
          "END_DATE_REQUIRED",
          "Termination requires an employment end date.",
        );
        return {
          data: present(req, "Employees", row),
          changes: [{ table: "Employees", record: row }],
          entity: "employees",
          id: row.employee_id,
          previous: e,
        };
      });
    }),
  );
  for (const path of ["bonuses", "penalties"])
    for (const action of ["approve", "reject"])
      app.patch(
        `/api/${path}/:id/${action}`,
        wrap(async (req, res) => {
          requirePermission(req, `${path}.approve`);
          await ctx.mutate(req, res, async (d) => {
            const table = descriptors[path].table;
            const old = await d.find(table, String(req.params.id));
            assert(
              old.status === "pending",
              409,
              "INVALID_STATUS",
              "Only pending records can be approved or rejected.",
            );
            const body =
              action === "reject"
                ? V.rejectionSchema.parse(req.body)
                : V.approvalSchema.parse(req.body || {});
            const row: Row = {
              ...old,
              status: action === "approve" ? "approved" : "rejected",
              approved_by: action === "approve" ? req.user.user_id : "",
              approved_at: action === "approve" ? now() : "",
              rejection_reason: action === "reject" ? body.reason : "",
              updated_at: now(),
            };
            return {
              data: publicRow(row),
              changes: [{ table, record: row }],
              entity: path,
              id: String(req.params.id),
              previous: old,
            };
          });
        }),
      );
  app.get(
    "/api/loans/:id/installments",
    wrap(async (req, res) => {
      requirePermission(req, "loans.read");
      const d = new RequestData(ctx.repository);
      await d.find("Loans", String(req.params.id));
      listResponse(
        res,
        (await d.list("Loan_Installments")).filter(
          (r) => r.loan_id === req.params.id,
        ),
        req.query,
        "due_date",
      );
    }),
  );
  for (const action of ["approve", "reject"])
    app.post(
      `/api/loans/:id/${action}`,
      wrap(async (req, res) => {
        requirePermission(req, "loans.approve");
        await ctx.mutate(req, res, async (d) => {
          const old = await d.find("Loans", String(req.params.id));
          assert(
            old.status === "pending",
            409,
            "INVALID_STATUS",
            "Only pending loans can be approved or rejected.",
          );
          const body =
            action === "reject"
              ? V.rejectionSchema.parse(req.body)
              : V.approvalSchema.parse(req.body || {});
          const changes: Change[] = [];
          const row: Row = {
            ...old,
            status: action === "approve" ? "active" : "rejected",
            approved_by: action === "approve" ? req.user.user_id : "",
            approved_at: action === "approve" ? now() : "",
            rejection_reason: action === "reject" ? body.reason : "",
            updated_at: now(),
          };
          if (action === "approve") {
            let balance = dec(old.loan_amount);
            let i = 0;
            while (balance.gt(0)) {
              const amount = Decimal.min(balance, dec(old.installment_amount));
              const anchor = new Date(`${old.start_date}T00:00:00Z`);
              if (old.installment_frequency === "weekly")
                anchor.setUTCDate(anchor.getUTCDate() + 7 * i);
              else {
                const day = anchor.getUTCDate();
                anchor.setUTCDate(1);
                anchor.setUTCMonth(anchor.getUTCMonth() + i);
                const last = new Date(
                  Date.UTC(
                    anchor.getUTCFullYear(),
                    anchor.getUTCMonth() + 1,
                    0,
                  ),
                ).getUTCDate();
                anchor.setUTCDate(Math.min(day, last));
              }
              const due = anchor.toISOString().slice(0, 10);
              changes.push({
                table: "Loan_Installments",
                record: {
                  installment_id: randomUUID(),
                  loan_id: old.loan_id,
                  employee_id: old.employee_id,
                  installment_number: i + 1,
                  installment_amount: fixed(amount),
                  due_date: due,
                  payroll_month: due.slice(0, 7),
                  amount_paid: "0.00",
                  remaining_balance: fixed(amount),
                  reserved_amount: "0.00",
                  status: "pending",
                  created_at: now(),
                  updated_at: now(),
                },
              });
              row.end_date = due;
              balance = balance.minus(amount);
              i++;
            }
          }
          changes.push({ table: "Loans", record: row });
          return {
            data: publicRow(row),
            changes,
            entity: "loans",
            id: row.loan_id,
            previous: old,
          };
        });
      }),
    );
  app.post(
    "/api/loans/:id/payments",
    wrap(async (req, res) => {
      requirePermission(req, "loans.write");
      await ctx.mutate(req, res, async (d) => {
        const b = V.paymentSchema.parse(req.body);
        const loan = await d.find("Loans", String(req.params.id));
        const inst = await d.find("Loan_Installments", b.installment_id);
        assert(
          inst.loan_id === loan.loan_id,
          422,
          "INSTALLMENT_MISMATCH",
          "The installment does not belong to this loan.",
        );
        assert(
          loan.status === "active" &&
            ["pending", "partial"].includes(inst.status) &&
            !inst.payroll_run_id,
          409,
          "INSTALLMENT_LOCKED",
          "This installment is paid, inactive, or reserved by finalized payroll.",
        );
        const remaining = dec(inst.installment_amount).minus(
          inst.amount_paid || 0,
        );
        assert(
          dec(b.amount).lte(remaining) &&
            dec(b.amount).lte(loan.outstanding_balance),
          422,
          "EXCESS_PAYMENT",
          "Payment cannot exceed the installment or loan balance.",
        );
        const paid = dec(inst.amount_paid).plus(b.amount);
        const outstanding = dec(loan.outstanding_balance).minus(b.amount);
        const payment = {
          payment_id: randomUUID(),
          loan_id: loan.loan_id,
          installment_id: inst.installment_id,
          employee_id: loan.employee_id,
          amount: b.amount,
          payment_date: b.payment_date,
          source: "manual",
          created_by: req.user.user_id,
          created_at: now(),
        };
        return {
          data: payment,
          changes: [
            { table: "Loan_Payments", record: payment },
            {
              table: "Loan_Installments",
              record: {
                ...inst,
                amount_paid: fixed(paid),
                remaining_balance: fixed(
                  dec(inst.installment_amount).minus(paid),
                ),
                payment_date: b.payment_date,
                status: paid.eq(inst.installment_amount) ? "paid" : "partial",
                updated_at: now(),
              },
            },
            {
              table: "Loans",
              record: {
                ...loan,
                outstanding_balance: fixed(outstanding),
                status: outstanding.isZero() ? "paid" : "active",
                updated_at: now(),
              },
            },
          ],
          entity: "loan_payments",
          id: payment.payment_id,
        };
      });
    }),
  );
  app.get(
    "/api/settings",
    wrap(async (req, res) => {
      res.json({ data: await getSettings(new RequestData(ctx.repository)) });
    }),
  );
  app.put(
    "/api/settings",
    wrap(async (req, res) => {
      requirePermission(req, "settings.manage");
      await ctx.mutate(req, res, async (d) => {
        const previous = await getSettings(d);
        const body = V.settingsSchema.parse(req.body);
        const row: Row = { ...previous, ...body, updated_at: now() };
        return {
          data: row,
          changes: [{ table: "Company_Settings", record: row }],
          entity: "settings",
          id: row.setting_id,
          previous,
        };
      });
    }),
  );
  app.get(
    "/api/audit-logs",
    wrap(async (req, res) => {
      requirePermission(req, "audit.read");
      listResponse(
        res,
        await ctx.repository.list("Audit_Logs"),
        req.query,
        "timestamp",
      );
    }),
  );
}
