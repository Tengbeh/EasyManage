import type { Express, Request } from "express";
import { DateTime } from "luxon";
import { Decimal } from "decimal.js";
import { ApiContext } from "../context.js";
import { RequestData, type Row, type Change } from "../repository.js";
import { wrap, requirePermission } from "../auth.js";
import { assert } from "../errors.js";
import { parseJSON } from "../permissions.js";
import * as V from "./validation.js";
import { datesBetween, workingDay, array } from "./calculations.js";
import {
  access,
  own,
  has,
  employeeFor,
  scheduleFor,
  uid,
  stamp,
  respondList,
  joined,
  scopeRows,
  decision,
  noSelf,
} from "./shared.js";
const dec = (v: unknown) => new Decimal(String(v || 0));
export async function leaveDates(
  d: RequestData,
  e: Row,
  start: string,
  end: string,
) {
  const dates: string[] = [];
  const holidays = await d.list("Holidays");
  for (const date of datesBetween(start, end)) {
    const schedule = await scheduleFor(d, e, date);
    if (workingDay(date, schedule, holidays, e) === "work_day")
      dates.push(date);
  }
  return dates;
}
async function countedDates(d: RequestData, e: Row, l: Row) {
  return l.working_dates
    ? array<string>(l.working_dates)
    : leaveDates(d, e, l.start_date, l.end_date);
}
export async function balance(
  d: RequestData,
  e: Row,
  type: Row,
  year: number,
  excludeId = "",
  asOf = stamp().slice(0, 10),
) {
  const requests = (await d.list("Leave")).filter(
    (l) =>
      l.employee_id === e.employee_id &&
      l.leave_type_id === type.leave_type_id &&
      l.leave_id !== excludeId &&
      ["approved", "pending"].includes(l.status),
  );
  const counts = await Promise.all(
    requests.map(async (l) => ({ row: l, dates: await countedDates(d, e, l) })),
  );
  const entitlements = await d.list("Leave_Entitlements");
  let carry = new Decimal(0),
    result: Row = {};
  const hire = DateTime.fromISO(e.hire_date);
  const first = Math.max(hire.isValid ? hire.year : year, year - 100);
  for (let y = first; y <= year; y++) {
    const override = entitlements.find(
      (r) =>
        r.employee_id === e.employee_id &&
        r.leave_type_id === type.leave_type_id &&
        Number(r.year) === y,
    );
    const entitled = dec(override?.days ?? type.annual_entitlement),
      firstMonth = hire.year === y ? hire.month : 1;
    const ref = DateTime.fromISO(asOf);
    const lastMonth = y < ref.year ? 12 : y === ref.year ? ref.month : 0;
    const months = Math.max(0, lastMonth - firstMonth + 1);
    const accrued =
      type.accrual_mode === "monthly"
        ? entitled.mul(months).div(12).toDecimalPlaces(4)
        : entitled;
    const usedDates = counts
      .filter((c) => c.row.status === "approved")
      .flatMap((c) => c.dates)
      .filter((date) => date.startsWith(`${y}-`));
    const pendingDates = counts
      .filter((c) => c.row.status === "pending")
      .flatMap((c) => c.dates)
      .filter((date) => date.startsWith(`${y}-`));
    let usableCarry = carry;
    if (
      type.carry_expiry_month &&
      (y < ref.year ||
        (y === ref.year && ref.month > Number(type.carry_expiry_month)))
    ) {
      const consumed = usedDates.filter(
        (date) => Number(date.slice(5, 7)) <= Number(type.carry_expiry_month),
      ).length;
      usableCarry = Decimal.min(carry, consumed);
    }
    const used = dec(usedDates.length),
      pending = dec(pendingDates.length),
      available = accrued.plus(usableCarry).minus(used).minus(pending);
    result = {
      employee_id: e.employee_id,
      employee_name: `${e.first_name} ${e.last_name}`,
      leave_type_id: type.leave_type_id,
      leave_type_name: type.name,
      year: y,
      entitled: entitled.toFixed(4),
      accrued: accrued.toFixed(4),
      carried: usableCarry.toFixed(4),
      used: used.toFixed(4),
      pending: pending.toFixed(4),
      available: Decimal.max(0, available).toFixed(4),
    };
    carry = Decimal.min(
      dec(type.carry_forward_limit),
      Decimal.max(0, accrued.plus(usableCarry).minus(used)),
    );
  }
  return Object.keys(result).length
    ? result
    : {
        employee_id: e.employee_id,
        employee_name: `${e.first_name} ${e.last_name}`,
        leave_type_id: type.leave_type_id,
        leave_type_name: type.name,
        year,
        entitled: "0.0000",
        accrued: "0.0000",
        carried: "0.0000",
        used: "0.0000",
        pending: "0.0000",
        available: "0.0000",
      };
}
export async function balances(d: RequestData, employees: Row[], year: number) {
  const types = (await d.list("Leave_Types")).filter(
    (t) => t.status !== "inactive",
  );
  const rows: Row[] = [];
  for (const e of employees)
    for (const type of types) rows.push(await balance(d, e, type, year));
  return rows;
}
async function validateLeave(d: RequestData, row: Row, e: Row, type: Row) {
  assert(
    type.status !== "inactive",
    422,
    "LEAVE_TYPE_INACTIVE",
    "This leave type is inactive.",
  );
  assert(
    row.start_date >= e.hire_date &&
      (!e.employment_end_date || row.end_date <= e.employment_end_date),
    422,
    "OUTSIDE_EMPLOYMENT",
    "Leave must fall within the employment period.",
  );
  const dates = row.working_dates
    ? array<string>(row.working_dates)
    : await leaveDates(d, e, row.start_date, row.end_date);
  assert(
    dates.length > 0,
    422,
    "NO_WORKING_DAYS",
    "This request contains no scheduled working days.",
  );
  if (type.requires_document)
    assert(
      row.supporting_attachment_id,
      422,
      "DOCUMENT_REQUIRED",
      "This leave type requires a supporting document.",
    );
  if (row.supporting_attachment_id) {
    const a = await d.find("Leave_Attachments", row.supporting_attachment_id);
    assert(
      a.employee_id === e.employee_id &&
        (!a.leave_id || a.leave_id === row.leave_id),
      403,
      "INVALID_ATTACHMENT",
      "The supporting document is not available for this request.",
    );
  }
  if (row.status !== "draft") {
    assert(
      !(await d.list("Leave")).some(
        (l) =>
          l.leave_id !== row.leave_id &&
          l.employee_id === row.employee_id &&
          ["pending", "approved"].includes(l.status) &&
          l.start_date <= row.end_date &&
          l.end_date >= row.start_date,
      ),
      409,
      "LEAVE_OVERLAP",
      "This request overlaps pending or approved leave.",
    );
    for (const year of new Set(dates.map((date) => Number(date.slice(0, 4))))) {
      const b = await balance(d, e, type, year, row.leave_id);
      assert(
        dec(b.available).gte(
          dates.filter((date) => date.startsWith(`${year}-`)).length,
        ),
        422,
        "INSUFFICIENT_LEAVE_BALANCE",
        `Insufficient ${type.name} balance for ${year}.`,
      );
    }
  }
  return dates;
}
async function attendanceChanges(
  d: RequestData,
  row: Row,
  e: Row,
  cancel = false,
): Promise<Change[]> {
  const records = await d.list("Attendance"),
    changes: Change[] = [];
  for (const date of array<string>(row.working_dates)) {
    const existing = records.find(
      (a) => a.employee_id === row.employee_id && a.date === date,
    );
    if (cancel) {
      if (existing && existing.leave_id === row.leave_id) {
        assert(
          existing.approval_status !== "finalized",
          409,
          "ATTENDANCE_FINALIZED",
          "This leave has finalized attendance. HR must approve a correction before cancellation.",
        );
        changes.push({
          table: "Attendance",
          record: {
            ...existing,
            leave_id: "",
            source: "reconciliation",
            status: "absent",
            attendance_status: "absent",
            approval_status: "pending",
            updated_at: stamp(),
          },
        });
      }
      continue;
    }
    assert(
      !existing?.clock_in &&
        existing?.approval_status !== "finalized" &&
        existing?.status !== "pending_correction",
      409,
      "ATTENDANCE_CONFLICT",
      "Clocked, finalized or pending-correction attendance conflicts with this leave.",
    );
    const schedule = await scheduleFor(d, e, date);
    changes.push({
      table: "Attendance",
      record: {
        ...existing,
        attendance_id: existing?.attendance_id || uid(),
        employee_id: e.employee_id,
        date,
        status: "on_leave",
        attendance_status: "on_leave",
        source: "approved_leave",
        approval_status: "approved",
        leave_id: row.leave_id,
        leave_policy_snapshot: parseJSON(row.policy_snapshot, {}),
        schedule_id: schedule.schedule_id,
        schedule_snapshot: schedule,
        work_minutes: 0,
        break_minutes: 0,
        overtime_minutes: 0,
        late_minutes: 0,
        early_minutes: 0,
        breaks: [],
        created_at: existing?.created_at || stamp(),
        updated_at: stamp(),
      },
    });
  }
  return changes;
}
export function installLeave(app: Express, ctx: ApiContext) {
  app.get(
    "/api/workforce/leave-balances",
    wrap(async (req, res) => {
      access(req, "leave.read", "self.leave");
      const q = V.querySchema.parse(req.query),
        d = new RequestData(ctx.repository);
      let employees = scopeRows(req, await d.list("Employees"), "leave.read");
      if (q.employee_id) {
        own(req, q.employee_id, "leave.read");
        employees = employees.filter((e) => e.employee_id === q.employee_id);
      }
      res.json({
        data: await balances(
          d,
          employees,
          q.year || new Date().getUTCFullYear(),
        ),
      });
    }),
  );
  for (const path of ["leave", "leave-calendar"])
    app.get(
      `/api/workforce/${path}`,
      wrap(async (req, res) => {
        access(req, "leave.read", "self.leave");
        const d = new RequestData(ctx.repository),
          q = V.querySchema.parse(req.query);
        let rows = await joined(
          d,
          scopeRows(req, await d.list("Leave"), "leave.read"),
        );
        const decisions = await d.list("Approval_Decisions");
        rows = rows.map((l) => ({
          ...l,
          allow_self_approval:
            parseJSON<Row>(l.policy_snapshot, {}).allow_self_approval === true,
          decisions: decisions.filter(
            (a) => a.request_type === "leave" && a.request_id === l.leave_id,
          ),
        }));
        if (path === "leave-calendar") {
          rows = rows.filter(
            (l) =>
              ["approved", "pending"].includes(l.status) &&
              (!q.date_from || l.end_date >= q.date_from) &&
              (!q.date_to || l.start_date <= q.date_to),
          );
          respondList(
            res,
            rows,
            { ...q, date_from: undefined, date_to: undefined },
            "start_date",
          );
        } else respondList(res, rows, q, "start_date");
      }),
    );
  for (const method of ["post", "put"] as const)
    app[method](
      `/api/workforce/leave${method === "put" ? "/:id" : ""}`,
      wrap(async (req, res) => {
        access(req, "leave.write", "self.leave");
        await ctx.mutate(req, res, async (d) => {
          const previous =
            method === "put"
              ? await d.find("Leave", String(req.params.id))
              : undefined;
          if (previous) {
            own(req, previous.employee_id, "leave.write");
            assert(
              previous.status === "draft",
              409,
              "LEAVE_LOCKED",
              "Only draft leave requests can be edited.",
            );
          }
          const b = V.leaveSchema.parse(req.body),
            e = await employeeFor(
              req,
              d,
              b.employee_id || previous?.employee_id,
              "leave.write",
            );
          assert(
            !previous || e.employee_id === previous.employee_id,
            422,
            "EMPLOYEE_IMMUTABLE",
            "The employee on a leave request cannot be changed.",
          );
          const type = await d.find("Leave_Types", b.leave_type_id);
          const row: Row = {
            ...previous,
            ...b,
            employee_id: e.employee_id,
            leave_id: previous?.leave_id || uid(),
            leave_type: type.name,
            created_by: previous?.created_by || req.user.user_id,
            approval_roles: array(type.approval_roles),
            approval_level: 0,
            policy_snapshot: type,
            created_at: previous?.created_at || stamp(),
            updated_at: stamp(),
          };
          delete row.working_dates;
          row.working_dates = await validateLeave(d, row, e, type);
          row.days = row.working_dates.length;
          const changes: Change[] = [{ table: "Leave", record: row }];
          if (row.supporting_attachment_id)
            changes.push({
              table: "Leave_Attachments",
              record: {
                ...(await d.find(
                  "Leave_Attachments",
                  row.supporting_attachment_id,
                )),
                leave_id: row.leave_id,
              },
            });
          return {
            data: row,
            changes,
            previous,
            id: row.leave_id,
            entity: "leave",
            status: method === "post" ? 201 : 200,
          };
        });
      }),
    );
  for (const action of ["submit", "approve", "reject", "cancel"])
    app.post(
      `/api/workforce/leave/:id/${action}`,
      wrap(async (req, res) => {
        access(req, "leave.write", "self.leave");
        if (["approve", "reject"].includes(action))
          requirePermission(req, "leave.approve");
        const b = V.decisionSchema.parse(req.body);
        await ctx.mutate(req, res, async (d) => {
          const previous = await d.find("Leave", String(req.params.id)),
            e = await d.find("Employees", previous.employee_id);
          const type =
            action === "submit"
              ? await d.find("Leave_Types", previous.leave_type_id)
              : parseJSON<Row>(
                  previous.policy_snapshot,
                  await d.find("Leave_Types", previous.leave_type_id),
                );
          let row: Row = { ...previous, updated_at: stamp() },
            changes: Change[] = [];
          if (action === "submit") {
            own(req, e.employee_id, "leave.write");
            assert(
              previous.status === "draft",
              409,
              "INVALID_LEAVE_STATE",
              "Only drafts may be submitted.",
            );
            row = {
              ...row,
              status: "pending",
              approval_roles: array(type.approval_roles),
              approval_level: 0,
              policy_snapshot: type,
            };
            delete row.working_dates;
            row.working_dates = await validateLeave(d, row, e, type);
            row.days = row.working_dates.length;
          }
          if (["approve", "reject"].includes(action)) {
            assert(
              previous.status === "pending",
              409,
              "INVALID_LEAVE_STATE",
              "Only pending leave may be approved or rejected.",
            );
            noSelf(
              req,
              previous.created_by,
              e.employee_id,
              type.allow_self_approval === true,
            );
            const roles = array<string>(previous.approval_roles),
              level = Number(previous.approval_level || 0);
            assert(
              req.user.role === "administrator" ||
                req.user.role === roles[level],
              403,
              "APPROVAL_LEVEL_FORBIDDEN",
              "This approval level is assigned to another role.",
            );
            assert(
              !(await d.list("Approval_Decisions")).some(
                (a) =>
                  a.request_type === "leave" &&
                  a.request_id === row.leave_id &&
                  a.approver_id === req.user.user_id &&
                  a.decision === "approve",
              ),
              403,
              "DISTINCT_APPROVER_REQUIRED",
              "A different approver must complete each approval level.",
            );
            row.status =
              action === "reject"
                ? "rejected"
                : level + 1 >= roles.length
                  ? "approved"
                  : "pending";
            row.approval_level = action === "approve" ? level + 1 : level;
            row.approved_by = req.user.user_id;
            row.comments = b.comments;
            if (action === "approve") {
              await validateLeave(d, { ...row, status: "pending" }, e, type);
              if (row.status === "approved")
                changes.push(...(await attendanceChanges(d, row, e)));
            }
          }
          if (action === "cancel") {
            own(req, e.employee_id, "leave.write");
            assert(
              ["draft", "pending", "approved"].includes(previous.status),
              409,
              "INVALID_LEAVE_STATE",
              "This leave request cannot be cancelled.",
            );
            if (previous.status === "approved")
              changes.push(...(await attendanceChanges(d, row, e, true)));
            row.status = "cancelled";
          }
          changes.push(
            { table: "Leave", record: row },
            decision(
              req,
              "leave",
              row.leave_id,
              action,
              previous.status,
              row.status,
              b.comments,
              Number(previous.approval_level || 0),
              previous.created_by,
            ),
          );
          return {
            data: row,
            previous,
            changes,
            id: row.leave_id,
            entity: "leave",
          };
        });
      }),
    );
}
