import { employmentStatusAt } from "../services/employment.js";
import { DateTime } from "luxon";
import { Decimal } from "decimal.js";
import type { Row } from "../repository.js";
import { assert } from "../errors.js";
import { parseJSON } from "../permissions.js";
export const array = <T = Row>(value: unknown): T[] =>
  parseJSON<T[]>(value, []);
export function shiftBounds(date: string, schedule: Row) {
  const zone = schedule.timezone || "UTC";
  let start = DateTime.fromISO(`${date}T${schedule.expected_start}`, { zone });
  let end = DateTime.fromISO(`${date}T${schedule.expected_end}`, { zone });
  assert(
    start.isValid && end.isValid,
    422,
    "INVALID_SHIFT",
    "The shift date or timezone is invalid.",
  );
  // Use actual elapsed UTC time; calendar additions preserve local wall time across DST.
  if (end.toMillis() <= start.toMillis()) end = end.plus({ days: 1 });
  return { start, end };
}
export function workingDay(
  date: string,
  schedule: Row,
  holidays: Row[],
  employee: Row,
) {
  const dt = DateTime.fromISO(date, { zone: schedule.timezone || "UTC" });
  if (
    holidays.some(
      (h) =>
        h.date === date &&
        (!h.department_id || h.department_id === employee.department_id),
    )
  )
    return "holiday";
  return array<number>(schedule.work_days).includes(dt.weekday % 7)
    ? "work_day"
    : "rest_day";
}
export function calculateAttendance(
  row: Row,
  schedule: Row,
  asOf = new Date().toISOString(),
): Row {
  const clockIn = row.clock_in || row.check_in;
  const clockOut = row.clock_out || row.check_out;
  if (!clockIn)
    return {
      ...row,
      work_minutes: 0,
      break_minutes: 0,
      overtime_minutes: 0,
      late_minutes: 0,
      early_minutes: 0,
      hours_worked: "0.00",
      overtime_hours: "0.00",
    };
  const start = DateTime.fromISO(clockIn, { setZone: true });
  const end = DateTime.fromISO(clockOut || asOf, { setZone: true });
  assert(
    start.isValid && end.isValid && end.toMillis() >= start.toMillis(),
    422,
    "INVALID_ATTENDANCE_TIME",
    "Clock-out must follow clock-in.",
  );
  const elapsed = Math.floor(end.diff(start, "minutes").minutes);
  assert(
    elapsed <= 36 * 60,
    422,
    "SHIFT_TOO_LONG",
    "An attendance record cannot exceed 36 hours. Submit an HR correction.",
  );
  const breaks = array(row.breaks);
  let breakMinutes = schedule.track_breaks
    ? breaks.reduce((s, b) => {
        const bs = DateTime.fromISO(b.started_at),
          be = DateTime.fromISO(b.ended_at || clockOut || asOf);
        assert(
          bs.isValid && be.isValid && bs >= start && be <= end && be >= bs,
          422,
          "INVALID_BREAK",
          "Breaks must be within the attendance interval.",
        );
        return s + Math.floor(be.diff(bs, "minutes").minutes);
      }, 0)
    : Math.min(elapsed, Number(schedule.break_minutes ?? 0));
  if (row.source === "manual" || row.source === "correction")
    breakMinutes = Number(row.break_minutes || 0);
  assert(
    breakMinutes <= elapsed,
    422,
    "INVALID_BREAK",
    "Break duration cannot exceed the attendance interval.",
  );
  const work = Math.max(0, elapsed - breakMinutes);
  const { start: expectedIn, end: expectedOut } = shiftBounds(
    row.date,
    schedule,
  );
  const late = Math.max(
    0,
    Math.floor(start.diff(expectedIn, "minutes").minutes) -
      Number(schedule.grace_minutes || 0),
  );
  const early = clockOut
    ? Math.max(0, Math.floor(expectedOut.diff(end, "minutes").minutes))
    : 0;
  const overtime = schedule.overtime_enabled
    ? Math.max(0, work - Number(schedule.overtime_after_minutes ?? 480))
    : 0;
  const status =
    clockOut && work < Number(schedule.half_day_minutes || 0)
      ? "half_day"
      : late > 0
        ? "late"
        : "present";
  return {
    ...row,
    clock_in: start.toUTC().toISO(),
    clock_out: clockOut ? end.toUTC().toISO() : "",
    check_in: start.toUTC().toISO(),
    check_out: clockOut ? end.toUTC().toISO() : "",
    work_minutes: work,
    break_minutes: breakMinutes,
    overtime_minutes: overtime,
    late_minutes: late,
    early_minutes: early,
    status,
    attendance_status: status,
    hours_worked: new Decimal(work).div(60).toFixed(2),
    overtime_hours: new Decimal(overtime).div(60).toFixed(2),
  };
}
export function datesBetween(start: string, end: string) {
  let d = DateTime.fromISO(start);
  const last = DateTime.fromISO(end);
  const dates: string[] = [];
  assert(
    d.isValid && last.isValid && last >= d,
    422,
    "INVALID_DATES",
    "Invalid date range.",
  );
  assert(
    last.diff(d, "days").days <= 3660,
    422,
    "RANGE_TOO_LARGE",
    "Use a date range of ten years or less.",
  );
  while (d <= last) {
    dates.push(d.toISODate()!);
    d = d.plus({ days: 1 });
  }
  return dates;
}
export function eligible(employee: Row, date: string) {
  return (
    ["active", "on_leave"].includes(employmentStatusAt(employee, date)) &&
    employee.hire_date <= date &&
    (!employee.employment_end_date || employee.employment_end_date >= date)
  );
}
export function scheduledMinutes(schedule: Row, date: string) {
  const { start, end } = shiftBounds(date, schedule);
  return Math.max(
    0,
    Math.floor(end.diff(start, "minutes").minutes) -
      Number(schedule.break_minutes || 0),
  );
}
