import { parseJSON } from "../permissions.js";
import type { Express } from "express";
import { DateTime } from "luxon";
import { z } from "zod";
import { ApiContext } from "../context.js";
import { RequestData, type Row, type Change } from "../repository.js";
import { wrap, requirePermission } from "../auth.js";
import { assert } from "../errors.js";
import * as V from "./validation.js";
import {
  calculateAttendance,
  eligible,
  workingDay,
  array,
} from "./calculations.js";
import {
  access,
  own,
  employeeFor,
  scheduleFor,
  currentShift,
  snapshot,
  uid,
  stamp,
  respondList,
  joined,
  scopeRows,
  decision,
  noSelf,
  queryRows,
} from "./shared.js";
export async function materialize(
  d: RequestData,
  e: Row,
  date: string,
): Promise<Row> {
  const schedule = await scheduleFor(d, e, date),
    kind = workingDay(date, schedule, await d.list("Holidays"), e);
  const leave = (await d.list("Leave")).find(
    (l) =>
      l.employee_id === e.employee_id &&
      l.status === "approved" &&
      l.start_date <= date &&
      l.end_date >= date,
  );
  const status = kind === "work_day" ? (leave ? "on_leave" : "absent") : kind;
  return {
    attendance_id: uid(),
    employee_id: e.employee_id,
    date,
    status,
    attendance_status: status,
    source: "reconciliation",
    approval_status: leave ? "approved" : "pending",
    leave_id: leave?.leave_id || "",
    leave_policy_snapshot: parseJSON(leave?.policy_snapshot, {}),
    schedule_id: schedule.schedule_id,
    schedule_snapshot: schedule,
    work_minutes: 0,
    break_minutes: 0,
    overtime_minutes: 0,
    late_minutes: 0,
    early_minutes: 0,
    breaks: [],
    created_at: stamp(),
    updated_at: stamp(),
  };
}
export function installAttendance(app: Express, ctx: ApiContext) {
  for (const action of ["clock-in", "clock-out", "break-start", "break-end"])
    app.post(
      `/api/workforce/${action}`,
      wrap(async (req, res) => {
        requirePermission(req, "self.attendance");
        z.object({}).strict().parse(req.body);
        await ctx.mutate(req, res, async (d) => {
          const e = await employeeFor(req, d, undefined, "never.staff");
          const at = stamp(),
            shift = await currentShift(d, e, at);
          assert(
            eligible(e, shift.date),
            403,
            "EMPLOYMENT_INACTIVE",
            "This employee is not currently eligible to record attendance.",
          );
          const records = await queryRows(d, "Attendance", {
            employee_id: e.employee_id,
          });
          let previous =
            action === "clock-in"
              ? records.find((r) => r.date === shift.date)
              : records.find((r) => r.clock_in && !r.clock_out);
          let row: Row;
          if (action === "clock-in") {
            assert(
              !records.some((r) => r.clock_in && !r.clock_out),
              409,
              "ALREADY_CLOCKED_IN",
              "Clock out of your existing attendance record first.",
            );
            assert(
              !previous ||
                (!previous.clock_in &&
                  previous.source === "reconciliation" &&
                  previous.approval_status === "pending" &&
                  previous.status === "absent"),
              409,
              "ATTENDANCE_EXISTS",
              "Attendance already exists for this day. Submit a correction request.",
            );
            assert(
              workingDay(
                shift.date,
                shift.schedule,
                await d.list("Holidays"),
                e,
              ) === "work_day",
              409,
              "NOT_WORKING_DAY",
              "This date is not a scheduled workday. HR can record authorized exceptional attendance.",
            );
            assert(
              !(await d.list("Leave")).some(
                (l) =>
                  l.employee_id === e.employee_id &&
                  l.status === "approved" &&
                  l.start_date <= shift.date &&
                  l.end_date >= shift.date,
              ),
              409,
              "ON_APPROVED_LEAVE",
              "Approved leave covers this date. Contact HR before recording work.",
            );
            row = {
              ...previous,
              attendance_id: previous?.attendance_id || uid(),
              employee_id: e.employee_id,
              date: shift.date,
              clock_in: at,
              clock_out: "",
              breaks: [],
              source: "clock",
              created_by: req.user.user_id,
              approval_status: "pending",
              schedule_id: shift.schedule.schedule_id,
              schedule_snapshot: shift.schedule,
              created_at: at,
              updated_at: at,
            };
          } else {
            assert(
              previous,
              409,
              "NOT_CLOCKED_IN",
              "Clock in before using this action.",
            );
            assert(
              previous.approval_status !== "finalized",
              409,
              "ATTENDANCE_LOCKED",
              "Finalized attendance requires an approved correction.",
            );
            row = {
              ...previous,
              breaks: array(previous.breaks).map((b) => ({ ...b })),
              updated_at: at,
            };
            const active = row.breaks.find((b: Row) => !b.ended_at);
            if (action === "break-start") {
              assert(
                snapshot(row).track_breaks,
                409,
                "BREAK_TRACKING_DISABLED",
                "Break tracking is disabled for this schedule.",
              );
              assert(
                !active,
                409,
                "BREAK_ALREADY_STARTED",
                "End your current break first.",
              );
              row.breaks.push({ started_at: at, ended_at: null });
            }
            if (action === "break-end") {
              assert(
                active,
                409,
                "NO_ACTIVE_BREAK",
                "There is no active break to end.",
              );
              active.ended_at = at;
            }
            if (action === "clock-out") {
              assert(
                !active,
                409,
                "BREAK_ACTIVE",
                "End your break before clocking out.",
              );
              row.clock_out = at;
            }
          }
          row = calculateAttendance(row, snapshot(row), at);
          return {
            data: row,
            changes: [{ table: "Attendance", record: row }],
            previous,
            entity: "attendance",
            id: row.attendance_id,
          };
        });
      }),
    );
  app.get(
    "/api/workforce/attendance",
    wrap(async (req, res) => {
      access(req, "attendance.read", "self.attendance");
      const d = new RequestData(ctx.repository);
      const rows = await joined(
        d,
        scopeRows(req, await d.list("Attendance"), "attendance.read"),
      );
      respondList(res, rows, req.query);
    }),
  );
  app.get(
    "/api/workforce/attendance/:id",
    wrap(async (req, res) => {
      access(req, "attendance.read", "self.attendance");
      const d = new RequestData(ctx.repository),
        attendance = await d.find("Attendance", String(req.params.id));
      own(req, attendance.employee_id, "attendance.read");
      const corrections = (await d.list("Attendance_Corrections")).filter(
        (c) => c.attendance_id === attendance.attendance_id,
      );
      const ids = new Set([
        attendance.attendance_id,
        ...corrections.map((c) => c.correction_id),
      ]);
      res.json({
        data: {
          attendance,
          corrections,
          decisions: (await d.list("Approval_Decisions")).filter((a) =>
            ids.has(a.request_id),
          ),
        },
      });
    }),
  );
  app.post(
    "/api/workforce/attendance",
    wrap(async (req, res) => {
      requirePermission(req, "attendance.write");
      await ctx.mutate(req, res, async (d) => {
        const b = V.manualSchema.parse(req.body),
          e = await d.find("Employees", b.employee_id),
          schedule = await scheduleFor(d, e, b.date);
        assert(
          !(
            await queryRows(d, "Attendance", {
              employee_id: e.employee_id,
              date: b.date,
            })
          ).length,
          409,
          "ATTENDANCE_EXISTS",
          "Use a correction request to change an existing record.",
        );
        assert(
          b.date <= DateTime.now().setZone(schedule.timezone).toISODate()!,
          422,
          "FUTURE_ATTENDANCE",
          "Attendance cannot be recorded in the future.",
        );
        assert(
          (!b.clock_in ||
            DateTime.fromISO(b.clock_in).toMillis() <= Date.now()) &&
            (!b.clock_out ||
              DateTime.fromISO(b.clock_out).toMillis() <= Date.now()),
          422,
          "FUTURE_ATTENDANCE",
          "Attendance timestamps cannot be in the future.",
        );
        assert(
          !b.clock_in ||
            DateTime.fromISO(b.clock_in)
              .setZone(schedule.timezone)
              .toISODate() === b.date,
          422,
          "ATTENDANCE_DATE_MISMATCH",
          "Clock-in must fall on the attendance date in the schedule timezone.",
        );
        assert(
          !b.clock_out || b.clock_in,
          422,
          "CLOCK_IN_REQUIRED",
          "Clock-out requires clock-in.",
        );
        assert(
          !["present", "late", "half_day"].includes(b.status) || b.clock_in,
          422,
          "CLOCK_IN_REQUIRED",
          "Working attendance requires clock-in.",
        );
        let row: Row = {
          ...b,
          attendance_id: uid(),
          source: "manual",
          approval_status: "pending",
          created_by: req.user.user_id,
          schedule_id: schedule.schedule_id,
          schedule_snapshot: schedule,
          breaks: [],
          created_at: stamp(),
          updated_at: stamp(),
          attendance_status: b.status,
        };
        row = calculateAttendance(row, schedule);
        return {
          data: row,
          changes: [{ table: "Attendance", record: row }],
          status: 201,
          id: row.attendance_id,
          entity: "attendance",
        };
      });
    }),
  );
  app.post(
    "/api/workforce/attendance/reconcile",
    wrap(async (req, res) => {
      requirePermission(req, "attendance.write");
      await ctx.mutate(req, res, async (d) => {
        const { date } = z.object({ date: V.day }).strict().parse(req.body);
        assert(
          date <= stamp().slice(0, 10),
          422,
          "FUTURE_ATTENDANCE",
          "Cannot reconcile a future day.",
        );
        const existing = await queryRows(d, "Attendance", { date }),
          changes: Change[] = [];
        for (const e of await d.list("Employees"))
          if (
            eligible(e, date) &&
            !existing.some((r) => r.employee_id === e.employee_id)
          )
            changes.push({
              table: "Attendance",
              record: await materialize(d, e, date),
            });
        return {
          data: { date, created: changes.length },
          changes,
          entity: "attendance",
        };
      });
    }),
  );
  for (const action of ["approve", "finalize"])
    app.post(
      `/api/workforce/attendance/:id/${action}`,
      wrap(async (req, res) => {
        requirePermission(req, "attendance.approve");
        const b = V.decisionSchema.parse(req.body);
        await ctx.mutate(req, res, async (d) => {
          const previous = await d.find("Attendance", String(req.params.id));
          assert(
            previous.approval_status ===
              (action === "approve" ? "pending" : "approved"),
            409,
            "INVALID_ATTENDANCE_STATE",
            "Attendance must be pending for approval and approved before finalization.",
          );
          assert(
            previous.status !== "pending_correction",
            409,
            "CORRECTION_PENDING",
            "Resolve the pending correction first.",
          );
          assert(
            !previous.clock_in || previous.clock_out,
            409,
            "SHIFT_OPEN",
            "Clock out before approval.",
          );
          if (action === "approve")
            noSelf(req, previous.created_by || "", previous.employee_id);
          const row: Row = {
            ...previous,
            approval_status: action === "approve" ? "approved" : "finalized",
            approved_by: req.user.user_id,
            updated_at: stamp(),
          };
          return {
            data: row,
            previous,
            changes: [
              { table: "Attendance", record: row },
              decision(
                req,
                "attendance",
                row.attendance_id,
                action,
                previous.approval_status,
                row.approval_status,
                b.comments,
                0,
                previous.created_by || "",
              ),
            ],
            id: row.attendance_id,
            entity: "attendance",
          };
        });
      }),
    );
  app.get(
    "/api/workforce/corrections",
    wrap(async (req, res) => {
      access(req, "attendance.read", "self.attendance");
      const d = new RequestData(ctx.repository);
      respondList(
        res,
        await joined(
          d,
          scopeRows(
            req,
            await d.list("Attendance_Corrections"),
            "attendance.read",
          ),
        ),
        req.query,
        "created_at",
      );
    }),
  );
  app.post(
    "/api/workforce/corrections",
    wrap(async (req, res) => {
      access(req, "attendance.write", "self.attendance");
      await ctx.mutate(req, res, async (d) => {
        const b = V.correctionSchema.parse(req.body),
          a = await d.find("Attendance", b.attendance_id);
        own(req, a.employee_id, "attendance.write");
        assert(
          a.status !== "pending_correction",
          409,
          "CORRECTION_EXISTS",
          "A correction is already pending for this record.",
        );
        assert(
          b.clock_in && b.clock_out,
          422,
          "COMPLETE_CORRECTION_REQUIRED",
          "A correction must include both clock-in and clock-out.",
        );
        assert(
          DateTime.fromISO(b.clock_out).toMillis() <= Date.now(),
          422,
          "FUTURE_ATTENDANCE",
          "Corrections cannot contain future clock-out times.",
        );
        assert(
          DateTime.fromISO(b.clock_in)
            .setZone(snapshot(a).timezone || "UTC")
            .toISODate() === a.date,
          422,
          "ATTENDANCE_DATE_MISMATCH",
          "Correction clock-in must match the recorded date in the schedule timezone.",
        );
        calculateAttendance({ ...a, ...b, source: "correction" }, snapshot(a));
        const row = {
          ...b,
          correction_id: uid(),
          employee_id: a.employee_id,
          requested_by: req.user.user_id,
          status: "pending",
          previous_attendance: a,
            previous_status: a.status || a.attendance_status,
          previous_approval_status: a.approval_status,
          created_at: stamp(),
          updated_at: stamp(),
        };
        return {
          data: row,
          status: 201,
          changes: [
            { table: "Attendance_Corrections", record: row },
            {
              table: "Attendance",
              record: {
                ...a,
                status: "pending_correction",
                attendance_status: "pending_correction",
                updated_at: stamp(),
              },
            },
          ],
          id: row.correction_id,
          entity: "attendance-corrections",
        };
      });
    }),
  );
  for (const action of ["approve", "reject"])
    app.post(
      `/api/workforce/corrections/:id/${action}`,
      wrap(async (req, res) => {
        requirePermission(req, "attendance.approve");
        const b = V.decisionSchema.parse(req.body);
        await ctx.mutate(req, res, async (d) => {
          const previous = await d.find(
            "Attendance_Corrections",
            String(req.params.id),
          );
          assert(
            previous.status === "pending",
            409,
            "INVALID_CORRECTION_STATE",
            "Only pending corrections may be decided.",
          );
          noSelf(req, previous.requested_by, previous.employee_id);
          const a = await d.find("Attendance", previous.attendance_id),
            row: Row = {
              ...previous,
              status: action === "approve" ? "approved" : "rejected",
              comments: b.comments,
              approved_by: req.user.user_id,
              updated_at: stamp(),
            };
          let updated: Row = {
            ...a,
            status: previous.previous_status,
            attendance_status: previous.previous_status,
            approval_status: previous.previous_approval_status,
            updated_at: stamp(),
          };
          if (action === "approve")
            updated = {
              ...calculateAttendance(
                {
                  ...updated,
                  clock_in: row.clock_in,
                  clock_out: row.clock_out,
                  break_minutes: row.break_minutes,
                  source: "correction",
                },
                snapshot(a),
              ),
              approval_status: "approved",
              approved_by: req.user.user_id,
            };
          return {
            data: row,
            previous,
            changes: [
              { table: "Attendance_Corrections", record: row },
              { table: "Attendance", record: updated },
              decision(
                req,
                "attendance_correction",
                row.correction_id,
                action,
                "pending",
                row.status,
                b.comments,
                0,
                previous.requested_by,
              ),
            ],
            id: row.correction_id,
            entity: "attendance-corrections",
          };
        });
      }),
    );
}
