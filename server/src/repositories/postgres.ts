import { PrismaClient, Prisma } from "../generated/prisma/client.js";
import { PrismaPg } from "@prisma/adapter-pg";
import { Decimal } from "decimal.js";
import { AppError } from "../errors.js";
import type { Repository, Row, Change } from "../repository.js";
import { SCHEMA } from "../schema.js";

export const DEFAULT_COMPANY_ID = "00000000-0000-4000-8000-000000000001";
type FieldKind =
  | "uuid"
  | "text"
  | "money"
  | "decimal"
  | "days"
  | "int"
  | "date"
  | "timestamp"
  | "bool"
  | "json";
interface TableSpec {
  delegate: string;
  id: string;
  fields: Record<string, FieldKind>;
  required: string[];
  unique: string[][];
  references: {
    field: string;
    table: string;
    required: boolean;
    extra: string[];
  }[];
}
export interface DatabaseQuery {
  where?: Record<string, unknown>;
  orderBy?: { field: string; direction: "asc" | "desc" }[];
  skip?: number;
  take?: number;
}
export interface PostgresOptions {
  connectionString?: string;
  companyId?: string;
  client?: PrismaClient;
  transactionTimeoutMs?: number;
}
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
function companyId(value: string) {
  if (!UUID.test(value))
    throw new AppError(422, "INVALID_COMPANY_ID", "Company ID must be a UUID.");
  return value.toLowerCase();
}
export const DATABASE_TABLES: Record<string, TableSpec> = {
  Departments: {
    delegate: "department",
    id: "department_id",
    fields: {
      company_id: "uuid",
      department_id: "uuid",
      department_name: "text",
      description: "text",
      department_head: "text",
      status: "text",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    required: [],
    unique: [["department_name"]],
    references: [],
  },
  Employees: {
    delegate: "employee",
    id: "employee_id",
    fields: {
      company_id: "uuid",
      employee_id: "uuid",
      employee_number: "text",
      first_name: "text",
      last_name: "text",
      email: "text",
      phone: "text",
      address: "text",
      gender: "text",
      position: "text",
      employment_type: "text",
      employment_status: "text",
      payment_frequency: "text",
      bank_name: "text",
      account_number: "text",
      emergency_contact: "text",
      profile_image: "text",
      notes: "text",
      department_id: "uuid",
      date_of_birth: "date",
      hire_date: "date",
      employment_end_date: "date",
      basic_salary: "money",
      allowances: "money",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    required: ["department_id"],
    unique: [["employee_number"], ["email"]],
    references: [
      {
        field: "department_id",
        table: "Departments",
        required: true,
        extra: [],
      },
    ],
  },
  Users: {
    delegate: "user",
    id: "user_id",
    fields: {
      company_id: "uuid",
      user_id: "uuid",
      full_name: "text",
      email: "text",
      google_id: "text",
      profile_image: "text",
      role: "text",
      department: "text",
      status: "text",
      employee_id: "uuid",
      permissions: "json",
      last_login: "timestamp",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    required: [],
    unique: [["email"], ["google_id"], ["employee_id"]],
    references: [
      {
        field: "employee_id",
        table: "Employees",
        required: false,
        extra: [],
      },
    ],
  },
  Bonuses: {
    delegate: "bonus",
    id: "bonus_id",
    fields: {
      company_id: "uuid",
      bonus_id: "uuid",
      employee_id: "uuid",
      payroll_id: "uuid",
      bonus_type: "text",
      description: "text",
      effective_month: "text",
      status: "text",
      reason: "text",
      created_by: "text",
      approved_by: "text",
      rejection_reason: "text",
      amount: "money",
      approved_at: "timestamp",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    required: ["employee_id"],
    unique: [],
    references: [
      {
        field: "employee_id",
        table: "Employees",
        required: true,
        extra: [],
      },
      {
        field: "payroll_id",
        table: "Payroll",
        required: false,
        extra: [],
      },
    ],
  },
  Penalties: {
    delegate: "penalty",
    id: "penalty_id",
    fields: {
      company_id: "uuid",
      penalty_id: "uuid",
      employee_id: "uuid",
      payroll_id: "uuid",
      penalty_type: "text",
      description: "text",
      effective_month: "text",
      status: "text",
      reason: "text",
      created_by: "text",
      approved_by: "text",
      rejection_reason: "text",
      amount: "money",
      approved_at: "timestamp",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    required: ["employee_id"],
    unique: [],
    references: [
      {
        field: "employee_id",
        table: "Employees",
        required: true,
        extra: [],
      },
      {
        field: "payroll_id",
        table: "Payroll",
        required: false,
        extra: [],
      },
    ],
  },
  Loans: {
    delegate: "loan",
    id: "loan_id",
    fields: {
      company_id: "uuid",
      loan_id: "uuid",
      employee_id: "uuid",
      loan_amount: "money",
      outstanding_balance: "money",
      installment_amount: "money",
      installment_frequency: "text",
      description: "text",
      reason: "text",
      status: "text",
      approved_by: "text",
      created_by: "text",
      rejection_reason: "text",
      start_date: "date",
      end_date: "date",
      approved_at: "timestamp",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    required: ["employee_id"],
    unique: [["loan_id", "employee_id"]],
    references: [
      {
        field: "employee_id",
        table: "Employees",
        required: true,
        extra: [],
      },
    ],
  },
  Loan_Installments: {
    delegate: "loanInstallment",
    id: "installment_id",
    fields: {
      company_id: "uuid",
      installment_id: "uuid",
      loan_id: "uuid",
      employee_id: "uuid",
      payroll_run_id: "uuid",
      installment_amount: "money",
      amount_paid: "money",
      remaining_balance: "money",
      reserved_amount: "money",
      due_date: "date",
      payment_date: "date",
      installment_number: "int",
      status: "text",
      payroll_month: "text",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    required: ["employee_id", "loan_id"],
    unique: [
      ["loan_id", "installment_number"],
      ["installment_id", "loan_id", "employee_id"],
    ],
    references: [
      {
        field: "employee_id",
        table: "Employees",
        required: true,
        extra: [],
      },
      {
        field: "payroll_run_id",
        table: "Payroll_Runs",
        required: false,
        extra: [],
      },
      {
        field: "loan_id",
        table: "Loans",
        required: true,
        extra: ["employee_id"],
      },
    ],
  },
  Payroll_Runs: {
    delegate: "payrollRun",
    id: "payroll_run_id",
    fields: {
      company_id: "uuid",
      payroll_run_id: "uuid",
      payroll_month: "text",
      status: "text",
      generated_by: "text",
      submitted_by: "text",
      approved_by: "text",
      finalized_by: "text",
      paid_by: "text",
      reviewed_by: "text",
      rejection_reason: "text",
      source_hash: "text",
      total_employees: "int",
      revision: "int",
      total_basic_salary: "money",
      total_allowances: "money",
      total_bonuses: "money",
      total_gross_salary: "money",
      total_penalties: "money",
      total_loan_deductions: "money",
      total_deductions: "money",
      total_net_payroll: "money",
      approved_at: "timestamp",
      finalized_at: "timestamp",
      paid_at: "timestamp",
      reviewed_at: "timestamp",
      created_at: "timestamp",
      updated_at: "timestamp",
      warnings_json: "text",
    },
    required: [],
    unique: [["payroll_month"]],
    references: [],
  },
  Payroll: {
    delegate: "payrollRow",
    id: "payroll_id",
    fields: {
      company_id: "uuid",
      payroll_id: "uuid",
      employee_id: "uuid",
      payroll_run_id: "uuid",
      department_id: "uuid",
      payroll_month: "text",
      employee_name: "text",
      payment_status: "text",
      status: "text",
      snapshot_json: "text",
      basic_salary: "money",
      allowances: "money",
      bonuses: "money",
      gross_salary: "money",
      penalties: "money",
      loan_deductions: "money",
      other_deductions: "money",
      tax_deductions: "money",
      total_deductions: "money",
      net_salary: "money",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    required: ["employee_id", "payroll_run_id"],
    unique: [],
    references: [
      {
        field: "department_id",
        table: "Departments",
        required: false,
        extra: [],
      },
      {
        field: "employee_id",
        table: "Employees",
        required: true,
        extra: [],
      },
      {
        field: "payroll_run_id",
        table: "Payroll_Runs",
        required: true,
        extra: [],
      },
    ],
  },
  Attendance: {
    delegate: "attendance",
    id: "attendance_id",
    fields: {
      company_id: "uuid",
      attendance_id: "uuid",
      employee_id: "uuid",
      date: "date",
      check_in: "text",
      check_out: "text",
      attendance_status: "text",
      status: "text",
      notes: "text",
      source: "text",
      approval_status: "text",
      reason: "text",
      clock_in: "timestamp",
      clock_out: "timestamp",
      created_at: "timestamp",
      updated_at: "timestamp",
      finalized_at: "timestamp",
      approved_at: "timestamp",
      work_minutes: "int",
      break_minutes: "int",
      overtime_minutes: "int",
      late_minutes: "int",
      early_minutes: "int",
      breaks: "json",
      schedule_snapshot: "json",
    },
    required: ["employee_id"],
    unique: [
      ["employee_id", "date"],
      ["attendance_id", "employee_id"],
    ],
    references: [
      {
        field: "employee_id",
        table: "Employees",
        required: true,
        extra: [],
      },
    ],
  },
  Leave: {
    delegate: "leaveRequest",
    id: "leave_id",
    fields: {
      company_id: "uuid",
      leave_id: "uuid",
      employee_id: "uuid",
      leave_type_id: "uuid",
      supporting_attachment_id: "uuid",
      leave_type: "text",
      reason: "text",
      status: "text",
      created_by: "text",
      approved_by: "text",
      rejection_reason: "text",
      start_date: "date",
      end_date: "date",
      days: "days",
      approval_level: "int",
      approval_roles: "json",
      approved_at: "timestamp",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    required: ["employee_id"],
    unique: [["leave_id", "employee_id"]],
    references: [
      {
        field: "employee_id",
        table: "Employees",
        required: true,
        extra: [],
      },
      {
        field: "leave_type_id",
        table: "Leave_Types",
        required: false,
        extra: [],
      },
      {
        field: "supporting_attachment_id",
        table: "Leave_Attachments",
        required: false,
        extra: ["employee_id"],
      },
    ],
  },
  Company_Settings: {
    delegate: "companySettings",
    id: "setting_id",
    fields: {
      company_id: "uuid",
      setting_id: "text",
      company_name: "text",
      company_logo: "text",
      company_email: "text",
      company_phone: "text",
      company_address: "text",
      currency: "text",
      date_format: "text",
      timezone: "text",
      default_payment_frequency: "text",
      payroll_start_day: "int",
      payroll_end_day: "int",
      configured_deductions: "json",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    required: [],
    unique: [],
    references: [],
  },
  Audit_Logs: {
    delegate: "auditLog",
    id: "log_id",
    fields: {
      company_id: "uuid",
      log_id: "uuid",
      user_id: "text",
      user_email: "text",
      action: "text",
      module: "text",
      record_id: "text",
      previous_value: "text",
      new_value: "text",
      ip_address: "text",
      timestamp: "timestamp",
      created_at: "timestamp",
    },
    required: [],
    unique: [],
    references: [],
  },
  Salary_History: {
    delegate: "salaryHistory",
    id: "salary_history_id",
    fields: {
      company_id: "uuid",
      salary_history_id: "uuid",
      employee_id: "uuid",
      basic_salary: "money",
      allowances: "money",
      previous_amount: "money",
      previous_allowances: "money",
      payment_frequency: "text",
      previous_payment_frequency: "text",
      reason: "text",
      changed_by: "text",
      effective_date: "date",
      created_at: "timestamp",
    },
    required: ["employee_id"],
    unique: [["employee_id", "effective_date"]],
    references: [
      {
        field: "employee_id",
        table: "Employees",
        required: true,
        extra: [],
      },
    ],
  },
  Notifications_Read: {
    delegate: "notificationRead",
    id: "notification_read_id",
    fields: {
      company_id: "uuid",
      notification_read_id: "uuid",
      user_id: "uuid",
      notification_id: "text",
      read_at: "timestamp",
    },
    required: ["user_id"],
    unique: [["user_id", "notification_id"]],
    references: [
      {
        field: "user_id",
        table: "Users",
        required: true,
        extra: [],
      },
    ],
  },
  Idempotency: {
    delegate: "idempotencyRecord",
    id: "idempotency_id",
    fields: {
      company_id: "uuid",
      idempotency_id: "text",
      user_id: "uuid",
      request_hash: "text",
      response_json: "text",
      status_code: "int",
      created_at: "timestamp",
    },
    required: ["user_id"],
    unique: [],
    references: [
      {
        field: "user_id",
        table: "Users",
        required: true,
        extra: [],
      },
    ],
  },
  Loan_Payments: {
    delegate: "loanPayment",
    id: "payment_id",
    fields: {
      company_id: "uuid",
      payment_id: "uuid",
      loan_id: "uuid",
      installment_id: "uuid",
      employee_id: "uuid",
      payroll_id: "uuid",
      amount: "money",
      payment_date: "date",
      source: "text",
      created_by: "text",
      created_at: "timestamp",
    },
    required: ["employee_id", "loan_id", "installment_id"],
    unique: [],
    references: [
      {
        field: "employee_id",
        table: "Employees",
        required: true,
        extra: [],
      },
      {
        field: "payroll_id",
        table: "Payroll",
        required: false,
        extra: [],
      },
      {
        field: "loan_id",
        table: "Loans",
        required: true,
        extra: ["employee_id"],
      },
      {
        field: "installment_id",
        table: "Loan_Installments",
        required: true,
        extra: ["loan_id", "employee_id"],
      },
    ],
  },
  Work_Schedules: {
    delegate: "workSchedule",
    id: "schedule_id",
    fields: {
      company_id: "uuid",
      schedule_id: "uuid",
      department_id: "uuid",
      name: "text",
      timezone: "text",
      expected_start: "text",
      expected_end: "text",
      work_days: "json",
      grace_minutes: "int",
      break_minutes: "int",
      overtime_after_minutes: "int",
      half_day_minutes: "int",
      track_breaks: "bool",
      overtime_enabled: "bool",
      unpaid_absence_enabled: "bool",
      overtime_multiplier: "decimal",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    required: [],
    unique: [],
    references: [
      {
        field: "department_id",
        table: "Departments",
        required: false,
        extra: [],
      },
    ],
  },
  Shift_Assignments: {
    delegate: "shiftAssignment",
    id: "assignment_id",
    fields: {
      company_id: "uuid",
      assignment_id: "uuid",
      employee_id: "uuid",
      schedule_id: "uuid",
      start_date: "date",
      end_date: "date",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    required: ["employee_id", "schedule_id"],
    unique: [],
    references: [
      {
        field: "employee_id",
        table: "Employees",
        required: true,
        extra: [],
      },
      {
        field: "schedule_id",
        table: "Work_Schedules",
        required: true,
        extra: [],
      },
    ],
  },
  Holidays: {
    delegate: "holiday",
    id: "holiday_id",
    fields: {
      company_id: "uuid",
      holiday_id: "uuid",
      department_id: "uuid",
      date: "date",
      name: "text",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    required: [],
    unique: [],
    references: [
      {
        field: "department_id",
        table: "Departments",
        required: false,
        extra: [],
      },
    ],
  },
  Attendance_Corrections: {
    delegate: "attendanceCorrection",
    id: "correction_id",
    fields: {
      company_id: "uuid",
      correction_id: "uuid",
      attendance_id: "uuid",
      employee_id: "uuid",
      requested_by: "uuid",
      status: "text",
      reason: "text",
      comments: "text",
      clock_in: "timestamp",
      clock_out: "timestamp",
      created_at: "timestamp",
      updated_at: "timestamp",
      break_minutes: "int",
    },
    required: ["employee_id", "attendance_id", "requested_by"],
    unique: [],
    references: [
      {
        field: "employee_id",
        table: "Employees",
        required: true,
        extra: [],
      },
      {
        field: "attendance_id",
        table: "Attendance",
        required: true,
        extra: ["employee_id"],
      },
      {
        field: "requested_by",
        table: "Users",
        required: true,
        extra: [],
      },
    ],
  },
  Leave_Types: {
    delegate: "leaveType",
    id: "leave_type_id",
    fields: {
      company_id: "uuid",
      leave_type_id: "uuid",
      name: "text",
      accrual_mode: "text",
      paid: "bool",
      allow_self_approval: "bool",
      requires_document: "bool",
      annual_entitlement: "days",
      carry_forward_limit: "days",
      carry_expiry_month: "int",
      approval_roles: "json",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    required: [],
    unique: [["name"]],
    references: [],
  },
  Leave_Entitlements: {
    delegate: "leaveEntitlement",
    id: "entitlement_id",
    fields: {
      company_id: "uuid",
      entitlement_id: "uuid",
      employee_id: "uuid",
      leave_type_id: "uuid",
      year: "int",
      days: "days",
      reason: "text",
      created_at: "timestamp",
      updated_at: "timestamp",
    },
    required: ["employee_id", "leave_type_id"],
    unique: [["employee_id", "leave_type_id", "year"]],
    references: [
      {
        field: "employee_id",
        table: "Employees",
        required: true,
        extra: [],
      },
      {
        field: "leave_type_id",
        table: "Leave_Types",
        required: true,
        extra: [],
      },
    ],
  },
  Approval_Decisions: {
    delegate: "approvalDecision",
    id: "decision_id",
    fields: {
      company_id: "uuid",
      decision_id: "uuid",
      approver_id: "uuid",
      request_id: "uuid",
      request_type: "text",
      decision: "text",
      comments: "text",
      approval_level: "int",
      created_at: "timestamp",
    },
    required: ["approver_id"],
    unique: [],
    references: [
      {
        field: "approver_id",
        table: "Users",
        required: true,
        extra: [],
      },
    ],
  },
  Attendance_Payroll_Inputs: {
    delegate: "attendancePayrollInput",
    id: "input_id",
    fields: {
      company_id: "uuid",
      input_id: "uuid",
      employee_id: "uuid",
      bonus_id: "uuid",
      penalty_id: "uuid",
      payroll_month: "text",
      type: "text",
      status: "text",
      reason: "text",
      amount: "money",
      attendance_ids: "json",
      calculation: "json",
      policy_snapshot: "json",
      created_at: "timestamp",
      updated_at: "timestamp",
      approved_at: "timestamp",
    },
    required: ["employee_id"],
    unique: [],
    references: [
      {
        field: "employee_id",
        table: "Employees",
        required: true,
        extra: [],
      },
      {
        field: "bonus_id",
        table: "Bonuses",
        required: false,
        extra: [],
      },
      {
        field: "penalty_id",
        table: "Penalties",
        required: false,
        extra: [],
      },
    ],
  },
  Leave_Attachments: {
    delegate: "leaveAttachment",
    id: "attachment_id",
    fields: {
      company_id: "uuid",
      attachment_id: "uuid",
      employee_id: "uuid",
      leave_id: "uuid",
      storage_key: "text",
      content_type: "text",
      original_name: "text",
      sha256: "text",
      size: "int",
      created_at: "timestamp",
    },
    required: ["employee_id"],
    unique: [["storage_key"], ["attachment_id", "employee_id"]],
    references: [
      {
        field: "employee_id",
        table: "Employees",
        required: true,
        extra: [],
      },
      {
        field: "leave_id",
        table: "Leave",
        required: false,
        extra: ["employee_id"],
      },
    ],
  },
};

function specFor(table: string) {
  const spec = DATABASE_TABLES[table];
  if (!spec)
    throw new AppError(
      422,
      "UNKNOWN_DATABASE_TABLE",
      `Unknown database table ${table}.`,
    );
  return spec;
}
function jsonValue(value: unknown): Prisma.InputJsonValue {
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      throw new AppError(
        422,
        "INVALID_JSON_FIELD",
        "A structured database field contains invalid JSON.",
      );
    }
  }
  return JSON.parse(JSON.stringify(value));
}
function encode(kind: FieldKind, value: any, field: string): any {
  if (value === undefined || value === null || value === "")
    return kind === "json" ? Prisma.DbNull : null;
  if (kind === "uuid") {
    if (!UUID.test(String(value)))
      throw new AppError(422, "INVALID_REFERENCE", `${field} must be a UUID.`);
    return String(value).toLowerCase();
  }
  if (kind === "money" || kind === "days" || kind === "decimal") {
    const scale = kind === "decimal" ? 6 : 2;
    const max = kind === "money" ? 16 : kind === "days" ? 8 : 6;
    const s = String(value);
    if (s.startsWith("-"))
      throw new AppError(
        422,
        "NEGATIVE_DATABASE_AMOUNT",
        `${field} cannot be negative.`,
      );
    if (!new RegExp(`^-?\\d{1,${max}}(?:\\.\\d{1,${scale}})?$`).test(s))
      throw new AppError(
        422,
        "INVALID_DECIMAL",
        `${field} has unsupported decimal precision.`,
      );
    return new Decimal(s).toFixed(scale);
  }
  if (kind === "int") {
    const n = Number(value);
    if (!Number.isSafeInteger(n) || n < 0 || n > 2147483647)
      throw new AppError(
        422,
        "INVALID_INTEGER",
        `${field} must be a supported integer.`,
      );
    return n;
  }
  if (kind === "bool") {
    if (value === true || value === "true" || value === 1 || value === "1")
      return true;
    if (value === false || value === "false" || value === 0 || value === "0")
      return false;
    throw new AppError(
      422,
      "INVALID_BOOLEAN",
      `${field} must be true or false.`,
    );
  }
  if (kind === "date" || kind === "timestamp") {
    const source = String(value);
    const d = new Date(kind === "date" ? `${source}T00:00:00.000Z` : source);
    if (
      Number.isNaN(d.valueOf()) ||
      (kind === "date" &&
        (!/^\d{4}-\d{2}-\d{2}$/.test(source) ||
          d.toISOString().slice(0, 10) !== source))
    )
      throw new AppError(
        422,
        "INVALID_DATABASE_DATE",
        `${field} is not a valid ${kind}.`,
      );
    return d;
  }
  if (kind === "json") return jsonValue(value);
  if (typeof value === "object")
    throw new AppError(422, "INVALID_TEXT_FIELD", `${field} must be text.`);
  return String(value);
}
export function normalizedDatabaseRow(
  table: string,
  record: Row,
  scope = DEFAULT_COMPANY_ID,
): Row {
  const spec = specFor(table);
  const result: Row = Object.fromEntries(
    [...new Set([...(SCHEMA[table] || []), ...Object.keys(spec.fields)])].map(
      (k) => [k, ""],
    ),
  );
  for (const [key, value] of Object.entries(record)) {
    if (key === "__row" || key === "company_id" || key === "extension_data")
      continue;
    const kind = spec.fields[key];
    if (kind) {
      const v = encode(kind, value, key);
      result[key] =
        v === null || v === Prisma.DbNull
          ? ""
          : kind === "date"
            ? (v as Date).toISOString().slice(0, 10)
            : kind === "timestamp"
              ? (v as Date).toISOString()
              : v;
    } else result[key] = structuredClone(value);
  }
  result.company_id = companyId(scope);
  return result;
}
function decode(table: string, record: Row): Row {
  const spec = specFor(table);
  const result: Row = {
    ...Object.fromEntries(
      [...new Set([...(SCHEMA[table] || []), ...Object.keys(spec.fields)])].map(
        (k) => [k, ""],
      ),
    ),
    ...(record.extension_data || {}),
  };
  for (const [key, kind] of Object.entries(spec.fields)) {
    const value = record[key];
    result[key] =
      value === null || value === undefined
        ? ""
        : kind === "date"
          ? value.toISOString().slice(0, 10)
          : kind === "timestamp"
            ? value.toISOString()
            : ["money", "days"].includes(kind)
              ? value.toFixed(2)
              : kind === "decimal"
                ? value.toFixed(6)
                : value;
  }
  return result;
}
function databaseError(error: any): never {
  if (error instanceof AppError) throw error;
  const code = error?.code || error?.cause?.code;
  if (
    !code &&
    !String(error?.name).includes("Prisma") &&
    !String(error?.name).includes("DriverAdapter")
  )
    throw error;
  if (code === "P2002" || code === "23505")
    throw new AppError(
      409,
      "DATABASE_CONFLICT",
      "A record with these unique fields already exists in this company.",
    );
  if (code === "P2003" || code === "23503")
    throw new AppError(
      422,
      "INVALID_COMPANY_REFERENCE",
      "A referenced record does not exist in this company.",
    );
  if (code === "P2004" || code === "23514")
    throw new AppError(
      422,
      "DATABASE_CONSTRAINT_FAILED",
      "The change violates a database data-integrity constraint.",
    );
  if (code === "P2034" || code === "40001" || code === "40P01")
    throw new AppError(
      409,
      "TRANSACTION_CONFLICT",
      "Concurrent changes conflicted. Retry using the original Idempotency-Key.",
    );
  if (code === "P2028" || code === "55P03")
    throw new AppError(
      503,
      "DATABASE_BUSY",
      "The company is processing another operation. Retry with the same Idempotency-Key.",
    );
  throw new AppError(
    503,
    "DATABASE_UNAVAILABLE",
    "The database could not complete the operation. Retry using the same Idempotency-Key; do not assume a timed-out write failed.",
  );
}

/** Every read and write is tenant-scoped. Full service mutations must use transaction(). */
export class PostgresRepository implements Repository {
  readonly companyId: string;
  private client: PrismaClient;
  private tx?: Prisma.TransactionClient;
  private ownsClient: boolean;
  private transactionTimeoutMs: number;
  constructor(options: PostgresOptions = {}) {
    this.companyId = companyId(
      options.companyId || process.env.DEFAULT_COMPANY_ID || DEFAULT_COMPANY_ID,
    );
    this.transactionTimeoutMs = options.transactionTimeoutMs || 30000;
    this.ownsClient = !options.client;
    const url = options.connectionString || process.env.DATABASE_URL;
    if (!options.client && !url)
      throw new AppError(
        503,
        "DATABASE_NOT_CONFIGURED",
        "Configure DATABASE_URL before starting PostgreSQL persistence.",
      );
    this.client =
      options.client ||
      new PrismaClient({
        adapter: new PrismaPg({
          connectionString: url,
          max: 10,
          connectionTimeoutMillis: 10000,
          idleTimeoutMillis: 30000,
        }),
      });
  }
  private delegate(table: string): any {
    return (this.tx || this.client)[
      specFor(table).delegate as keyof Prisma.TransactionClient
    ];
  }
  forCompany(id: string): PostgresRepository {
    const scope = companyId(id);
    if (this.tx && scope !== this.companyId)
      throw new AppError(
        403,
        "TRANSACTION_COMPANY_MISMATCH",
        "A transaction cannot change company scope.",
      );
    const next = new PostgresRepository({
      client: this.client,
      companyId: scope,
      transactionTimeoutMs: this.transactionTimeoutMs,
    });
    next.tx = this.tx;
    return next;
  }
  async initialize() {
    try {
      await this.client.$connect();
      const company = await this.client.company.findUnique({
        where: { company_id: this.companyId },
      });
      if (!company)
        throw new AppError(
          503,
          "COMPANY_NOT_INITIALIZED",
          "Run database migrations and bootstrap the configured company before starting the application.",
        );
      if (company.status !== "active")
        throw new AppError(
          403,
          "COMPANY_INACTIVE",
          "This company is inactive.",
        );
    } catch (error) {
      databaseError(error);
    }
  }
  async health() {
    try {
      await this.client.$queryRaw`SELECT 1`;
      return {
        connected: true,
        provider: "postgresql" as const,
        companyId: this.companyId,
      };
    } catch {
      return {
        connected: false,
        provider: "postgresql" as const,
        companyId: this.companyId,
      };
    }
  }
  async disconnect() {
    if (this.ownsClient) await this.client.$disconnect();
  }
  invalidate() {
    /* PostgreSQL reads are fresh; no cross-request data cache. */
  }
  async list(table: string): Promise<Row[]> {
    try {
      const spec = specFor(table);
      return (
        await this.delegate(table).findMany({
          where: { company_id: this.companyId },
          orderBy: { [spec.id]: "asc" },
        })
      ).map((row: Row) => decode(table, row));
    } catch (error) {
      databaseError(error);
    }
  }
  async find(table: string, id: string): Promise<Row | null> {
    try {
      const spec = specFor(table);
      const row = await this.delegate(table).findUnique({
        where: {
          [`company_id_${spec.id}`]: {
            company_id: this.companyId,
            [spec.id]: encode(spec.fields[spec.id], id, spec.id),
          },
        },
      });
      return row ? decode(table, row) : null;
    } catch (error) {
      databaseError(error);
    }
  }
  async query(
    table: string,
    options: DatabaseQuery = {},
  ): Promise<{ rows: Row[]; total: number }> {
    try {
      const spec = specFor(table);
      const where: Row = { company_id: this.companyId };
      for (const [field, value] of Object.entries(options.where || {})) {
        if (field === "company_id") {
          if (value !== this.companyId)
            throw new AppError(
              403,
              "COMPANY_SCOPE_MISMATCH",
              "Query company scope cannot be changed.",
            );
          continue;
        }
        const kind = spec.fields[field];
        if (!kind)
          throw new AppError(
            422,
            "UNSUPPORTED_QUERY_FIELD",
            `Cannot query untyped field ${field}.`,
          );
        if (value && typeof value === "object" && !Array.isArray(value)) {
          const condition: Row = {};
          for (const [op, v] of Object.entries(value)) {
            if (!["equals", "in", "gte", "lte", "contains"].includes(op))
              throw new AppError(
                422,
                "UNSUPPORTED_QUERY_OPERATOR",
                `Unsupported query operator ${op}.`,
              );
            if (op === "contains") {
              if (kind !== "text")
                throw new AppError(
                  422,
                  "INVALID_QUERY_OPERATOR",
                  "contains is only supported for text fields.",
                );
              condition.contains = String(v);
              condition.mode = "insensitive";
            } else if (op === "in") {
              if (!Array.isArray(v) || v.length > 1000)
                throw new AppError(
                  422,
                  "INVALID_QUERY_VALUES",
                  "in requires at most 1000 values.",
                );
              condition.in = v.map((x) => encode(kind, x, field));
            } else condition[op] = encode(kind, v, field);
          }
          where[field] = condition;
        } else where[field] = encode(kind, value, field);
      }
      const skip = options.skip ?? 0;
      const take = options.take ?? 100;
      if (
        !Number.isInteger(skip) ||
        skip < 0 ||
        !Number.isInteger(take) ||
        take < 1 ||
        take > 1000
      )
        throw new AppError(
          422,
          "INVALID_PAGINATION",
          "Use a nonnegative skip and take between 1 and 1000.",
        );
      const orderBy = (
        options.orderBy || [{ field: spec.id, direction: "asc" as const }]
      ).map(({ field, direction }) => {
        if (!spec.fields[field] || !["asc", "desc"].includes(direction))
          throw new AppError(422, "INVALID_SORT", "Unsupported database sort.");
        return { [field]: direction };
      });
      if (!orderBy.some((x) => spec.id in x))
        orderBy.push({ [spec.id]: "asc" });
      const delegate = this.delegate(table);
      const [rows, total] = await Promise.all([
        delegate.findMany({ where, orderBy, skip, take }),
        delegate.count({ where }),
      ]);
      return { rows: rows.map((row: Row) => decode(table, row)), total };
    } catch (error) {
      databaseError(error);
    }
  }
  async transaction<T>(fn: (tx: Repository) => Promise<T>): Promise<T> {
    if (this.tx) return fn(this);
    try {
      return await this.client.$transaction(
        async (tx) => {
          await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${this.companyId}, 0))`;
          await tx.$executeRawUnsafe("SET CONSTRAINTS ALL DEFERRED");
          const bound = this.forCompany(this.companyId);
          bound.tx = tx;
          return fn(bound);
        },
        {
          isolationLevel: Prisma.TransactionIsolationLevel.ReadCommitted,
          maxWait: 10000,
          timeout: this.transactionTimeoutMs,
        },
      );
    } catch (error) {
      databaseError(error);
    }
  }
  async commit(changes: Change[]): Promise<void> {
    if (!changes.length) return;
    if (!this.tx) {
      await this.transaction((tx) => tx.commit(changes));
      return;
    }
    try {
      for (const { table, record } of changes) {
        const spec = specFor(table);
        if (record.company_id && record.company_id !== this.companyId)
          throw new AppError(
            403,
            "COMPANY_SCOPE_MISMATCH",
            "A record cannot be written to another company.",
          );
        const id = encode(spec.fields[spec.id], record[spec.id], spec.id);
        if (!id)
          throw new AppError(
            422,
            "MISSING_RECORD_ID",
            `${spec.id} is required.`,
          );
        const delegate = this.delegate(table);
        const where = {
          [`company_id_${spec.id}`]: {
            company_id: this.companyId,
            [spec.id]: id,
          },
        };
        const existing = await delegate.findUnique({ where });
        const extension = { ...(existing?.extension_data || {}) };
        const data: Row = { company_id: this.companyId, [spec.id]: id };
        for (const [field, value] of Object.entries(record)) {
          if (
            field === "__row" ||
            field === "company_id" ||
            field === spec.id ||
            value === undefined
          )
            continue;
          if (field === "extension_data")
            throw new AppError(
              422,
              "RESERVED_FIELD",
              "extension_data is reserved for adapter storage.",
            );
          if (spec.fields[field])
            data[field] = encode(spec.fields[field], value, field);
          else
            extension[field] = jsonValue(
              typeof value === "string" ? JSON.stringify(value) : value,
            );
        }
        data.extension_data = extension;
        for (const field of spec.required)
          if (!(data[field] ?? existing?.[field]))
            throw new AppError(
              422,
              "MISSING_REFERENCE",
              `${field} is required for ${table}.`,
            );
        await delegate.upsert({ where, create: data, update: data });
      }
    } catch (error) {
      databaseError(error);
    }
  }
}
