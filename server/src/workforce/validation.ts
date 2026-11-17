import { z } from "zod";
import { DateTime } from "luxon";
const text = z.string().trim().min(1).max(2000);
export const day = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => DateTime.fromISO(v).isValid, "Use a valid calendar date");
const time = z.string().regex(/^(?:[01]\d|2[0-3]):[0-5]\d$/);
export const timestamp = z.string().datetime({ offset: true });
export const optionalTimestamp = z.union([timestamp, z.literal("")]).optional();
const id = z.string().min(1).max(100);
const optionalId = z.union([id, z.literal("")]).optional();
const number = z.coerce.number().finite();
const minutes = number.int().min(0).max(1440);
const decimal = z
  .union([z.string(), z.number()])
  .transform(String)
  .refine(
    (v) => /^\d+(?:\.\d{1,6})?$/.test(v) && Number(v) <= 10000000,
    "Enter a nonnegative decimal",
  );
const daysDecimal = decimal.refine(
  (v) => /^\d+(?:\.\d{1,2})?$/.test(v),
  "Use at most two decimal places for leave days",
);
export const status = z.enum([
  "present",
  "absent",
  "late",
  "half_day",
  "on_leave",
  "holiday",
  "rest_day",
  "pending_correction",
]);
export const scheduleSchema = z
  .object({
    name: text,
    is_default: z.boolean().default(true),
    timezone: z
      .string()
      .refine(
        (v) => DateTime.now().setZone(v).isValid,
        "Invalid IANA timezone",
      ),
    work_days: z
      .array(number.int().min(0).max(6))
      .min(1)
      .max(7)
      .refine(
        (v) => new Set(v).size === v.length,
        "Working days must be unique",
      ),
    expected_start: time,
    expected_end: time,
    grace_minutes: minutes.default(0),
    break_minutes: minutes.default(0),
    track_breaks: z.boolean().default(false),
    overtime_enabled: z.boolean().default(false),
    overtime_after_minutes: minutes.default(480),
    overtime_multiplier: decimal.default("1.5"),
    unpaid_absence_enabled: z.boolean().default(false),
    attendance_bonus_enabled: z.boolean().default(false),
    half_day_minutes: minutes.default(240),
    department_id: optionalId,
    status: z.enum(["active", "inactive"]).default("active"),
  })
  .strict();
export const assignmentSchema = z
  .object({
    employee_id: id,
    schedule_id: id,
    start_date: day,
    end_date: z.union([day, z.literal("")]).optional(),
  })
  .strict()
  .refine(
    (v) => !v.end_date || v.end_date >= v.start_date,
    "End date cannot precede start date",
  );
export const holidaySchema = z
  .object({ name: text, date: day, department_id: optionalId })
  .strict();
export const manualSchema = z
  .object({
    employee_id: id,
    date: day,
    clock_in: optionalTimestamp,
    clock_out: optionalTimestamp,
    break_minutes: minutes.default(0),
    status,
    reason: text,
  })
  .strict();
export const correctionSchema = z
  .object({
    attendance_id: id,
    clock_in: optionalTimestamp,
    clock_out: optionalTimestamp,
    break_minutes: minutes.default(0),
    reason: text,
  })
  .strict();
export const decisionSchema = z
  .object({ comments: z.string().trim().max(2000).default("") })
  .strict();
export const leaveTypeSchema = z
  .object({
    name: text,
    paid: z.boolean().default(true),
    annual_entitlement: daysDecimal.default("0"),
    accrual_mode: z.enum(["upfront", "monthly"]).default("upfront"),
    carry_forward_limit: daysDecimal.default("0"),
    carry_expiry_month: z
      .union([number.int().min(1).max(12), z.null()])
      .optional(),
    approval_roles: z
      .array(z.enum(["hr", "administrator"]))
      .min(1)
      .max(5)
      .default(["hr"]),
    allow_self_approval: z.boolean().default(false),
    requires_document: z.boolean().default(false),
    status: z.enum(["active", "inactive"]).default("active"),
  })
  .strict();
export const entitlementSchema = z
  .object({
    employee_id: id,
    leave_type_id: id,
    year: number.int().min(2000).max(2200),
    days: daysDecimal,
    reason: text,
  })
  .strict();
export const leaveSchema = z
  .object({
    employee_id: optionalId,
    leave_type_id: id,
    start_date: day,
    end_date: day,
    reason: text,
    status: z.enum(["draft", "pending"]).default("draft"),
    supporting_attachment_id: optionalId,
  })
  .strict()
  .refine(
    (v) => v.end_date >= v.start_date,
    "End date cannot precede start date",
  )
  .refine(
    (v) =>
      DateTime.fromISO(v.end_date).diff(DateTime.fromISO(v.start_date), "days")
        .days <= 366,
    "Leave requests cannot exceed 367 calendar days",
  );
export const payrollInputSchema = z
  .object({
    employee_id: id,
    payroll_month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/),
    type: z.enum(["overtime", "unpaid_absence", "bonus"]),
    attendance_ids: z
      .array(id)
      .min(1)
      .max(31)
      .refine(
        (v) => new Set(v).size === v.length,
        "Attendance sources must be unique",
      ),
    reason: text,
    amount: decimal.optional(),
  })
  .strict();
export const querySchema = z
  .object({
    page: number.int().min(1).default(1),
    pageSize: number.int().min(1).max(200).default(25),
    search: z.string().max(200).optional(),
    employee_id: optionalId,
    department_id: optionalId,
    schedule_id: optionalId,
    status: z.string().max(50).optional(),
    approval_status: z.enum(["pending", "approved", "finalized"]).optional(),
    date_from: day.optional(),
    date_to: day.optional(),
    year: number.int().min(2000).max(2200).optional(),
    format: z.enum(["json", "csv", "xlsx", "pdf"]).default("json"),
  })
  .passthrough()
  .refine(
    (v) => !v.date_from || !v.date_to || v.date_to >= v.date_from,
    "Invalid date range",
  );
