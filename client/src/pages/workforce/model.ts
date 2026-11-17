import type { Row } from "@/lib/utils";
import { today } from "@/lib/utils";
import { options, type Field } from "@/components/shared";

export const employeeField: Field = {
  name: "employee_id",
  label: "Employee",
  relation: "employees",
  required: true,
};
export const departmentField: Field = {
  name: "department_id",
  label: "Department",
  relation: "departments",
  hint: "Leave blank for the whole company.",
};
export const scheduleField: Field = {
  name: "schedule_id",
  label: "Work schedule",
  relation: "workforce/schedules",
  relationId: "schedule_id",
  relationLabel: "name",
  required: true,
};
export const leaveTypeField: Field = {
  name: "leave_type_id",
  label: "Leave type",
  relation: "workforce/leave-types",
  relationId: "leave_type_id",
  relationLabel: "name",
  required: true,
};
export const reasonField: Field = {
  name: "reason",
  label: "Reason",
  type: "textarea",
  wide: true,
  required: true,
};
export const commentsField: Field = {
  name: "comments",
  label: "Decision comments",
  type: "textarea",
  wide: true,
  required: true,
};
const integer = (
  name: string,
  label: string,
  value = "0",
  min = 0,
  max = 1440,
): Field => ({
  name,
  label,
  type: "number",
  required: true,
  default: value,
  min,
  max,
});
const decimal = (name: string, label: string, value = "0"): Field => ({
  name,
  label,
  type: "money",
  required: true,
  default: value,
});
const checkbox = (name: string, label: string, hint: string): Field => ({
  name,
  label,
  type: "checkbox",
  default: false,
  hint,
  wide: true,
});
export const scheduleFields: Field[] = [
  {
    name: "name",
    label: "Schedule name",
    required: true,
    section: "Working pattern",
  },
  departmentField,
  {
    ...checkbox(
      "is_default",
      "Default schedule for department",
      "Turn off for a shift that is assigned individually. Only one active default is allowed for each department or the whole company.",
    ),
    default: true,
  },
  {
    name: "timezone",
    label: "Schedule timezone",
    required: true,
    default: "UTC",
    hint: "Use an IANA timezone such as America/New_York. The server applies daylight saving rules.",
  },
  {
    name: "work_days",
    label: "Working days",
    type: "multi-select",
    required: true,
    wide: true,
    options: [
      "Sunday",
      "Monday",
      "Tuesday",
      "Wednesday",
      "Thursday",
      "Friday",
      "Saturday",
    ].map((label, i) => ({ label, value: String(i) })),
    default: ["1", "2", "3", "4", "5"],
  },
  {
    name: "expected_start",
    label: "Shift starts",
    type: "time",
    required: true,
    default: "09:00",
  },
  {
    name: "expected_end",
    label: "Shift ends",
    type: "time",
    required: true,
    default: "17:00",
    hint: "An end time before the start time means an overnight shift.",
  },
  integer("grace_minutes", "Arrival grace (minutes)"),
  integer("break_minutes", "Scheduled break (minutes)"),
  checkbox(
    "track_breaks",
    "Track breaks",
    "Allow employees to record break start and end times.",
  ),
  {
    ...integer("half_day_minutes", "Half-day threshold (minutes)", "240"),
    section: "Attendance policy",
  },
  checkbox(
    "overtime_enabled",
    "Overtime policy enabled",
    "Enable eligible overtime calculations. Payroll still requires a finalized record and approval.",
  ),
  integer("overtime_after_minutes", "Overtime threshold (minutes)", "480"),
  {
    ...decimal("overtime_multiplier", "Overtime rate multiplier", "1.00"),
    decimalPlaces: 6,
  },
  checkbox(
    "attendance_bonus_enabled",
    "Attendance bonus policy enabled",
    "Allow attendance-related bonus proposals. The amount and approval remain explicit.",
  ),
  checkbox(
    "unpaid_absence_enabled",
    "Unpaid absence policy enabled",
    "Allow absence deductions to be proposed for approval. Nothing is deducted automatically.",
  ),
];
export const assignmentFields: Field[] = [
  employeeField,
  scheduleField,
  {
    name: "start_date",
    label: "Effective from",
    type: "date",
    required: true,
    default: today(),
  },
  {
    name: "end_date",
    label: "Effective until",
    type: "date",
    hint: "Leave blank for an ongoing assignment.",
  },
];
export const holidayFields: Field[] = [
  { name: "name", label: "Holiday name", required: true },
  { name: "date", label: "Date", type: "date", required: true },
  departmentField,
];
export const policyFields: Field[] = [
  {
    name: "name",
    label: "Leave type name",
    required: true,
    section: "Leave entitlement",
  },
  checkbox("paid", "Paid leave", "This category is paid leave."),
  decimal("annual_entitlement", "Annual entitlement (days)"),
  {
    name: "accrual_mode",
    label: "Accrual method",
    type: "select",
    required: true,
    options: options(["upfront", "monthly"]),
    default: "upfront",
  },
  decimal("carry_forward_limit", "Carry-forward limit (days)"),
  {
    name: "carry_expiry_month",
    label: "Carry-forward expiry month",
    type: "select",
    options: Array.from({ length: 12 }, (_, i) => ({
      value: String(i + 1),
      label: new Intl.DateTimeFormat("en", {
        month: "long",
        timeZone: "UTC",
      }).format(new Date(Date.UTC(2024, i, 1))),
    })),
    hint: "Leave blank if carried leave does not expire during the year.",
  },
  {
    name: "approval_roles",
    label: "Approval stages in order: HR, then administrator",
    type: "multi-select",
    options: options(["hr", "administrator"]),
    default: ["hr"],
    required: true,
    wide: true,
    section: "Approval policy",
  },
  checkbox(
    "allow_self_approval",
    "Allow self-approval",
    "Explicitly permit an authorized approver to approve their own request under this policy.",
  ),
  checkbox(
    "requires_document",
    "Supporting document required",
    "Require a PDF, PNG, or JPEG supporting document for requests.",
  ),
];
export const entitlementFields: Field[] = [
  employeeField,
  leaveTypeField,
  integer("year", "Year", String(new Date().getFullYear()), 2000, 2200),
  decimal("days", "Entitlement (days)"),
  reasonField,
];
export const attendanceFields: Field[] = [
  employeeField,
  {
    name: "date",
    label: "Attendance date",
    type: "date",
    required: true,
    default: today(),
  },
  {
    name: "clock_in",
    label: "Clock in (UTC)",
    type: "datetime-local",
    hint: "Enter UTC date and time, including the next date for an overnight shift.",
  },
  { name: "clock_out", label: "Clock out (UTC)", type: "datetime-local" },
  integer("break_minutes", "Break duration (minutes)"),
  {
    name: "status",
    label: "Attendance status",
    type: "select",
    required: true,
    default: "present",
    options: options([
      "present",
      "absent",
      "late",
      "half_day",
      "on_leave",
      "holiday",
      "rest_day",
    ]),
  },
  reasonField,
];
export const correctionFields: Field[] = attendanceFields
  .filter((f) =>
    ["clock_in", "clock_out", "break_minutes", "reason"].includes(f.name),
  )
  .map((f) => ({ ...f, required: true }));
