import type { Express } from "express";
import { DateTime } from "luxon";
import { Decimal } from "decimal.js";
import { ApiContext } from "../context.js";
import { RequestData, type Row } from "../repository.js";
import { wrap, requirePermission } from "../auth.js";
import { assert } from "../errors.js";
import { exportRows } from "../reporting.js";
import { sanitizeEmployee } from "../permissions.js";
import { querySchema } from "./validation.js";
import {
  access,
  employeeFor,
  currentShift,
  scopeRows,
  joined,
  filterRows,
  respondList,
  has,
} from "./shared.js";
import { balances, leaveDates } from "./leave.js";
import {
  array,
  calculateAttendance,
  datesBetween,
  eligible,
  shiftBounds,
} from "./calculations.js";
import { materialize } from "./attendance.js";
import { snapshot, scheduleFor } from "./shared.js";
export function installWorkforceReporting(app: Express, ctx: ApiContext) {
  app.get(
    "/api/workforce/me",
    wrap(async (req, res) => {
      assert(
        has(req, "attendance.read") ||
          has(req, "self.attendance") ||
          has(req, "self.leave"),
        403,
        "FORBIDDEN",
        "Workforce self-service permission is required.",
      );
      const d = new RequestData(ctx.repository),
        employee = await employeeFor(req, d, undefined, "never.staff"),
        shift = await currentShift(d, employee);
      const attendance =
        (await d.list("Attendance"))
          .filter((a) => a.employee_id === employee.employee_id)
          .find((a) => a.clock_in && !a.clock_out) ||
        (await d.list("Attendance")).find(
          (a) =>
            a.employee_id === employee.employee_id && a.date === shift.date,
        ) ||
        null;
      res.json({
        data: {
          employee: sanitizeEmployee(employee, []),
          attendance,
          schedule: shift.schedule,
          leave_balances: await balances(
            d,
            [employee],
            Number(shift.date.slice(0, 4)),
          ),
        },
      });
    }),
  );
  app.get(
    "/api/workforce/dashboard",
    wrap(async (req, res) => {
      access(req, "attendance.read", "self.attendance");
      const d = new RequestData(ctx.repository),
        q = querySchema.parse(req.query);
      const date = new Date().toISOString().slice(0, 10);
      const from = q.date_from || date,
        to = q.date_to || date;
      assert(
        DateTime.fromISO(to).diff(DateTime.fromISO(from), "days").days <= 366,
        422,
        "RANGE_TOO_LARGE",
        "Use up to one year for attendance dashboards.",
      );
      const stored = scopeRows(
          req,
          await d.list("Attendance"),
          "attendance.read",
        ),
        all = [...stored];
      const employees = scopeRows(
        req,
        await d.list("Employees"),
        "attendance.read",
      );
      for (const day of datesBetween(from, to))
        if (day <= date)
          for (const e of employees) {
            if (
              !eligible(e, day) ||
              stored.some(
                (a) => a.employee_id === e.employee_id && a.date === day,
              )
            )
              continue;
            try {
              const policy = await scheduleFor(d, e, day);
              if (DateTime.now() < shiftBounds(day, policy).start) continue;
              all.push(await materialize(d, e, day));
            } catch (error) {
              if ((error as any).code !== "SCHEDULE_REQUIRED") throw error;
            }
          }
      const rows = filterRows(
        await joined(
          d,
          all.map((a) => {
            if (
              a.clock_in &&
              !a.clock_out &&
              Date.now() - Date.parse(a.clock_in) <= 36 * 3600000
            )
              return calculateAttendance(a, snapshot(a));
            return a;
          }),
        ),
        { ...q, date_from: from, date_to: to },
      );
      const metric = (rs: Row[]) => {
        const count = (...states: string[]) =>
          rs.filter((r) => states.includes(r.status || r.attendance_status))
            .length;
        const present = count("present", "late", "half_day"),
          absent = count("absent"),
          on_leave = count("on_leave"),
          denominator = present + absent;
        return {
          present,
          absent,
          late: count("late"),
          on_leave,
          work_minutes: rs.reduce((s, r) => s + Number(r.work_minutes || 0), 0),
          overtime_minutes: rs.reduce(
            (s, r) => s + Number(r.overtime_minutes || 0),
            0,
          ),
          attendance_percentage: denominator
            ? new Decimal(present).mul(100).div(denominator).toFixed(2)
            : "0.00",
        };
      };
      const depts = await d.list("Departments"),
        departments = depts
          .filter(
            (dept) =>
              !q.department_id || dept.department_id === q.department_id,
          )
          .map((dept) => ({
            department_id: dept.department_id,
            name: dept.department_name,
            ...metric(
              rows.filter((r) => r.department_id === dept.department_id),
            ),
          }));
      const trends = [...new Set(rows.map((r) => r.date))]
        .sort()
        .map((date) => ({
          date,
          ...metric(rows.filter((r) => r.date === date)),
        }));
      const corrections = filterRows(
        await joined(
          d,
          scopeRows(
            req,
            await d.list("Attendance_Corrections"),
            "attendance.read",
          ),
        ),
        { ...q, date_from: undefined, date_to: undefined, status: "pending" },
        "created_at",
      );
      res.json({
        data: {
          metrics: metric(rows),
          departments,
          trends,
          pending_corrections: corrections.slice(0, 10),
          definitions: {
            attendance_percentage:
              "Present, late and half-day records divided by those records plus absent records. Leave, holidays and rest days are excluded. Missing elapsed scheduled days are derived from employee schedules and approved leave.",
            working_hours:
              "Approved or recorded net working minutes divided by 60; payroll only uses finalized inputs.",
          },
        },
      });
    }),
  );
  app.get(
    "/api/workforce/reports/:kind",
    wrap(async (req, res) => {
      requirePermission(req, "reports.hr");
      const q = querySchema.parse(req.query),
        d = new RequestData(ctx.repository),
        kind = String(req.params.kind);
      assert(
        [
          "attendance",
          "absence",
          "lateness",
          "overtime",
          "leave-utilization",
        ].includes(kind),
        404,
        "REPORT_NOT_FOUND",
        "Unknown workforce report.",
      );
      let rows: Row[];
      if (kind === "leave-utilization") {
        const employees = (await d.list("Employees")).filter(
          (e) =>
            (!q.employee_id || e.employee_id === q.employee_id) &&
            (!q.department_id || e.department_id === q.department_id),
        );
        const types = await d.list("Leave_Types"),
          requests = await d.list("Leave");
        rows = [];
        const from =
            q.date_from || `${q.year || new Date().getUTCFullYear()}-01-01`,
          to = q.date_to || `${q.year || new Date().getUTCFullYear()}-12-31`;
        for (const e of employees)
          for (const type of types) {
            let used = 0,
              pending = 0;
            for (const l of requests.filter(
              (l) =>
                l.employee_id === e.employee_id &&
                l.leave_type_id === type.leave_type_id &&
                ["approved", "pending"].includes(l.status),
            )) {
              const days = l.working_dates
                ? array<string>(l.working_dates)
                : await leaveDates(d, e, l.start_date, l.end_date);
              const n = days.filter(
                (date) => date >= from && date <= to,
              ).length;
              if (l.status === "approved") used += n;
              else pending += n;
            }
            rows.push({
              employee_id: e.employee_id,
              employee_name: `${e.first_name} ${e.last_name}`,
              department_id: e.department_id,
              leave_type: type.name,
              date_from: from,
              date_to: to,
              approved_days: used,
              pending_days: pending,
            });
          }
      } else {
        rows = filterRows(await joined(d, await d.list("Attendance")), q);
        if (kind === "absence")
          rows = rows.filter(
            (r) => (r.status || r.attendance_status) === "absent",
          );
        if (kind === "lateness")
          rows = rows.filter((r) => Number(r.late_minutes) > 0);
        if (kind === "overtime")
          rows = rows.filter((r) => Number(r.overtime_minutes) > 0);
      }
      rows = rows.map((r) =>
        Object.fromEntries(
          Object.entries(r).filter(
            ([k]) =>
              ![
                "schedule_snapshot",
                "breaks",
                "created_by",
                "company_id",
              ].includes(k),
          ),
        ),
      );
      if (q.format !== "json") {
        await exportRows(res, rows, kind, q.format);
        return;
      }
      respondList(res, rows, {
        ...q,
        date_from: undefined,
        date_to: undefined,
      });
    }),
  );
}
