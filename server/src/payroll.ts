import { validateAttendanceInputs } from "./workforce/payroll-inputs.js";
import type { Express } from "express";
import { createHash, randomUUID } from "node:crypto";
import { Decimal } from "decimal.js";
import { ApiContext, listResponse } from "./context.js";
import { RequestData, publicRow, type Row, type Change } from "./repository.js";
import { calculatePayroll } from "./services/payroll-engine.js";
import { getSettings } from "./domain.js";
import { wrap, requirePermission } from "./auth.js";
import { parseJSON } from "./permissions.js";
import { assert, AppError } from "./errors.js";
import * as V from "./validation.js";
const now = () => new Date().toISOString();
const decimal = (v: any) => new Decimal(v || 0);
export function expandPayroll(row: Row): Row {
  const snapshot = parseJSON<Row>(row.snapshot_json, {});
  const { snapshot_json, ...base } = publicRow(row);
  return { ...snapshot, ...base, run_id: row.run_id || row.payroll_run_id };
}
export function payrollRecord(row: Row, run: Row): Row {
  const cols = [
    "basic_salary",
    "allowances",
    "bonuses",
    "gross_salary",
    "penalties",
    "loan_deductions",
    "other_deductions",
    "tax_deductions",
    "total_deductions",
    "net_salary",
    "employee_id",
    "employee_name",
    "department_id",
    "payroll_month",
    "payment_status",
  ];
  return {
    payroll_id: row.payroll_id || randomUUID(),
    payroll_run_id: run.payroll_run_id,
    run_id: run.payroll_run_id,
    ...Object.fromEntries(
      cols.filter((k) => row[k] !== undefined).map((k) => [k, row[k]]),
    ),
    status: run.status,
    snapshot_json: JSON.stringify(row),
    created_at: row.created_at || now(),
    updated_at: now(),
  };
}
function totals(rows: Row[]) {
  const sum = (key: string) =>
    rows.reduce((s, r) => s.plus(r[key] || 0), new Decimal(0)).toFixed(2);
  return {
    total_employees: rows.length,
    total_basic_salary: sum("basic_salary"),
    total_allowances: sum("allowances"),
    total_bonuses: sum("bonuses"),
    total_gross_salary: sum("gross_salary"),
    total_penalties: sum("penalties"),
    total_loan_deductions: sum("loan_deductions"),
    total_deductions: sum("total_deductions"),
    total_net_payroll: sum("net_salary"),
  };
}
export async function payrollInput(d: RequestData, payroll_month: string) {
  const [
    employees,
    salary_history,
    bonuses,
    penalties,
    loans,
    installments,
    settings,
    allPayroll,
    runs,
    attendance_inputs,
  ] = await Promise.all([
    d.list("Employees"),
    d.list("Salary_History"),
    d.list("Bonuses"),
    d.list("Penalties"),
    d.list("Loans"),
    d.list("Loan_Installments"),
    getSettings(d),
    d.list("Payroll"),
    d.list("Payroll_Runs"),
    d.list("Attendance_Payroll_Inputs"),
  ]);
  const finalRuns = new Set(
    runs
      .filter((r) => ["finalized", "paid"].includes(r.status))
      .map((r) => r.payroll_run_id),
  );
  const activeAttendanceInputs = attendance_inputs.filter(
    (r) => r.payroll_month === payroll_month && r.status === "approved",
  );
  if (
    !runs.some(
      (r) =>
        r.payroll_month === payroll_month &&
        ["finalized", "paid"].includes(r.status),
    )
  )
    await validateAttendanceInputs(d, activeAttendanceInputs);
  return {
    payroll_month,
    attendance_inputs: attendance_inputs.filter(
      (r) => r.payroll_month === payroll_month && r.status === "approved",
    ),
    employees: employees.map(publicRow),
    salary_history: salary_history.map(publicRow),
    bonuses: bonuses.map(publicRow),
    penalties: penalties.map(publicRow),
    loans: loans.map(publicRow),
    installments: installments.map(publicRow),
    settings,
    existing_payroll: allPayroll
      .filter((r) => finalRuns.has(r.payroll_run_id) && r.status !== "void")
      .map(expandPayroll),
  };
}
function sourceHash(input: any) {
  return createHash("sha256").update(JSON.stringify(input)).digest("hex");
}
async function calculate(d: RequestData, month: string) {
  const input = await payrollInput(d, month);
  try {
    const result = calculatePayroll(input);
    const departments = await d.list("Departments");
    return {
      ...result,
      rows: result.rows.map((r) => ({
        ...r,
        attendance_inputs: input.attendance_inputs.filter(
          (a) => a.employee_id === r.employee_id,
        ),
        department_name:
          departments.find((x) => x.department_id === r.department_id)
            ?.department_name || "",
        currency: input.settings.currency || "USD",
        company_name: input.settings.company_name || "",
      })),
      source_hash: sourceHash(input),
    };
  } catch (error) {
    throw new AppError(
      422,
      "PAYROLL_CALCULATION_FAILED",
      error instanceof Error ? error.message : "Payroll calculation failed.",
    );
  }
}
export async function runRows(d: RequestData, id: string) {
  return (await d.list("Payroll"))
    .filter((r) => r.payroll_run_id === id && r.status !== "void")
    .map(expandPayroll);
}
function runPublic(run: Row) {
  return {
    ...publicRow(run),
    run_id: run.payroll_run_id,
    total_employees: Number(run.total_employees),
    warnings: parseJSON(run.warnings_json, []),
  };
}
async function checkSource(d: RequestData, run: Row) {
  assert(
    run.source_hash === sourceHash(await payrollInput(d, run.payroll_month)),
    409,
    "PAYROLL_SOURCE_CHANGED",
    "Payroll source records changed after generation. Revise the draft and submit it for approval again.",
  );
}
export function installPayroll(app: Express, ctx: ApiContext) {
  app.get(
    "/api/payroll",
    wrap(async (req, res) => {
      requirePermission(req, "payroll.read");
      listResponse(
        res,
        (await ctx.repository.list("Payroll_Runs")).map(runPublic),
        req.query,
        "payroll_month",
      );
    }),
  );
  app.post(
    "/api/payroll/preview",
    wrap(async (req, res) => {
      requirePermission(req, "payroll.generate");
      const b = V.payrollMonthSchema.parse(req.body);
      const { source_hash, ...result } = await calculate(
        new RequestData(ctx.repository),
        b.payroll_month,
      );
      res.json({ data: result });
    }),
  );
  app.post(
    "/api/payroll/generate",
    wrap(async (req, res) => {
      requirePermission(req, "payroll.generate");
      await ctx.mutate(req, res, async (d) => {
        const b = V.payrollMonthSchema.parse(req.body);
        assert(
          !(await d.list("Payroll_Runs")).some(
            (r) => r.payroll_month === b.payroll_month,
          ),
          409,
          "PAYROLL_ALREADY_EXISTS",
          "A payroll run already exists for this month. Open it or explicitly revise its draft.",
        );
        const result = await calculate(d, b.payroll_month);
        assert(
          result.rows.length,
          422,
          "NO_ELIGIBLE_EMPLOYEES",
          "No employees are eligible for payroll in this month.",
        );
        const id = randomUUID();
        const run = {
          payroll_run_id: id,
          run_id: id,
          payroll_month: b.payroll_month,
          status: "draft",
          ...result.totals,
          source_hash: result.source_hash,
          warnings_json: JSON.stringify(result.warnings),
          generated_by: req.user.user_id,
          revision: 1,
          created_at: now(),
          updated_at: now(),
        };
        const records = result.rows.map((r) => payrollRecord(r, run));
        return {
          data: {
            run: runPublic(run),
            rows: records.map(expandPayroll),
            totals: result.totals,
            warnings: result.warnings,
          },
          changes: [
            { table: "Payroll_Runs", record: run },
            ...records.map((record) => ({ table: "Payroll", record })),
          ],
          entity: "payroll",
          id,
          status: 201,
        };
      });
    }),
  );
  app.get(
    "/api/payroll/:id",
    wrap(async (req, res) => {
      requirePermission(req, "payroll.read");
      const d = new RequestData(ctx.repository);
      const run = await d.find("Payroll_Runs", String(req.params.id));
      res.json({
        data: {
          run: runPublic(run),
          rows: await runRows(d, run.payroll_run_id),
        },
      });
    }),
  );
  app.post(
    "/api/payroll/:id/revise",
    wrap(async (req, res) => {
      requirePermission(req, "payroll.generate");
      await ctx.mutate(req, res, async (d) => {
        const run = await d.find("Payroll_Runs", String(req.params.id));
        assert(
          ["draft", "rejected", "pending_approval", "approved"].includes(
            run.status,
          ),
          409,
          "PAYROLL_LOCKED",
          "Finalized payroll cannot be revised.",
        );
        const result = await calculate(d, run.payroll_month);
        assert(
          result.rows.length,
          422,
          "NO_ELIGIBLE_EMPLOYEES",
          "No employees are eligible for this payroll month.",
        );
        const updated: Row = {
          ...run,
          status: "draft",
          ...result.totals,
          source_hash: result.source_hash,
          warnings_json: JSON.stringify(result.warnings),
          revision: Number(run.revision || 1) + 1,
          approved_by: "",
          approved_at: "",
          reviewed_by: "",
          reviewed_at: "",
          rejection_reason: "",
          updated_at: now(),
        };
        const oldRows = (await d.list("Payroll")).filter(
          (r) => r.payroll_run_id === run.payroll_run_id && r.status !== "void",
        );
        const records = result.rows.map((r) => payrollRecord(r, updated));
        return {
          data: {
            run: runPublic(updated),
            rows: records.map(expandPayroll),
            totals: result.totals,
            warnings: result.warnings,
          },
          changes: [
            ...oldRows.map((record) => ({
              table: "Payroll",
              record: { ...record, status: "void" },
            })),
            ...records.map((record) => ({ table: "Payroll", record })),
            { table: "Payroll_Runs", record: updated },
          ],
          entity: "payroll",
          id: run.payroll_run_id,
          previous: run,
        };
      });
    }),
  );
  app.put(
    "/api/payroll/:id/adjustments",
    wrap(async (req, res) => {
      requirePermission(req, "payroll.generate");
      await ctx.mutate(req, res, async (d) => {
        const b = V.adjustmentSchema.parse(req.body);
        const run = await d.find("Payroll_Runs", String(req.params.id));
        assert(
          ["draft", "rejected"].includes(run.status),
          409,
          "PAYROLL_LOCKED",
          "Only draft or rejected payroll can be adjusted.",
        );
        const rows = await runRows(d, run.payroll_run_id);
        const old = rows.find((r) => r.employee_id === b.employee_id);
        assert(
          old,
          404,
          "NOT_FOUND",
          "Employee was not included in this payroll run.",
        );
        const row: Row = {
          ...old,
          allowances: b.allowances,
          other_deductions: b.other_deductions,
          tax_deductions: b.tax_deductions,
          adjustment_reason: b.reason,
          adjusted_by: req.user.user_id,
          adjusted_at: now(),
        };
        row.gross_salary = decimal(row.basic_salary)
          .plus(row.allowances)
          .plus(row.bonuses)
          .toFixed(2);
        row.total_deductions = decimal(row.penalties)
          .plus(row.loan_deductions)
          .plus(row.other_deductions)
          .plus(row.tax_deductions)
          .toFixed(2);
        row.net_salary = decimal(row.gross_salary)
          .minus(row.total_deductions)
          .toFixed(2);
        assert(
          decimal(row.net_salary).gte(0),
          422,
          "NEGATIVE_NET_SALARY",
          "Deductions cannot exceed gross salary.",
        );
        const limit = decimal(
          row.calculation_policy?.deduction_limit_percent || 100,
        );
        row.requires_review = decimal(row.total_deductions).gt(
          decimal(row.gross_salary).times(limit).div(100),
        );
        const revised = rows.map((r) =>
          r.employee_id === row.employee_id ? row : r,
        );
        const warnings = revised
          .filter((r) => r.requires_review)
          .map(
            (r) =>
              `${r.employee_number || r.employee_id}: deductions exceed the configured review limit.`,
          );
        const updated: Row = {
          ...run,
          ...totals(revised),
          status: "draft",
          warnings_json: JSON.stringify(warnings),
          reviewed_by: "",
          reviewed_at: "",
          updated_at: now(),
        };
        return {
          data: {
            run: runPublic(updated),
            rows: revised,
            totals: totals(revised),
            warnings,
          },
          changes: [
            { table: "Payroll", record: payrollRecord(row, updated) },
            { table: "Payroll_Runs", record: updated },
          ],
          entity: "payroll_adjustments",
          id: run.payroll_run_id,
          previous: old,
        };
      });
    }),
  );
  const permissions: Record<string, string> = {
    submit: "payroll.generate",
    approve: "payroll.approve",
    reject: "payroll.approve",
    finalize: "payroll.finalize",
    paid: "payroll.pay",
  };
  for (const action of Object.keys(permissions))
    app.post(
      `/api/payroll/:id/${action}`,
      wrap(async (req, res) => {
        requirePermission(req, permissions[action]);
        await ctx.mutate(req, res, async (d) => {
          const body =
            action === "reject"
              ? V.rejectionSchema.parse(req.body)
              : V.approvalSchema.parse(req.body || {});
          const run = await d.find("Payroll_Runs", String(req.params.id));
          const rows = await runRows(d, run.payroll_run_id);
          const allowed: Record<string, string[]> = {
            submit: ["draft"],
            approve: ["pending_approval"],
            reject: ["pending_approval"],
            finalize: ["approved"],
            paid: ["finalized"],
          };
          assert(
            allowed[action].includes(run.status),
            409,
            "INVALID_PAYROLL_TRANSITION",
            `Cannot ${action} payroll while it is ${run.status}.`,
          );
          assert(
            rows.length,
            422,
            "EMPTY_PAYROLL",
            "Payroll has no employee rows.",
          );
          if (["submit", "approve", "finalize"].includes(action))
            await checkSource(d, run);
          if (action === "approve" && rows.some((r) => r.requires_review))
            assert(
              "reviewed" in body && body.reviewed === true,
              422,
              "PAYROLL_REVIEW_REQUIRED",
              "Review the deduction warnings and explicitly confirm reviewed=true before approval.",
            );
          if (action === "finalize" && rows.some((r) => r.requires_review))
            assert(
              run.reviewed_by,
              422,
              "PAYROLL_REVIEW_REQUIRED",
              "An authorized approver must review the deduction warnings.",
            );
          const target: Record<string, string> = {
            submit: "pending_approval",
            approve: "approved",
            reject: "rejected",
            finalize: "finalized",
            paid: "paid",
          };
          const updated: Row = {
            ...run,
            status: target[action],
            updated_at: now(),
          };
          if (action === "submit") updated.submitted_by = req.user.user_id;
          if (action === "approve") {
            updated.approved_by = req.user.user_id;
            updated.approved_at = now();
            if ("reviewed" in body && body.reviewed) {
              updated.reviewed_by = req.user.user_id;
              updated.reviewed_at = now();
            }
          }
          if (action === "reject") updated.rejection_reason = body.reason;
          if (action === "finalize") {
            updated.finalized_by = req.user.user_id;
            updated.finalized_at = now();
          }
          if (action === "paid") {
            updated.paid_by = req.user.user_id;
            updated.paid_at = now();
          }
          const changes: Change[] = [];
          if (action === "finalize" || action === "paid") {
            const installments = await d.list("Loan_Installments");
            const loans = await d.list("Loans");
            const loanUpdates = new Map<string, Row>();
            for (const row of rows) {
              for (const alloc of row.installment_allocations || []) {
                const inst = installments.find(
                  (i) => i.installment_id === alloc.installment_id,
                );
                const loan =
                  loanUpdates.get(alloc.loan_id) ||
                  loans.find((l) => l.loan_id === alloc.loan_id);
                assert(
                  inst && loan,
                  409,
                  "MISSING_LOAN_SOURCE",
                  "A payroll loan source is missing.",
                );
                if (action === "finalize") {
                  assert(
                    ["pending", "partial"].includes(inst.status) &&
                      !inst.payroll_run_id &&
                      decimal(inst.installment_amount)
                        .minus(inst.amount_paid || 0)
                        .gte(alloc.amount),
                    409,
                    "INSTALLMENT_CONFLICT",
                    "An installment has changed or was reserved by another payroll. Revise this payroll.",
                  );
                  changes.push({
                    table: "Loan_Installments",
                    record: {
                      ...inst,
                      status: "reserved",
                      reserved_amount: alloc.amount,
                      payroll_run_id: run.payroll_run_id,
                      updated_at: now(),
                    },
                  });
                } else {
                  assert(
                    inst.status === "reserved" &&
                      inst.payroll_run_id === run.payroll_run_id &&
                      decimal(inst.reserved_amount).eq(alloc.amount),
                    409,
                    "INSTALLMENT_RESERVATION_MISMATCH",
                    "A reserved installment does not match this payroll. Reconcile it before marking paid.",
                  );
                  const paid = decimal(inst.amount_paid).plus(alloc.amount);
                  const remaining = decimal(inst.installment_amount).minus(
                    paid,
                  );
                  const outstanding = decimal(loan.outstanding_balance).minus(
                    alloc.amount,
                  );
                  assert(
                    outstanding.gte(0) && remaining.gte(0),
                    409,
                    "LOAN_BALANCE_MISMATCH",
                    "Loan balances do not match this payroll.",
                  );
                  changes.push({
                    table: "Loan_Installments",
                    record: {
                      ...inst,
                      amount_paid: paid.toFixed(2),
                      remaining_balance: remaining.toFixed(2),
                      reserved_amount: "0.00",
                      status: remaining.isZero() ? "paid" : "partial",
                      payment_date: now().slice(0, 10),
                      updated_at: now(),
                    },
                  });
                  loanUpdates.set(loan.loan_id, {
                    ...loan,
                    outstanding_balance: outstanding.toFixed(2),
                    status: outstanding.isZero() ? "paid" : "active",
                    updated_at: now(),
                  });
                  changes.push({
                    table: "Loan_Payments",
                    record: {
                      payment_id: randomUUID(),
                      loan_id: loan.loan_id,
                      employee_id: row.employee_id,
                      installment_id: inst.installment_id,
                      amount: alloc.amount,
                      payment_date: now().slice(0, 10),
                      source: "payroll",
                      payroll_id: row.payroll_id,
                      created_by: req.user.user_id,
                      created_at: now(),
                    },
                  });
                }
              }
              if (action === "finalize") {
                for (const [table, key, idField] of [
                  ["Bonuses", "bonus_ids", "bonus_id"],
                  ["Penalties", "penalty_ids", "penalty_id"],
                ])
                  for (const id of row[key] || []) {
                    const source = await d.find(table, id);
                    assert(
                      source.status === "approved" && !source.payroll_id,
                      409,
                      "ADJUSTMENT_ALREADY_USED",
                      "A bonus or penalty has already been used by payroll.",
                    );
                    changes.push({
                      table,
                      record: {
                        ...source,
                        payroll_id: row.payroll_id,
                        updated_at: now(),
                      },
                    });
                  }
              }
            }
            for (const record of loanUpdates.values())
              changes.push({ table: "Loans", record });
          }
          const records = rows.map((r) =>
            payrollRecord(
              {
                ...r,
                payment_status: action === "paid" ? "paid" : r.payment_status,
              },
              updated,
            ),
          );
          changes.push(
            ...records.map((record) => ({ table: "Payroll", record })),
            { table: "Payroll_Runs", record: updated },
          );
          return {
            data: { run: runPublic(updated), rows: records.map(expandPayroll) },
            changes,
            entity: "payroll",
            id: run.payroll_run_id,
            previous: run,
          };
        });
      }),
    );
}
