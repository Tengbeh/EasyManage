import { z } from "zod";
import { Decimal } from "decimal.js";
import { PERMISSIONS } from "./permissions.js";
export const money = z
  .union([z.string(), z.number().finite()])
  .transform(String)
  .refine(
    (v) => /^\d{1,12}(\.\d{1,2})?$/.test(v),
    "Use a non-negative amount with at most two decimal places",
  )
  .transform((v) => new Decimal(v).toFixed(2));
export const positiveMoney = money.refine(
  (v) => new Decimal(v).gt(0),
  "Amount must be greater than zero",
);
export const date = z
  .string()
  .regex(/^\d{4}-\d{2}-\d{2}$/)
  .refine((v) => {
    const d = new Date(`${v}T00:00:00Z`);
    return !isNaN(d.valueOf()) && d.toISOString().slice(0, 10) === v;
  }, "Use a valid date");
export const month = z
  .string()
  .regex(/^(19|[2-9]\d)\d{2}-(0[1-9]|1[0-2])$/, "Use YYYY-MM");
const text = z.string().trim().max(2000);
const short = z.string().trim().max(200);
const required = short.min(1);
const id = z.string().uuid();
const optionalDate = z.union([date, z.literal("")]).optional();
const optionalEmail = z
  .union([z.string().email().max(254), z.literal("")])
  .optional();
const url = z
  .union([
    z
      .string()
      .url()
      .max(2000)
      .refine((v) => v.startsWith("https://"), "Use an HTTPS URL"),
    z.literal(""),
  ])
  .optional();
export const frequency = z.enum(["monthly", "weekly", "daily", "custom"]);
export const employmentStatus = z.enum([
  "active",
  "inactive",
  "on_leave",
  "terminated",
  "archived",
]);
export const employeeSchema = z
  .object({
    employee_number: required,
    first_name: required,
    last_name: required,
    email: z.string().trim().email().toLowerCase(),
    phone: short.optional(),
    address: text.optional(),
    gender: short.optional(),
    date_of_birth: optionalDate,
    department_id: id,
    position: required,
    employment_type: z.enum(["full_time", "part_time", "contract", "intern"]),
    hire_date: date,
    employment_end_date: optionalDate,
    basic_salary: money,
    allowances: z.union([money, z.literal("")]).optional(),
    payment_frequency: frequency,
    bank_name: short.optional(),
    account_number: short.optional(),
    emergency_contact: text.optional(),
    employment_status: employmentStatus,
    profile_image: url,
    notes: text.optional(),
  })
  .strict();
export const departmentSchema = z
  .object({
    department_name: required,
    description: text.optional(),
    department_head: short.optional(),
    status: z.enum(["active", "inactive"]).default("active"),
  })
  .strict();
export const bonusSchema = z
  .object({
    employee_id: id,
    bonus_type: z.enum([
      "performance",
      "productivity",
      "attendance",
      "holiday",
      "recognition",
      "other",
    ]),
    description: text.optional(),
    amount: positiveMoney,
    effective_month: month,
  })
  .strict();
export const penaltySchema = z
  .object({
    employee_id: id,
    penalty_type: z.enum([
      "unpaid_absence",
      "disciplinary",
      "late_attendance",
      "other",
    ]),
    description: text.min(1),
    amount: positiveMoney,
    effective_month: month,
  })
  .strict();
export const loanSchema = z
  .object({
    employee_id: id,
    loan_amount: positiveMoney,
    installment_amount: positiveMoney,
    installment_frequency: z.enum(["monthly", "weekly"]),
    start_date: date,
    description: text.optional(),
  })
  .strict();
export const attendanceSchema = z
  .object({
    employee_id: id,
    date,
    check_in: z
      .union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal("")])
      .optional(),
    check_out: z
      .union([z.string().regex(/^([01]\d|2[0-3]):[0-5]\d$/), z.literal("")])
      .optional(),
    attendance_status: z.enum(["present", "absent", "late", "on_leave"]),
    notes: text.optional(),
  })
  .strict();
export const leaveSchema = z
  .object({
    employee_id: id,
    leave_type: z.enum(["annual", "sick", "unpaid", "other"]),
    start_date: date,
    end_date: date,
    reason: text.min(1),
  })
  .strict();
export const userSchema = z
  .object({
    full_name: required,
    email: z.string().trim().email().toLowerCase(),
    role: z.enum(["administrator", "hr", "accountant"]),
    department: short.optional(),
    status: z.enum(["active", "inactive"]).default("active"),
    permissions: z
      .array(z.enum(PERMISSIONS))
      .max(PERMISSIONS.length)
      .default([]),
  })
  .strict();
const percent = money.refine(
  (v) => new Decimal(v).lte(100),
  "Percentage cannot exceed 100",
);
export const settingsSchema = z
  .object({
    company_name: required,
    company_logo: url,
    company_email: optionalEmail,
    company_phone: short.optional(),
    company_address: text.optional(),
    currency: z.string().regex(/^[A-Z]{3}$/),
    date_format: z.enum(["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"]),
    timezone: z.string().refine((v) => {
      try {
        new Intl.DateTimeFormat("en", { timeZone: v });
        return true;
      } catch {
        return false;
      }
    }, "Unknown timezone"),
    payroll_start_day: z.coerce.number().int().min(1).max(31),
    payroll_end_day: z.coerce.number().int().min(1).max(31),
    default_payment_frequency: frequency,
    configured_deductions: z
      .object({
        tax_percent: percent.default("0.00"),
        other_deductions: money.default("0.00"),
        allowances: money.default("0.00"),
        deduction_limit_percent: percent.default("100.00"),
        frequency_days: z
          .record(z.string(), z.coerce.number().int().min(1).max(366))
          .optional(),
      })
      .strict(),
  })
  .strict();
export const salarySchema = z
  .object({
    basic_salary: money,
    allowances: z.union([money, z.literal("")]).default(""),
    payment_frequency: frequency,
    effective_date: date,
    reason: text.min(1),
  })
  .strict();
export const statusSchema = z
  .object({
    employment_status: employmentStatus,
    employment_end_date: optionalDate,
  })
  .strict();
export const paymentSchema = z
  .object({ installment_id: id, amount: positiveMoney, payment_date: date })
  .strict();
export const payrollMonthSchema = z.object({ payroll_month: month }).strict();
export const adjustmentSchema = z
  .object({
    employee_id: id,
    allowances: money,
    other_deductions: money,
    tax_deductions: money,
    reason: text.min(1),
  })
  .strict();
export const approvalSchema = z
  .object({ reviewed: z.boolean().optional(), reason: text.optional() })
  .strict();
export const rejectionSchema = z.object({ reason: text.min(1) }).strict();
export const querySchema = z
  .object({
    search: z.string().max(200).optional(),
    page: z.coerce.number().int().min(1).default(1),
    pageSize: z.coerce.number().int().min(1).max(200).default(25),
    department_id: id.optional(),
    employment_status: employmentStatus.optional(),
    employment_type: z
      .enum(["full_time", "part_time", "contract", "intern"])
      .optional(),
    employee_id: id.optional(),
    month: z
      .string()
      .regex(/^(\d{4}-(0[1-9]|1[0-2])|0?[1-9]|1[0-2])$/)
      .optional(),
    year: z.coerce.number().int().min(1900).max(9999).optional(),
    status: short.optional(),
    sort: z
      .string()
      .regex(/^[a-z_]+$/)
      .optional(),
    direction: z.enum(["asc", "desc"]).default("desc"),
    format: z.enum(["json", "csv", "xlsx", "pdf"]).optional(),
  })
  .strict();
