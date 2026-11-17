import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { DateTime } from "luxon";
import {
  calculateAttendance,
  shiftBounds,
} from "../src/workforce/calculations.js";
import { balance } from "../src/workforce/leave.js";
import { RequestData } from "../src/repository.js";
import { workforceFixture } from "../test/workforce-fixture.js";
const enabled = process.env.RUN_DATABASE_TESTS === "1";
const schedule = {
  timezone: "America/New_York",
  expected_start: "22:00",
  expected_end: "06:00",
  grace_minutes: 5,
  half_day_minutes: 240,
  track_breaks: true,
  overtime_enabled: true,
  overtime_after_minutes: 480,
};
test("overnight attendance uses real DST elapsed time and excludes breaks", () => {
  const { start, end } = shiftBounds("2026-10-31", schedule);
  assert.equal(end.diff(start, "hours").hours, 9);
  const row = calculateAttendance(
    {
      date: "2026-10-31",
      clock_in: start.toISO(),
      clock_out: end.toISO(),
      breaks: [
        {
          started_at: start.plus({ hours: 2 }).toISO(),
          ended_at: start.plus({ hours: 2, minutes: 30 }).toISO(),
        },
      ],
    },
    schedule,
  );
  assert.equal(row.work_minutes, 510);
  assert.equal(row.overtime_minutes, 30);
  assert.equal(row.late_minutes, 0);
  assert.equal(row.early_minutes, 0);
  const spring = shiftBounds("2026-03-07", schedule);
  assert.equal(spring.end.diff(spring.start, "hours").hours, 7);
  assert.throws(
    () =>
      calculateAttendance(
        { date: "2026-10-31", clock_in: end.toISO(), clock_out: start.toISO() },
        schedule,
      ),
    /Clock-out/,
  );
});
test(
  "PostgreSQL workforce HTTP workflows and security",
  { skip: !enabled ? "RUN_DATABASE_TESTS=1 required" : false },
  async (t) => {
    const f = await workforceFixture();
    try {
      const admin = await f.login(),
        hr = await f.login("hr"),
        employee = await f.login("employee"),
        other = await f.login("employee2"),
        accountant = await f.login("accountant");
      let scheduleId: string,
        leaveTypeId: string,
        leaveId: string,
        attendanceId: string,
        inputId: string;
      await t.test(
        "policies are persisted and staff grants are enforced",
        async () => {
          await employee
            .write("post", "/api/workforce/schedules", f.schedule)
            .expect(403);
          const s = await admin
            .write("post", "/api/workforce/schedules", f.schedule)
            .expect(201);
          scheduleId = s.body.data.schedule_id;
          await admin
            .write("put", `/api/workforce/schedules/${scheduleId}`, {
              grace_minutes: 10,
            })
            .expect(200);
          const type = (
            await admin
              .write("post", "/api/workforce/leave-types", {
                name: "Annual",
                annual_entitlement: "12",
                accrual_mode: "upfront",
                approval_roles: ["hr", "administrator"],
                carry_forward_limit: "2",
              })
              .expect(201)
          ).body.data;
          leaveTypeId = type.leave_type_id;
          const me = (await employee.agent.get("/api/workforce/me").expect(200))
            .body.data;
          assert.equal(me.employee.employee_id, f.employees[0].employee_id);
          assert.equal(me.employee.basic_salary, undefined);
          assert.equal(me.schedule.grace_minutes, 10);
        },
      );
      await t.test(
        "authoritative clock timestamps, stable retries, duplicate and invalid break guards",
        async () => {
          await employee
            .write("post", "/api/workforce/clock-in", {
              clock_in: "2000-01-01T00:00:00Z",
            })
            .expect(422);
          const key = randomUUID(),
            start = Date.now(),
            r = await employee
              .write("post", "/api/workforce/clock-in", {}, key)
              .expect(200);
          assert.ok(Date.parse(r.body.data.clock_in) >= start);
          const repeat = await employee
            .write("post", "/api/workforce/clock-in", {}, key)
            .expect(200);
          assert.equal(
            repeat.body.data.attendance_id,
            r.body.data.attendance_id,
          );
          await employee.write("post", "/api/workforce/clock-in").expect(409);
          await employee.write("post", "/api/workforce/break-end").expect(409);
          await employee
            .write("post", "/api/workforce/break-start")
            .expect(200);
          await employee.write("post", "/api/workforce/clock-out").expect(409);
          await employee.write("post", "/api/workforce/break-end").expect(200);
          await employee.write("post", "/api/workforce/clock-out").expect(200);
          await employee.write("post", "/api/workforce/clock-out").expect(409);
          await other.agent
            .get(`/api/workforce/attendance/${r.body.data.attendance_id}`)
            .expect(403);
          assert.equal(
            (await other.agent.get("/api/workforce/attendance").expect(200))
              .body.meta.total,
            0,
          );
        },
      );
      await t.test(
        "leave drafts, reserved balances, overlap prevention and multi-level approval",
        async () => {
          const r = await employee
            .write("post", "/api/workforce/leave", {
              leave_type_id: leaveTypeId,
              start_date: "2026-11-23",
              end_date: "2026-11-24",
              reason: "Time off",
              status: "draft",
            })
            .expect(201);
          leaveId = r.body.data.leave_id;
          await other
            .write("post", `/api/workforce/leave/${leaveId}/submit`)
            .expect(403);
          await employee
            .write("post", `/api/workforce/leave/${leaveId}/submit`)
            .expect(200);
          await employee
            .write("post", "/api/workforce/leave", {
              leave_type_id: leaveTypeId,
              start_date: "2026-11-24",
              end_date: "2026-11-25",
              reason: "Overlap",
              status: "pending",
            })
            .expect(409);
          await employee
            .write("post", `/api/workforce/leave/${leaveId}/approve`)
            .expect(403);
          const first = await hr
            .write("post", `/api/workforce/leave/${leaveId}/approve`)
            .expect(200);
          assert.equal(first.body.data.status, "pending");
          await hr
            .write("post", `/api/workforce/leave/${leaveId}/approve`)
            .expect(403);
          const final = await admin
            .write("post", `/api/workforce/leave/${leaveId}/approve`)
            .expect(200);
          assert.equal(final.body.data.status, "approved");
          const b = (
            await employee.agent
              .get("/api/workforce/leave-balances?year=2026")
              .expect(200)
          ).body.data.find((b: any) => b.leave_type_id === leaveTypeId);
          assert.equal(b.used, "2.0000");
          assert.equal(b.pending, "0.0000");
          const records = await f.repo.query("Attendance", {
            where: {
              employee_id: f.employees[0].employee_id,
              date: { gte: "2026-11-23", lte: "2026-11-24" },
            },
          });
          assert.equal(records.rows.length, 2);
          assert.ok(records.rows.every((r) => r.status === "on_leave"));
          await employee
            .write("post", `/api/workforce/leave/${leaveId}/cancel`)
            .expect(200);
          assert.equal(
            (await f.repo.find("Leave", leaveId))!.status,
            "cancelled",
          );
        },
      );
      await t.test(
        "own approval is blocked even when an administrator submits for themselves",
        async () => {
          const a = await f.repo.find("Users", admin.user.user_id),
            linked = await f.repo.find("Users", employee.user.user_id);
          await f.repo.commit([
            { table: "Users", record: { ...linked!, employee_id: "" } },
            {
              table: "Users",
              record: { ...a!, employee_id: f.employees[0].employee_id },
            },
          ]);
          const r = await admin
            .write("post", "/api/workforce/leave", {
              employee_id: f.employees[0].employee_id,
              leave_type_id: leaveTypeId,
              start_date: "2026-11-26",
              end_date: "2026-11-26",
              reason: "Self approval check",
              status: "pending",
            })
            .expect(201);
          await admin
            .write(
              "post",
              `/api/workforce/leave/${r.body.data.leave_id}/approve`,
            )
            .expect(403);
          await admin
            .write(
              "post",
              `/api/workforce/leave/${r.body.data.leave_id}/cancel`,
            )
            .expect(200);
          await f.repo.commit([
            { table: "Users", record: { ...a!, employee_id: "" } },
            { table: "Users", record: linked! },
          ]);
        },
      );
      await t.test(
        "manual attendance, corrections and finalization require distinct authorized review",
        async () => {
          const r = await hr
            .write("post", "/api/workforce/attendance", {
              employee_id: f.employees[0].employee_id,
              date: "2026-11-10",
              clock_in: "2026-11-10T09:00:00Z",
              clock_out: "2026-11-10T18:00:00Z",
              break_minutes: 0,
              status: "present",
              reason: "Authorized historical entry",
            })
            .expect(201);
          attendanceId = r.body.data.attendance_id;
          await hr
            .write("post", `/api/workforce/attendance/${attendanceId}/approve`)
            .expect(403);
          await admin
            .write("post", `/api/workforce/attendance/${attendanceId}/finalize`)
            .expect(409);
          await admin
            .write("post", `/api/workforce/attendance/${attendanceId}/approve`)
            .expect(200);
          await admin
            .write("post", `/api/workforce/attendance/${attendanceId}/finalize`)
            .expect(200);
          const correction = await employee
            .write("post", "/api/workforce/corrections", {
              attendance_id: attendanceId,
              clock_in: "2026-11-10T09:00:00Z",
              clock_out: "2026-11-10T19:00:00Z",
              break_minutes: 0,
              reason: "Approved overtime was missing",
            })
            .expect(201);
          await other
            .write("post", "/api/workforce/corrections", {
              attendance_id: attendanceId,
              reason: "Not mine",
            })
            .expect(403);
          await admin
            .write(
              "post",
              `/api/workforce/corrections/${correction.body.data.correction_id}/approve`,
            )
            .expect(200);
          await admin
            .write("post", `/api/workforce/attendance/${attendanceId}/finalize`)
            .expect(200);
        },
      );
      await t.test(
        "payroll includes approved attendance input once and preserves calculation snapshots",
        async () => {
          await employee
            .write("post", "/api/workforce/payroll-inputs", {
              employee_id: f.employees[0].employee_id,
              payroll_month: "2026-11",
              type: "overtime",
              attendance_ids: [attendanceId],
              reason: "Approved overtime",
            })
            .expect(403);
          const input = (
            await accountant
              .write("post", "/api/workforce/payroll-inputs", {
                employee_id: f.employees[0].employee_id,
                payroll_month: "2026-11",
                type: "overtime",
                attendance_ids: [attendanceId],
                reason: "Approved overtime",
              })
              .expect(201)
          ).body.data;
          inputId = input.input_id;
          assert.equal(input.amount, "38.75");
          await accountant
            .write("post", `/api/workforce/payroll-inputs/${inputId}/approve`)
            .expect(403);
          await admin
            .write("post", `/api/workforce/payroll-inputs/${inputId}/approve`)
            .expect(200);
          await admin
            .write("post", `/api/workforce/payroll-inputs/${inputId}/approve`)
            .expect(409);
          await accountant
            .write("post", "/api/workforce/payroll-inputs", {
              employee_id: f.employees[0].employee_id,
              payroll_month: "2026-11",
              type: "overtime",
              attendance_ids: [attendanceId],
              reason: "Duplicate",
            })
            .expect(409);
          const preview = await admin
            .write("post", "/api/payroll/preview", { payroll_month: "2026-11" })
            .expect(200);
          const rows = preview.body.data.rows;
          const row = rows.find(
            (r: any) => r.employee_id === f.employees[0].employee_id,
          );
          assert.equal(row.bonuses, "38.75");
          assert.equal(row.attendance_inputs.length, 1);
          const run = (
            await admin
              .write("post", "/api/payroll/generate", {
                payroll_month: "2026-11",
              })
              .expect(201)
          ).body.data;
          const runId = run.payroll_run_id || run.run?.payroll_run_id;
          assert.ok(runId);
          await admin.write("post", `/api/payroll/${runId}/submit`).expect(200);
          await admin
            .write("post", `/api/payroll/${runId}/approve`, { reviewed: true })
            .expect(200);
          await admin
            .write("post", `/api/payroll/${runId}/finalize`)
            .expect(200);
          const saved = await f.repo.query("Payroll", {
            where: {
              employee_id: f.employees[0].employee_id,
              payroll_month: "2026-11",
            },
          });
          const snapshot = saved.rows[0].snapshot_json;
          const e = await f.repo.find("Employees", f.employees[0].employee_id);
          await f.repo.commit([
            { table: "Employees", record: { ...e!, basic_salary: "9999.00" } },
          ]);
          assert.equal(
            (await f.repo.find("Payroll", saved.rows[0].payroll_id))!
              .snapshot_json,
            snapshot,
          );
        },
      );
      await t.test(
        "exports enforce grants and produce real CSV, Excel and PDF content",
        async () => {
          await employee.agent
            .get("/api/workforce/reports/attendance?format=csv")
            .expect(403);
          for (const format of ["csv", "xlsx", "pdf"]) {
            const result = await hr.agent
              .get(
                `/api/workforce/reports/attendance?format=${format}&date_from=2026-11-01&date_to=2026-11-30`,
              )
              .expect(200);
            assert.match(
              result.headers["content-disposition"],
              new RegExp(`\\.${format}`),
            );
            assert.ok(result.body?.length || result.text?.length);
          }
          const dash = (
            await hr.agent
              .get(
                "/api/workforce/dashboard?date_from=2026-11-01&date_to=2026-11-30",
              )
              .expect(200)
          ).body.data;
          assert.ok(Number(dash.metrics.work_minutes) > 0);
          assert.ok(dash.trends.length);
        },
      );
      await t.test(
        "file uploads reject executable content and enforce private employee download",
        async () => {
          const headers = {
            "x-csrf-token": employee.csrf,
            "Idempotency-Key": randomUUID(),
          };
          await employee.agent
            .post("/api/workforce/leave-attachments")
            .set(headers)
            .attach("file", Buffer.from("MZ executable"), {
              filename: "fake.pdf",
              contentType: "application/pdf",
            })
            .expect(422);
          const pdf = Buffer.from(
            "%PDF-1.4\n1 0 obj\n<< /Type /Catalog >>\nendobj\n%%EOF",
          );
          const uploaded = await employee.agent
            .post("/api/workforce/leave-attachments")
            .set({ ...headers, "Idempotency-Key": randomUUID() })
            .attach("file", pdf, {
              filename: "support.pdf",
              contentType: "application/pdf",
            })
            .expect(201);
          assert.equal(uploaded.body.data.storage_key, undefined);
          const id = uploaded.body.data.attachment_id;
          await other.agent
            .get(`/api/workforce/leave-attachments/${id}/download`)
            .expect(403);
          await employee.agent
            .get(`/api/workforce/leave-attachments/${id}/download`)
            .expect(200);
        },
      );
      await t.test(
        "monthly accrual, entitlement overrides and capped carry-forward remain decimal safe",
        async () => {
          const type = {
            leave_type_id: randomUUID(),
            name: "Accrued",
            annual_entitlement: "12.00",
            accrual_mode: "monthly",
            carry_forward_limit: "2.00",
            approval_roles: ["hr"],
            status: "active",
          };
          await f.repo.commit([{ table: "Leave_Types", record: type }]);
          const b = await balance(
            new RequestData(f.repo),
            f.employees[0],
            type,
            2026,
            "",
            "2026-03-01",
          );
          assert.equal(b.accrued, "3.0000");
          assert.equal(b.carried, "2.0000");
          assert.equal(b.available, "5.0000");
        },
      );
    } finally {
      await f.close();
    }
  },
);

