import type { Request, Response } from "express";
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import {
  RequestData,
  publicRow,
  type Row,
  type Change,
} from "../repository.js";
import { assert, AppError } from "../errors.js";
import { parseJSON } from "../permissions.js";
import { querySchema } from "./validation.js";
import { shiftBounds } from "./calculations.js";
export const stamp = () => new Date().toISOString();
export const uid = () => randomUUID();
export const has = (req: Request, p: string) => req.permissions.includes(p);
export function access(req: Request, staff: string, self: string) {
  assert(
    has(req, staff) || has(req, self),
    403,
    "FORBIDDEN",
    "You do not have permission to access this workforce operation.",
  );
}
export function own(req: Request, employeeId: string, staff: string) {
  assert(
    has(req, staff) || req.user.employee_id === employeeId,
    403,
    "FORBIDDEN",
    "You may only access your own employee records.",
  );
}
export async function employeeFor(
  req: Request,
  d: RequestData,
  id?: string,
  staff = "attendance.write",
) {
  const employeeId = id || req.user.employee_id;
  assert(
    employeeId,
    422,
    "EMPLOYEE_LINK_REQUIRED",
    "Your account must be linked to an employee record.",
  );
  own(req, employeeId, staff);
  return d.find("Employees", employeeId);
}
export async function scheduleFor(
  d: RequestData,
  e: Row,
  date: string,
): Promise<Row> {
  const [schedules, assignments] = await Promise.all([
    d.list("Work_Schedules"),
    d.list("Shift_Assignments"),
  ]);
  const assignment = assignments
    .filter(
      (a) =>
        a.employee_id === e.employee_id &&
        a.start_date <= date &&
        (!a.end_date || a.end_date >= date),
    )
    .sort((a, b) => b.start_date.localeCompare(a.start_date))[0];
  let schedule = assignment
    ? schedules.find((s) => s.schedule_id === assignment.schedule_id)
    : undefined;
  if (!schedule)
    schedule =
      schedules.find(
        (s) =>
          s.status !== "inactive" &&
          s.is_default !== false &&
          s.department_id === e.department_id,
      ) ||
      schedules.find(
        (s) =>
          s.status !== "inactive" && s.is_default !== false && !s.department_id,
      );
  assert(
    schedule,
    422,
    "SCHEDULE_REQUIRED",
    "Configure a work schedule for this employee before recording attendance or leave.",
  );
  return publicRow(schedule);
}
export async function currentShift(d: RequestData, e: Row, at = stamp()) {
  let date = at.slice(0, 10);
  let schedule = await scheduleFor(d, e, date);
  date = DateTime.fromISO(at).setZone(schedule.timezone).toISODate()!;
  schedule = await scheduleFor(d, e, date);
  const previous = DateTime.fromISO(date).minus({ days: 1 }).toISODate()!;
  const prevSchedule = await scheduleFor(d, e, previous);
  const bounds = shiftBounds(previous, prevSchedule);
  if (
    prevSchedule.expected_end <= prevSchedule.expected_start &&
    DateTime.fromISO(at) < bounds.end
  ) {
    date = previous;
    schedule = prevSchedule;
  }
  return { date, schedule };
}
export const snapshot = (r: Row) => parseJSON<Row>(r.schedule_snapshot, {});
export async function joined(d: RequestData, rows: Row[]): Promise<Row[]> {
  const employees = await d.list("Employees");
  return rows.map((r) => {
    const e = employees.find((e) => e.employee_id === r.employee_id);
    return {
      ...publicRow(r),
      employee_name: e ? `${e.first_name} ${e.last_name}` : "",
      department_id: e?.department_id || "",
      employee_number: e?.employee_number || "",
    };
  });
}
export function scopeRows(req: Request, rows: Row[], staff: string) {
  return has(req, staff)
    ? rows
    : rows.filter((r) => r.employee_id === req.user.employee_id);
}
export function filterRows(rows: Row[], query: unknown, dateField = "date") {
  const q = querySchema.parse(query);
  return rows
    .filter(
      (r) =>
        (!q.employee_id || r.employee_id === q.employee_id) &&
        (!q.department_id || r.department_id === q.department_id) &&
        (!q.schedule_id || r.schedule_id === q.schedule_id) &&
        (!q.status || (r.status || r.attendance_status) === q.status) &&
        (!q.approval_status || r.approval_status === q.approval_status) &&
        (!q.date_from ||
          String(r[dateField] || r.start_date || r.created_at).slice(0, 10) >=
            q.date_from) &&
        (!q.date_to ||
          String(r[dateField] || r.start_date || r.created_at).slice(0, 10) <=
            q.date_to) &&
        (!q.search ||
          [r.employee_name, r.name, r.reason].some((v) =>
            String(v || "")
              .toLowerCase()
              .includes(q.search!.toLowerCase()),
          )),
    )
    .sort((a, b) =>
      String(b[dateField] || b.created_at || "").localeCompare(
        String(a[dateField] || a.created_at || ""),
      ),
    );
}
export function respondList(
  res: Response,
  rows: Row[],
  query: unknown,
  dateField = "date",
) {
  const q = querySchema.parse(query),
    out = filterRows(rows, q, dateField);
  res.json({
    data: out.slice((q.page - 1) * q.pageSize, q.page * q.pageSize),
    meta: { total: out.length, page: q.page, pageSize: q.pageSize },
  });
}
export function decision(
  req: Request,
  type: string,
  id: string,
  action: string,
  previous: string,
  next: string,
  comments = "",
  level = 0,
  requester = "",
): Change {
  return {
    table: "Approval_Decisions",
    record: {
      decision_id: uid(),
      request_type: type,
      request_id: id,
      approver_id: req.user.user_id,
      requester,
      decision: action,
      comments,
      previous_status: previous,
      new_status: next,
      approval_level: level,
      created_at: stamp(),
    },
  };
}
export function noSelf(
  req: Request,
  requester: string,
  employeeId: string,
  allow = false,
) {
  assert(
    (req.user.user_id !== requester && req.user.employee_id !== employeeId) ||
      (allow && req.user.role === "administrator"),
    403,
    "SELF_APPROVAL_FORBIDDEN",
    "You cannot approve your own request.",
  );
}
export async function immutablePeriod(d: RequestData, month: string) {
  assert(
    !(await d.list("Payroll_Runs")).some(
      (r) =>
        r.payroll_month === month &&
        ["approved", "finalized", "paid"].includes(r.status),
    ),
    409,
    "PAYROLL_PERIOD_LOCKED",
    "This payroll period is already approved or finalized. Use a later authorized correction period.",
  );
}
export async function queryRows(
  d: RequestData,
  table: string,
  where: Record<string, any>,
): Promise<Row[]> {
  if (d.repository.query) {
    const rows: Row[] = [];
    let total = Infinity;
    while (rows.length < total) {
      const page = await d.repository.query(table, {
        where,
        skip: rows.length,
        take: 1000,
      });
      rows.push(...page.rows);
      total = page.total;
      if (!page.rows.length) break;
    }
    return rows;
  }
  return (await d.list(table)).filter((r) =>
    Object.entries(where).every(([k, v]) =>
      typeof v === "object"
        ? (v.in?.includes(r[k]) ??
          ((!v.gte || r[k] >= v.gte) && (!v.lte || r[k] <= v.lte)))
        : r[k] === v,
    ),
  );
}