export function utcInput(value: unknown) {
  if (!value) return "";
  const date = new Date(String(value));
  return Number.isNaN(date.getTime()) ? "" : date.toISOString().slice(0, 16);
}
export function duration(value: unknown) {
  if (value === undefined || value === null || value === "") return "—";
  const minutes = Number(value);
  if (!Number.isFinite(minutes)) return "—";
  return `${Math.floor(minutes / 60)}h ${Math.round(minutes % 60)}m`;
}
export function dateRange() {
  const now = today();
  return { date_from: now.slice(0, 8) + "01", date_to: now };
}
export function policyPayload(values: Row) {
  const result = { ...values };
  [
    "grace_minutes",
    "break_minutes",
    "overtime_after_minutes",
    "half_day_minutes",
    "year",
  ].forEach((k) => {
    if (k in result) result[k] = Number(result[k]);
  });
  if ("work_days" in result) result.work_days = result.work_days.map(Number);
  if ("approval_roles" in result)
    result.approval_roles = ["hr", "administrator"].filter((role) =>
      result.approval_roles.includes(role),
    );
  if ("carry_expiry_month" in result)
    result.carry_expiry_month = result.carry_expiry_month
      ? Number(result.carry_expiry_month)
      : null;
  ["department_id", "end_date"].forEach((k) => {
    if (result[k] === "") delete result[k];
  });
  return result;
}
export function attendancePayload(values: Row) {
  const result: Row = {
    ...values,
    break_minutes: Number(values.break_minutes || 0),
  };
  for (const key of ["clock_in", "clock_out"]) {
    if (values[key]) result[key] = new Date(values[key] + "Z").toISOString();
    else delete result[key];
  }
  return result;
}
export function activeBreak(attendance?: Row | null) {
  return (Array.isArray(attendance?.breaks) ? attendance.breaks : []).some(
    (b: Row) => !b.end && !b.ended_at && !b.end_at,
  );
}
export function clockState(attendance?: Row | null) {
  if (!attendance?.clock_in) return "not_started";
  if (attendance.clock_out) return "complete";
  return activeBreak(attendance) ? "on_break" : "working";
}
export const privateFileTypes = ["application/pdf", "image/png", "image/jpeg"];
export function validateAttachment(file: File) {
  if (!privateFileTypes.includes(file.type))
    return "Choose a PDF, PNG, or JPEG file.";
  if (file.size > 5 * 1024 * 1024) return "The file must be 5 MB or smaller.";
  if (file.size === 0) return "Choose a non-empty file.";
  return null;
}

export function payrollCycleDates(month: string, settings: Row) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) return null;
  const [year, monthNumber] = month.split("-").map(Number);
  const startDay = Number(settings.payroll_start_day || 1);
  const endDay = Number(settings.payroll_end_day || 31);
  const startMonth = monthNumber - 1 - (startDay > endDay ? 1 : 0);
  const clamp = (m: number, day: number) =>
    new Date(
      Date.UTC(
        year,
        m,
        Math.min(day, new Date(Date.UTC(year, m + 1, 0)).getUTCDate()),
      ),
    )
      .toISOString()
      .slice(0, 10);
  return {
    date_from: clamp(startMonth, startDay),
    date_to: clamp(monthNumber - 1, endDay),
  };
}