test("fixed scheduled breaks survive repeated running attendance calculations", () => {
  const policy = {
    timezone: "UTC",
    expected_start: "09:00",
    expected_end: "17:30",
    break_minutes: 30,
    track_breaks: false,
    overtime_enabled: true,
    overtime_after_minutes: 480,
  };
  const started = calculateAttendance(
    { date: "2026-11-10", clock_in: "2026-11-10T09:00:00Z" },
    policy,
    "2026-11-10T09:00:00Z",
  );
  assert.equal(started.break_minutes, 0);
  const ended = calculateAttendance(
    { ...started, clock_out: "2026-11-10T17:30:00Z" },
    policy,
  );
  assert.equal(ended.break_minutes, 30);
  assert.equal(ended.work_minutes, 480);
  assert.equal(ended.overtime_minutes, 0);
});
test(
  "source corrections, unpaid leave, salary baselines and scheduled termination regressions",
  { skip: !enabled ? "RUN_DATABASE_TESTS=1 required" : false },
  async (t) => {
    const f = await workforceFixture();
    try {
      const admin = await f.login(),
        hr = await f.login("hr"),
        employee = await f.login("employee");
      await admin
        .write("post", "/api/workforce/schedules", f.schedule)
        .expect(201);
      const e = f.employees[0];
      await f.repo.commit([
        {
          table: "Employees",
          record: {
            ...e,
            basic_salary: "6200.00",
            employment_status: "terminated",
            employment_end_date: "2027-12-31",
          },
        },
        {
          table: "Salary_History",
          record: {
            salary_history_id: randomUUID(),
            employee_id: e.employee_id,
            basic_salary: "6200.00",
            previous_amount: "3100.00",
            previous_payment_frequency: "monthly",
            payment_frequency: "monthly",
            effective_date: "2026-12-01",
            reason: "Future salary change",
          },
        },
      ]);
      await employee.agent.get("/api/auth/me").expect(200);
      const attendance = (
        await hr
          .write("post", "/api/workforce/attendance", {
            employee_id: e.employee_id,
            date: "2026-10-10",
            clock_in: "2026-10-10T09:00:00Z",
            clock_out: "2026-10-10T19:00:00Z",
            break_minutes: 0,
            status: "present",
            reason: "Historical overtime",
          })
          .expect(201)
      ).body.data;
      await admin
        .write(
          "post",
          `/api/workforce/attendance/${attendance.attendance_id}/approve`,
        )
        .expect(200);
      await admin
        .write(
          "post",
          `/api/workforce/attendance/${attendance.attendance_id}/finalize`,
        )
        .expect(200);
      const input = (
        await admin
          .write("post", "/api/workforce/payroll-inputs", {
            employee_id: e.employee_id,
            payroll_month: "2026-10",
            type: "overtime",
            attendance_ids: [attendance.attendance_id],
            reason: "Historical rate",
          })
          .expect(201)
      ).body.data;
      assert.equal(input.amount, "37.50");
      await admin
        .write(
          "post",
          `/api/workforce/payroll-inputs/${input.input_id}/approve`,
        )
        .expect(200);
      const type = (
        await admin
          .write("post", "/api/workforce/leave-types", {
            name: "Authorized unpaid leave",
            paid: false,
            annual_entitlement: "30",
            approval_roles: ["hr"],
          })
          .expect(201)
      ).body.data;
      const leave = (
        await employee
          .write("post", "/api/workforce/leave", {
            leave_type_id: type.leave_type_id,
            start_date: "2026-10-15",
            end_date: "2026-10-15",
            reason: "Unpaid time",
            status: "pending",
          })
          .expect(201)
      ).body.data;
      await hr
        .write("post", `/api/workforce/leave/${leave.leave_id}/approve`)
        .expect(200);
      const onLeave = (
        await f.repo.query("Attendance", {
          where: { employee_id: e.employee_id, date: "2026-10-15" },
        })
      ).rows[0];
      await admin
        .write(
          "post",
          `/api/workforce/attendance/${onLeave.attendance_id}/finalize`,
        )
        .expect(200);
      const deduction = (
        await admin
          .write("post", "/api/workforce/payroll-inputs", {
            employee_id: e.employee_id,
            payroll_month: "2026-10",
            type: "unpaid_absence",
            attendance_ids: [onLeave.attendance_id],
            reason: "Approved unpaid policy",
          })
          .expect(201)
      ).body.data;
      assert.equal(deduction.amount, "100.00");
      await admin
        .write(
          "post",
          `/api/workforce/payroll-inputs/${deduction.input_id}/approve`,
        )
        .expect(200);
      const run = (
        await admin
          .write("post", "/api/payroll/generate", { payroll_month: "2026-10" })
          .expect(201)
      ).body.data;
      const id = run.run.payroll_run_id;
      await admin.write("post", `/api/payroll/${id}/submit`).expect(200);
      await admin
        .write("post", `/api/payroll/${id}/approve`, { reviewed: true })
        .expect(200);
      await employee
        .write("post", "/api/workforce/corrections", {
          attendance_id: attendance.attendance_id,
          clock_in: "2026-09-10T09:00:00Z",
          clock_out: "2026-09-10T17:00:00Z",
          break_minutes: 0,
          reason: "Wrong month",
        })
        .expect(422);
      const correction = (
        await employee
          .write("post", "/api/workforce/corrections", {
            attendance_id: attendance.attendance_id,
            clock_in: "2026-10-10T09:00:00Z",
            clock_out: "2026-10-10T17:00:00Z",
            break_minutes: 0,
            reason: "Remove erroneous overtime",
          })
          .expect(201)
      ).body.data;
      await admin
        .write(
          "post",
          `/api/workforce/corrections/${correction.correction_id}/approve`,
        )
        .expect(200);
      await admin
        .write(
          "post",
          `/api/workforce/attendance/${attendance.attendance_id}/finalize`,
        )
        .expect(200);
      const stale = await admin
        .write("post", `/api/payroll/${id}/finalize`)
        .expect(409);
      assert.equal(stale.body.error.code, "ATTENDANCE_INPUT_STALE");
      await admin
        .write(
          "post",
          `/api/workforce/payroll-inputs/${input.input_id}/revoke`,
          { comments: "Corrected overtime source" },
        )
        .expect(200);
      assert.equal((await f.repo.find("Payroll_Runs", id))!.status, "rejected");
      await admin.write("post", `/api/payroll/${id}/revise`).expect(200);
      await admin.write("post", `/api/payroll/${id}/submit`).expect(200);
      await admin
        .write("post", `/api/payroll/${id}/approve`, { reviewed: true })
        .expect(200);
      await admin.write("post", `/api/payroll/${id}/finalize`).expect(200);
      const rows = await f.repo.query("Payroll", {
        where: { employee_id: e.employee_id, payroll_month: "2026-10" },
      });
      const final = rows.rows.find((r) => r.status === "finalized")!;
      assert.equal(final.bonuses, "0.00");
      assert.equal(final.penalties, "100.00");
      await admin
        .write(
          "post",
          `/api/workforce/payroll-inputs/${deduction.input_id}/revoke`,
        )
        .expect(409);
    } finally {
      await f.close();
    }
  },
);
