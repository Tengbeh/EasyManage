import { salaryAt } from "../services/salary-at.js";
import { parseJSON } from "../permissions.js";
import type { Express } from "express";
import { DateTime } from "luxon";
import { Decimal } from "decimal.js";
import { createHash } from "node:crypto";
import { ApiContext } from "../context.js";
import { RequestData, type Row, type Change } from "../repository.js";
import { wrap, requirePermission } from "../auth.js";
import { assert } from "../errors.js";
import * as V from "./validation.js";
import {
  array,
  datesBetween,
  scheduledMinutes,
  workingDay,
} from "./calculations.js";
import {
  uid,
  stamp,
  respondList,
  joined,
  snapshot,
  immutablePeriod,
  decision,
  scheduleFor,
} from "./shared.js";
import { getSettings } from "../domain.js";
const hash = (v: unknown) =>
  createHash("sha256").update(JSON.stringify(v)).digest("hex");
async function calculation(d: RequestData, b: Row) {
  const e = await d.find("Employees", b.employee_id),
    history = (await d.list("Salary_History"))
      .filter((r) => r.employee_id === e.employee_id)
      .sort(
        (a, b) =>
          a.effective_date.localeCompare(b.effective_date) ||
          String(a.created_at).localeCompare(String(b.created_at)),
      );
  const settings = await getSettings(d),
    month = DateTime.fromISO(`${b.payroll_month}-01`),
    startDay = Number(settings.payroll_start_day || 1),
    endDay = Number(settings.payroll_end_day || 31);
  const cycleEnd = month
      .set({ day: Math.min(endDay, month.daysInMonth!) })
      .toISODate()!,
    startMonth = startDay > endDay ? month.minus({ months: 1 }) : month,
    cycleStart = startMonth
      .set({ day: Math.min(startDay, startMonth.daysInMonth!) })
      .toISODate()!;
  const holidays = await d.list("Holidays"),
    rows: Row[] = [],
    details: Row[] = [];
  let total = new Decimal(0),
    minutes = 0;
  for (const id of array<string>(b.attendance_ids)) {
    const a = await d.find("Attendance", id);
    assert(
      a.employee_id === e.employee_id,
      403,
      "ATTENDANCE_EMPLOYEE_MISMATCH",
      "Attendance does not belong to this employee.",
    );
    assert(
      a.approval_status === "finalized" && a.status !== "pending_correction",
      409,
      "ATTENDANCE_NOT_FINALIZED",
      "Only approved and finalized attendance may affect payroll.",
    );
    assert(
      a.date >= cycleStart && a.date <= cycleEnd,
      422,
      "ATTENDANCE_PERIOD_MISMATCH",
      "Attendance must fall within the configured payroll cycle.",
    );
    const policy = snapshot(a),
      salary = salaryAt(e, history, a.date);
    const frequency = salary.payment_frequency || e.payment_frequency;
    let periodDates: string[];
    if (frequency === "daily") periodDates = [a.date];
    else if (frequency === "weekly")
      periodDates = datesBetween(
        DateTime.fromISO(a.date).startOf("week").toISODate()!,
        DateTime.fromISO(a.date).endOf("week").toISODate()!,
      );
    else {
      assert(
        frequency === "monthly",
        422,
        "UNSUPPORTED_ATTENDANCE_RATE",
        "Attendance hourly rates require monthly, weekly or daily salary.",
      );
      periodDates = datesBetween(cycleStart, cycleEnd);
    }
    let denominator = 0;
    for (const date of periodDates) {
      const s = await scheduleFor(d, e, date);
      if (workingDay(date, s, holidays, e) === "work_day")
        denominator += scheduledMinutes(s, date);
    }
    assert(
      denominator > 0,
      422,
      "NO_SCHEDULED_HOURS",
      "No scheduled working hours exist for the salary period.",
    );
    const hourlyRate = new Decimal(salary.basic_salary || 0)
      .mul(60)
      .div(denominator);
    let m = 0,
      multiplier = new Decimal(1),
      amount = new Decimal(0);
    if (b.type === "overtime") {
      assert(
        policy.overtime_enabled === true,
        422,
        "OVERTIME_DISABLED",
        "Overtime is disabled in this attendance policy.",
      );
      m = Number(a.overtime_minutes || 0);
      multiplier = new Decimal(policy.overtime_multiplier || 1);
      amount = hourlyRate.mul(m).div(60).mul(multiplier);
    }
    if (b.type === "unpaid_absence") {
      assert(
        policy.unpaid_absence_enabled === true,
        422,
        "UNPAID_ABSENCE_DISABLED",
        "Unpaid absence deductions are disabled in this attendance policy.",
      );
      const unpaidLeave =
        (a.status || a.attendance_status) === "on_leave" &&
        a.leave_id &&
        parseJSON<Row>(a.leave_policy_snapshot, {}).paid === false;
      if (unpaidLeave) {
        const leave = await d.find("Leave", a.leave_id);
        assert(
          leave.status === "approved",
          409,
          "LEAVE_NOT_APPROVED",
          "Unpaid leave must remain approved.",
        );
      }
      assert(
        ["absent", "half_day"].includes(a.status || a.attendance_status) ||
          unpaidLeave,
        422,
        "NOT_UNPAID_ABSENCE",
        "Only an approved absence, half-day or explicitly unpaid approved leave may use this deduction policy.",
      );
      m = Math.max(
        0,
        scheduledMinutes(policy, a.date) - Number(a.work_minutes || 0),
      );
      amount = hourlyRate.mul(m).div(60);
    }
    rows.push(a);
    minutes += m;
    total = total.plus(amount);
    details.push({
      attendance_id: id,
      date: a.date,
      minutes: m,
      hourly_rate: hourlyRate.toFixed(6),
      multiplier: multiplier.toFixed(4),
      amount: amount.toFixed(2),
      salary_effective_date: salary.effective_date || e.hire_date,
      policy,
    });
  }
  if (b.type === "bonus") {
    assert(
      details.every((r) => r.policy.attendance_bonus_enabled === true),
      422,
      "ATTENDANCE_BONUS_DISABLED",
      "Attendance bonuses are disabled in the source policy.",
    );
    assert(
      b.amount && new Decimal(b.amount).gt(0),
      422,
      "BONUS_AMOUNT_REQUIRED",
      "Enter a positive authorized attendance bonus amount.",
    );
    total = new Decimal(b.amount);
  }
  assert(
    total.gt(0),
    422,
    "ZERO_ATTENDANCE_AMOUNT",
    "The approved attendance sources do not produce a positive payroll amount.",
  );
  const calculated = {
    amount: total.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2),
    calculated_minutes: minutes,
    hourly_rate: details.length === 1 ? details[0].hourly_rate : "varies",
    multiplier: details.length === 1 ? details[0].multiplier : "varies",
    calculation: details,
    policy_snapshot: {
      cycle_start: cycleStart,
      cycle_end: cycleEnd,
      currency: settings.currency,
      sources: details.map((r) => r.policy),
    },
  };
  return { ...calculated, source_hash: hash({ rows, history, calculated }) };
}
export function installPayrollInputs(app: Express, ctx: ApiContext) {
  app.get(
    "/api/workforce/payroll-inputs",
    wrap(async (req, res) => {
      requirePermission(req, "attendance.payroll");
      const d = new RequestData(ctx.repository);
      let rows = await joined(d, await d.list("Attendance_Payroll_Inputs"));
      if (req.query.payroll_month)
        rows = rows.filter((r) => r.payroll_month === req.query.payroll_month);
      respondList(res, rows, req.query, "created_at");
    }),
  );
  app.post(
    "/api/workforce/payroll-inputs",
    wrap(async (req, res) => {
      requirePermission(req, "attendance.payroll");
      await ctx.mutate(req, res, async (d) => {
        const b = V.payrollInputSchema.parse(req.body);
        await immutablePeriod(d, b.payroll_month);
        assert(
          !(await d.list("Attendance_Payroll_Inputs")).some(
            (r) =>
              r.type === b.type &&
              r.employee_id === b.employee_id &&
              ["pending", "approved"].includes(r.status) &&
              array<string>(r.attendance_ids).some((id) =>
                b.attendance_ids.includes(id),
              ),
          ),
          409,
          "ATTENDANCE_ALREADY_INCLUDED",
          "One or more attendance sources already have a pending or approved payroll input of this type.",
        );
        const row: Row = {
          ...b,
          ...(await calculation(d, b)),
          input_id: uid(),
          status: "pending",
          created_by: req.user.user_id,
          created_at: stamp(),
          updated_at: stamp(),
        };
        return {
          data: row,
          status: 201,
          changes: [{ table: "Attendance_Payroll_Inputs", record: row }],
          id: row.input_id,
          entity: "attendance-payroll",
        };
      });
    }),
  );
  for (const action of ["approve", "reject", "revoke"])
    app.post(
      `/api/workforce/payroll-inputs/:id/${action}`,
      wrap(async (req, res) => {
        requirePermission(req, "attendance.payroll");
        const b = V.decisionSchema.parse(req.body);
        await ctx.mutate(req, res, async (d) => {
          const previous = await d.find(
            "Attendance_Payroll_Inputs",
            String(req.params.id),
          );
          assert(
            previous.status === (action === "revoke" ? "approved" : "pending"),
            409,
            "INVALID_INPUT_STATE",
            "Only pending inputs may be approved or rejected; approved inputs may be revoked before payroll approval.",
          );
          if (action !== "revoke")
            await immutablePeriod(d, previous.payroll_month);
          const row: Row = {
              ...previous,
              status:
                action === "approve"
                  ? "approved"
                  : action === "revoke"
                    ? "revoked"
                    : "rejected",
              approved_by: req.user.user_id,
              approved_at: stamp(),
              updated_at: stamp(),
              comments: b.comments,
            },
            changes: Change[] = [];
          if (action === "approve") {
            requirePermission(
              req,
              previous.type === "unpaid_absence"
                ? "penalties.approve"
                : "bonuses.approve",
            );
            assert(
              (await calculation(d, previous)).source_hash ===
                previous.source_hash,
              409,
              "ATTENDANCE_INPUT_STALE",
              "Attendance or salary changed after this input was created. Reject it and create a new input for review.",
            );
            const penalty = previous.type === "unpaid_absence",
              id = uid(),
              table = penalty ? "Penalties" : "Bonuses";
            row[penalty ? "penalty_id" : "bonus_id"] = id;
            changes.push({
              table,
              record: {
                [penalty ? "penalty_id" : "bonus_id"]: id,
                employee_id: row.employee_id,
                [penalty ? "penalty_type" : "bonus_type"]: penalty
                  ? "unpaid_absence"
                  : "attendance",
                description: row.reason,
                reason: row.reason,
                amount: row.amount,
                effective_month: row.payroll_month,
                payroll_month: row.payroll_month,
                status: "approved",
                created_by: row.created_by,
                approved_by: req.user.user_id,
                approved_at: stamp(),
                created_at: stamp(),
                updated_at: stamp(),
                attendance_input_id: row.input_id,
              },
            });
          }
          if (action === "revoke") {
            const runs = (await d.list("Payroll_Runs")).filter(
              (r) => r.payroll_month === previous.payroll_month,
            );
            assert(
              !runs.some((r) => ["finalized", "paid"].includes(r.status)),
              409,
              "PAYROLL_PERIOD_LOCKED",
              "Finalized payroll attendance inputs cannot be revoked.",
            );
            if (runs.length) {
              requirePermission(req, "payroll.generate");
              for (const run of runs)
                changes.push({
                  table: "Payroll_Runs",
                  record: {
                    ...run,
                    status: "rejected",
                    approved_by: "",
                    approved_at: "",
                    reviewed_by: "",
                    reviewed_at: "",
                    rejection_reason:
                      "An attendance input was revoked. Revise this run before submitting again.",
                    updated_at: stamp(),
                  },
                });
            }
            requirePermission(
              req,
              previous.type === "unpaid_absence"
                ? "penalties.approve"
                : "bonuses.approve",
            );
            const table = previous.penalty_id ? "Penalties" : "Bonuses",
              id = previous.penalty_id || previous.bonus_id;
            const linked = await d.find(table, id);
            assert(
              !linked.payroll_id,
              409,
              "PAYROLL_INPUT_CONSUMED",
              "This input has already been consumed by finalized payroll.",
            );
            changes.push({
              table,
              record: {
                ...linked,
                status: "rejected",
                rejection_reason:
                  b.comments || "Attendance input revoked for correction",
                updated_at: stamp(),
              },
            });
          }
          changes.push(
            { table: "Attendance_Payroll_Inputs", record: row },
            decision(
              req,
              "attendance_payroll",
              row.input_id,
              action,
              previous.status,
              row.status,
              b.comments,
              0,
              previous.created_by,
            ),
          );
          return {
            data: row,
            previous,
            changes,
            id: row.input_id,
            entity: "attendance-payroll",
          };
        });
      }),
    );
}

export async function validateAttendanceInputs(d: RequestData, inputs: Row[]) {
  for (const input of inputs) {
    let current: Row;
    try {
      current = await calculation(d, input);
    } catch {
      throw new (await import("../errors.js")).AppError(
        409,
        "ATTENDANCE_INPUT_STALE",
        "An approved attendance input no longer matches its finalized sources. Revoke it, correct attendance, and submit a new reviewed input.",
      );
    }
    assert(
      current.source_hash === input.source_hash,
      409,
      "ATTENDANCE_INPUT_STALE",
      "Attendance or salary changed after approval. Revoke the affected attendance input and submit a new reviewed calculation before payroll can continue.",
    );
  }
}
