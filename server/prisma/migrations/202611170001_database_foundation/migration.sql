-- CreateSchema
CREATE SCHEMA IF NOT EXISTS "public";

-- CreateTable
CREATE TABLE "companies" (
    "company_id" UUID NOT NULL,
    "name" TEXT NOT NULL,
    "currency" VARCHAR(3) NOT NULL DEFAULT 'USD',
    "status" TEXT NOT NULL DEFAULT 'active',
    "created_at" TIMESTAMPTZ(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updated_at" TIMESTAMPTZ(3) NOT NULL,

    CONSTRAINT "companies_pkey" PRIMARY KEY ("company_id")
);

-- CreateTable
CREATE TABLE "departments" (
    "company_id" UUID NOT NULL,
    "department_id" UUID NOT NULL,
    "department_name" TEXT,
    "description" TEXT,
    "department_head" TEXT,
    "status" TEXT,
    "created_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3),
    "extension_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "departments_pkey" PRIMARY KEY ("company_id","department_id")
);

-- CreateTable
CREATE TABLE "employees" (
    "company_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "employee_number" TEXT,
    "first_name" TEXT,
    "last_name" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "address" TEXT,
    "gender" TEXT,
    "position" TEXT,
    "employment_type" TEXT,
    "employment_status" TEXT,
    "payment_frequency" TEXT,
    "bank_name" TEXT,
    "account_number" TEXT,
    "emergency_contact" TEXT,
    "profile_image" TEXT,
    "notes" TEXT,
    "department_id" UUID NOT NULL,
    "date_of_birth" DATE,
    "hire_date" DATE,
    "employment_end_date" DATE,
    "basic_salary" DECIMAL(18,2),
    "allowances" DECIMAL(18,2),
    "created_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3),
    "extension_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "employees_pkey" PRIMARY KEY ("company_id","employee_id")
);

-- CreateTable
CREATE TABLE "users" (
    "company_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "full_name" TEXT,
    "email" TEXT,
    "google_id" TEXT,
    "profile_image" TEXT,
    "role" TEXT,
    "department" TEXT,
    "status" TEXT,
    "employee_id" UUID,
    "permissions" JSONB,
    "last_login" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3),
    "extension_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "users_pkey" PRIMARY KEY ("company_id","user_id")
);

-- CreateTable
CREATE TABLE "bonuses" (
    "company_id" UUID NOT NULL,
    "bonus_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "payroll_id" UUID,
    "bonus_type" TEXT,
    "description" TEXT,
    "effective_month" TEXT,
    "status" TEXT,
    "reason" TEXT,
    "created_by" TEXT,
    "approved_by" TEXT,
    "rejection_reason" TEXT,
    "amount" DECIMAL(18,2),
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3),
    "extension_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "bonuses_pkey" PRIMARY KEY ("company_id","bonus_id")
);

-- CreateTable
CREATE TABLE "penalties" (
    "company_id" UUID NOT NULL,
    "penalty_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "payroll_id" UUID,
    "penalty_type" TEXT,
    "description" TEXT,
    "effective_month" TEXT,
    "status" TEXT,
    "reason" TEXT,
    "created_by" TEXT,
    "approved_by" TEXT,
    "rejection_reason" TEXT,
    "amount" DECIMAL(18,2),
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3),
    "extension_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "penalties_pkey" PRIMARY KEY ("company_id","penalty_id")
);

-- CreateTable
CREATE TABLE "loans" (
    "company_id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "loan_amount" DECIMAL(18,2),
    "outstanding_balance" DECIMAL(18,2),
    "installment_amount" DECIMAL(18,2),
    "installment_frequency" TEXT,
    "description" TEXT,
    "reason" TEXT,
    "status" TEXT,
    "approved_by" TEXT,
    "created_by" TEXT,
    "rejection_reason" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3),
    "extension_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "loans_pkey" PRIMARY KEY ("company_id","loan_id")
);

-- CreateTable
CREATE TABLE "loan_installments" (
    "company_id" UUID NOT NULL,
    "installment_id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "payroll_run_id" UUID,
    "installment_amount" DECIMAL(18,2),
    "amount_paid" DECIMAL(18,2),
    "remaining_balance" DECIMAL(18,2),
    "reserved_amount" DECIMAL(18,2),
    "due_date" DATE,
    "payment_date" DATE,
    "installment_number" INTEGER,
    "status" TEXT,
    "payroll_month" TEXT,
    "created_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3),
    "extension_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "loan_installments_pkey" PRIMARY KEY ("company_id","installment_id")
);

-- CreateTable
CREATE TABLE "payroll_runs" (
    "company_id" UUID NOT NULL,
    "payroll_run_id" UUID NOT NULL,
    "payroll_month" TEXT,
    "status" TEXT,
    "generated_by" TEXT,
    "submitted_by" TEXT,
    "approved_by" TEXT,
    "finalized_by" TEXT,
    "paid_by" TEXT,
    "reviewed_by" TEXT,
    "rejection_reason" TEXT,
    "source_hash" TEXT,
    "total_employees" INTEGER,
    "revision" INTEGER,
    "total_basic_salary" DECIMAL(18,2),
    "total_allowances" DECIMAL(18,2),
    "total_bonuses" DECIMAL(18,2),
    "total_gross_salary" DECIMAL(18,2),
    "total_penalties" DECIMAL(18,2),
    "total_loan_deductions" DECIMAL(18,2),
    "total_deductions" DECIMAL(18,2),
    "total_net_payroll" DECIMAL(18,2),
    "approved_at" TIMESTAMPTZ(3),
    "finalized_at" TIMESTAMPTZ(3),
    "paid_at" TIMESTAMPTZ(3),
    "reviewed_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3),
    "warnings_json" TEXT,
    "extension_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "payroll_runs_pkey" PRIMARY KEY ("company_id","payroll_run_id")
);

-- CreateTable
CREATE TABLE "payroll" (
    "company_id" UUID NOT NULL,
    "payroll_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "payroll_run_id" UUID NOT NULL,
    "department_id" UUID,
    "payroll_month" TEXT,
    "employee_name" TEXT,
    "payment_status" TEXT,
    "status" TEXT,
    "snapshot_json" TEXT,
    "basic_salary" DECIMAL(18,2),
    "allowances" DECIMAL(18,2),
    "bonuses" DECIMAL(18,2),
    "gross_salary" DECIMAL(18,2),
    "penalties" DECIMAL(18,2),
    "loan_deductions" DECIMAL(18,2),
    "other_deductions" DECIMAL(18,2),
    "tax_deductions" DECIMAL(18,2),
    "total_deductions" DECIMAL(18,2),
    "net_salary" DECIMAL(18,2),
    "created_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3),
    "extension_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "payroll_pkey" PRIMARY KEY ("company_id","payroll_id")
);

-- CreateTable
CREATE TABLE "attendance" (
    "company_id" UUID NOT NULL,
    "attendance_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "date" DATE,
    "check_in" TEXT,
    "check_out" TEXT,
    "attendance_status" TEXT,
    "status" TEXT,
    "notes" TEXT,
    "source" TEXT,
    "approval_status" TEXT,
    "reason" TEXT,
    "clock_in" TIMESTAMPTZ(3),
    "clock_out" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3),
    "finalized_at" TIMESTAMPTZ(3),
    "approved_at" TIMESTAMPTZ(3),
    "work_minutes" INTEGER,
    "break_minutes" INTEGER,
    "overtime_minutes" INTEGER,
    "late_minutes" INTEGER,
    "early_minutes" INTEGER,
    "breaks" JSONB,
    "schedule_snapshot" JSONB,
    "extension_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "attendance_pkey" PRIMARY KEY ("company_id","attendance_id")
);

-- CreateTable
CREATE TABLE "leave" (
    "company_id" UUID NOT NULL,
    "leave_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "leave_type_id" UUID,
    "supporting_attachment_id" UUID,
    "leave_type" TEXT,
    "reason" TEXT,
    "status" TEXT,
    "created_by" TEXT,
    "approved_by" TEXT,
    "rejection_reason" TEXT,
    "start_date" DATE,
    "end_date" DATE,
    "days" DECIMAL(10,2),
    "approval_level" INTEGER,
    "approval_roles" JSONB,
    "approved_at" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3),
    "extension_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "leave_pkey" PRIMARY KEY ("company_id","leave_id")
);

-- CreateTable
CREATE TABLE "company_settings" (
    "company_id" UUID NOT NULL,
    "setting_id" TEXT NOT NULL,
    "company_name" TEXT,
    "company_logo" TEXT,
    "company_email" TEXT,
    "company_phone" TEXT,
    "company_address" TEXT,
    "currency" TEXT,
    "date_format" TEXT,
    "timezone" TEXT,
    "default_payment_frequency" TEXT,
    "payroll_start_day" INTEGER,
    "payroll_end_day" INTEGER,
    "configured_deductions" JSONB,
    "created_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3),
    "extension_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "company_settings_pkey" PRIMARY KEY ("company_id","setting_id")
);

-- CreateTable
CREATE TABLE "audit_logs" (
    "company_id" UUID NOT NULL,
    "log_id" UUID NOT NULL,
    "user_id" TEXT,
    "user_email" TEXT,
    "action" TEXT,
    "module" TEXT,
    "record_id" TEXT,
    "previous_value" TEXT,
    "new_value" TEXT,
    "ip_address" TEXT,
    "timestamp" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3),
    "extension_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "audit_logs_pkey" PRIMARY KEY ("company_id","log_id")
);

-- CreateTable
CREATE TABLE "salary_history" (
    "company_id" UUID NOT NULL,
    "salary_history_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "basic_salary" DECIMAL(18,2),
    "allowances" DECIMAL(18,2),
    "previous_amount" DECIMAL(18,2),
    "previous_allowances" DECIMAL(18,2),
    "payment_frequency" TEXT,
    "previous_payment_frequency" TEXT,
    "reason" TEXT,
    "changed_by" TEXT,
    "effective_date" DATE,
    "created_at" TIMESTAMPTZ(3),
    "extension_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "salary_history_pkey" PRIMARY KEY ("company_id","salary_history_id")
);

-- CreateTable
CREATE TABLE "notifications_read" (
    "company_id" UUID NOT NULL,
    "notification_read_id" UUID NOT NULL,
    "user_id" UUID NOT NULL,
    "notification_id" TEXT,
    "read_at" TIMESTAMPTZ(3),
    "extension_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "notifications_read_pkey" PRIMARY KEY ("company_id","notification_read_id")
);

-- CreateTable
CREATE TABLE "idempotency" (
    "company_id" UUID NOT NULL,
    "idempotency_id" TEXT NOT NULL,
    "user_id" UUID NOT NULL,
    "request_hash" TEXT,
    "response_json" TEXT,
    "status_code" INTEGER,
    "created_at" TIMESTAMPTZ(3),
    "extension_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "idempotency_pkey" PRIMARY KEY ("company_id","idempotency_id")
);

-- CreateTable
CREATE TABLE "loan_payments" (
    "company_id" UUID NOT NULL,
    "payment_id" UUID NOT NULL,
    "loan_id" UUID NOT NULL,
    "installment_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "payroll_id" UUID,
    "amount" DECIMAL(18,2),
    "payment_date" DATE,
    "source" TEXT,
    "created_by" TEXT,
    "created_at" TIMESTAMPTZ(3),
    "extension_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "loan_payments_pkey" PRIMARY KEY ("company_id","payment_id")
);

-- CreateTable
CREATE TABLE "work_schedules" (
    "company_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "department_id" UUID,
    "name" TEXT,
    "timezone" TEXT,
    "expected_start" TEXT,
    "expected_end" TEXT,
    "work_days" JSONB,
    "grace_minutes" INTEGER,
    "break_minutes" INTEGER,
    "overtime_after_minutes" INTEGER,
    "half_day_minutes" INTEGER,
    "track_breaks" BOOLEAN,
    "overtime_enabled" BOOLEAN,
    "unpaid_absence_enabled" BOOLEAN,
    "overtime_multiplier" DECIMAL(12,6),
    "created_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3),
    "extension_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "work_schedules_pkey" PRIMARY KEY ("company_id","schedule_id")
);

-- CreateTable
CREATE TABLE "shift_assignments" (
    "company_id" UUID NOT NULL,
    "assignment_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "schedule_id" UUID NOT NULL,
    "start_date" DATE,
    "end_date" DATE,
    "created_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3),
    "extension_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "shift_assignments_pkey" PRIMARY KEY ("company_id","assignment_id")
);

-- CreateTable
CREATE TABLE "holidays" (
    "company_id" UUID NOT NULL,
    "holiday_id" UUID NOT NULL,
    "department_id" UUID,
    "date" DATE,
    "name" TEXT,
    "created_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3),
    "extension_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "holidays_pkey" PRIMARY KEY ("company_id","holiday_id")
);

-- CreateTable
CREATE TABLE "attendance_corrections" (
    "company_id" UUID NOT NULL,
    "correction_id" UUID NOT NULL,
    "attendance_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "requested_by" UUID NOT NULL,
    "status" TEXT,
    "reason" TEXT,
    "comments" TEXT,
    "clock_in" TIMESTAMPTZ(3),
    "clock_out" TIMESTAMPTZ(3),
    "created_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3),
    "break_minutes" INTEGER,
    "extension_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "attendance_corrections_pkey" PRIMARY KEY ("company_id","correction_id")
);

-- CreateTable
CREATE TABLE "leave_types" (
    "company_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "name" TEXT,
    "accrual_mode" TEXT,
    "paid" BOOLEAN,
    "allow_self_approval" BOOLEAN,
    "requires_document" BOOLEAN,
    "annual_entitlement" DECIMAL(10,2),
    "carry_forward_limit" DECIMAL(10,2),
    "carry_expiry_month" INTEGER,
    "approval_roles" JSONB,
    "created_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3),
    "extension_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "leave_types_pkey" PRIMARY KEY ("company_id","leave_type_id")
);

-- CreateTable
CREATE TABLE "leave_entitlements" (
    "company_id" UUID NOT NULL,
    "entitlement_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "leave_type_id" UUID NOT NULL,
    "year" INTEGER,
    "days" DECIMAL(10,2),
    "reason" TEXT,
    "created_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3),
    "extension_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "leave_entitlements_pkey" PRIMARY KEY ("company_id","entitlement_id")
);

-- CreateTable
CREATE TABLE "approval_decisions" (
    "company_id" UUID NOT NULL,
    "decision_id" UUID NOT NULL,
    "approver_id" UUID NOT NULL,
    "request_id" UUID,
    "request_type" TEXT,
    "decision" TEXT,
    "comments" TEXT,
    "approval_level" INTEGER,
    "created_at" TIMESTAMPTZ(3),
    "extension_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "approval_decisions_pkey" PRIMARY KEY ("company_id","decision_id")
);

-- CreateTable
CREATE TABLE "attendance_payroll_inputs" (
    "company_id" UUID NOT NULL,
    "input_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "bonus_id" UUID,
    "penalty_id" UUID,
    "payroll_month" TEXT,
    "type" TEXT,
    "status" TEXT,
    "reason" TEXT,
    "amount" DECIMAL(18,2),
    "attendance_ids" JSONB,
    "calculation" JSONB,
    "policy_snapshot" JSONB,
    "created_at" TIMESTAMPTZ(3),
    "updated_at" TIMESTAMPTZ(3),
    "approved_at" TIMESTAMPTZ(3),
    "extension_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "attendance_payroll_inputs_pkey" PRIMARY KEY ("company_id","input_id")
);

-- CreateTable
CREATE TABLE "leave_attachments" (
    "company_id" UUID NOT NULL,
    "attachment_id" UUID NOT NULL,
    "employee_id" UUID NOT NULL,
    "leave_id" UUID,
    "storage_key" TEXT,
    "content_type" TEXT,
    "original_name" TEXT,
    "sha256" TEXT,
    "size" INTEGER,
    "created_at" TIMESTAMPTZ(3),
    "extension_data" JSONB NOT NULL DEFAULT '{}',

    CONSTRAINT "leave_attachments_pkey" PRIMARY KEY ("company_id","attachment_id")
);

-- CreateIndex
CREATE INDEX "departments_company_id_status_idx" ON "departments"("company_id", "status");

-- CreateIndex
CREATE UNIQUE INDEX "departments_company_id_department_name_key" ON "departments"("company_id", "department_name");

-- CreateIndex
CREATE INDEX "employees_company_id_department_id_employment_status_idx" ON "employees"("company_id", "department_id", "employment_status");

-- CreateIndex
CREATE INDEX "employees_company_id_hire_date_idx" ON "employees"("company_id", "hire_date");

-- CreateIndex
CREATE INDEX "employees_company_id_employment_end_date_idx" ON "employees"("company_id", "employment_end_date");

-- CreateIndex
CREATE UNIQUE INDEX "employees_company_id_employee_number_key" ON "employees"("company_id", "employee_number");

-- CreateIndex
CREATE UNIQUE INDEX "employees_company_id_email_key" ON "employees"("company_id", "email");

-- CreateIndex
CREATE INDEX "users_company_id_role_status_idx" ON "users"("company_id", "role", "status");

-- CreateIndex
CREATE UNIQUE INDEX "users_company_id_email_key" ON "users"("company_id", "email");

-- CreateIndex
CREATE UNIQUE INDEX "users_company_id_google_id_key" ON "users"("company_id", "google_id");

-- CreateIndex
CREATE UNIQUE INDEX "users_company_id_employee_id_key" ON "users"("company_id", "employee_id");

-- CreateIndex
CREATE INDEX "bonuses_company_id_employee_id_effective_month_status_idx" ON "bonuses"("company_id", "employee_id", "effective_month", "status");

-- CreateIndex
CREATE INDEX "bonuses_company_id_payroll_id_idx" ON "bonuses"("company_id", "payroll_id");

-- CreateIndex
CREATE INDEX "penalties_company_id_employee_id_effective_month_status_idx" ON "penalties"("company_id", "employee_id", "effective_month", "status");

-- CreateIndex
CREATE INDEX "penalties_company_id_payroll_id_idx" ON "penalties"("company_id", "payroll_id");

-- CreateIndex
CREATE INDEX "loans_company_id_employee_id_status_idx" ON "loans"("company_id", "employee_id", "status");

-- CreateIndex
CREATE INDEX "loans_company_id_start_date_idx" ON "loans"("company_id", "start_date");

-- CreateIndex
CREATE UNIQUE INDEX "loans_company_id_loan_id_employee_id_key" ON "loans"("company_id", "loan_id", "employee_id");

-- CreateIndex
CREATE INDEX "loan_installments_company_id_employee_id_due_date_status_idx" ON "loan_installments"("company_id", "employee_id", "due_date", "status");

-- CreateIndex
CREATE INDEX "loan_installments_company_id_payroll_run_id_idx" ON "loan_installments"("company_id", "payroll_run_id");

-- CreateIndex
CREATE UNIQUE INDEX "loan_installments_company_id_loan_id_installment_number_key" ON "loan_installments"("company_id", "loan_id", "installment_number");

-- CreateIndex
CREATE UNIQUE INDEX "loan_installments_company_id_installment_id_loan_id_employe_key" ON "loan_installments"("company_id", "installment_id", "loan_id", "employee_id");

-- CreateIndex
CREATE INDEX "payroll_runs_company_id_status_payroll_month_idx" ON "payroll_runs"("company_id", "status", "payroll_month");

-- CreateIndex
CREATE UNIQUE INDEX "payroll_runs_company_id_payroll_month_key" ON "payroll_runs"("company_id", "payroll_month");

-- CreateIndex
CREATE INDEX "payroll_company_id_employee_id_payroll_month_idx" ON "payroll"("company_id", "employee_id", "payroll_month");

-- CreateIndex
CREATE INDEX "payroll_company_id_payroll_run_id_status_idx" ON "payroll"("company_id", "payroll_run_id", "status");

-- CreateIndex
CREATE INDEX "payroll_company_id_department_id_payroll_month_idx" ON "payroll"("company_id", "department_id", "payroll_month");

-- CreateIndex
CREATE INDEX "attendance_company_id_date_attendance_status_idx" ON "attendance"("company_id", "date", "attendance_status");

-- CreateIndex
CREATE INDEX "attendance_company_id_employee_id_approval_status_idx" ON "attendance"("company_id", "employee_id", "approval_status");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_company_id_employee_id_date_key" ON "attendance"("company_id", "employee_id", "date");

-- CreateIndex
CREATE UNIQUE INDEX "attendance_company_id_attendance_id_employee_id_key" ON "attendance"("company_id", "attendance_id", "employee_id");

-- CreateIndex
CREATE INDEX "leave_company_id_employee_id_start_date_end_date_idx" ON "leave"("company_id", "employee_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "leave_company_id_status_leave_type_id_idx" ON "leave"("company_id", "status", "leave_type_id");

-- CreateIndex
CREATE UNIQUE INDEX "leave_company_id_leave_id_employee_id_key" ON "leave"("company_id", "leave_id", "employee_id");

-- CreateIndex
CREATE INDEX "audit_logs_company_id_user_id_created_at_idx" ON "audit_logs"("company_id", "user_id", "created_at");

-- CreateIndex
CREATE INDEX "audit_logs_company_id_module_record_id_idx" ON "audit_logs"("company_id", "module", "record_id");

-- CreateIndex
CREATE INDEX "audit_logs_company_id_created_at_idx" ON "audit_logs"("company_id", "created_at");

-- CreateIndex
CREATE INDEX "salary_history_company_id_employee_id_effective_date_idx" ON "salary_history"("company_id", "employee_id", "effective_date");

-- CreateIndex
CREATE UNIQUE INDEX "salary_history_company_id_employee_id_effective_date_key" ON "salary_history"("company_id", "employee_id", "effective_date");

-- CreateIndex
CREATE UNIQUE INDEX "notifications_read_company_id_user_id_notification_id_key" ON "notifications_read"("company_id", "user_id", "notification_id");

-- CreateIndex
CREATE INDEX "idempotency_company_id_user_id_created_at_idx" ON "idempotency"("company_id", "user_id", "created_at");

-- CreateIndex
CREATE INDEX "loan_payments_company_id_loan_id_payment_date_idx" ON "loan_payments"("company_id", "loan_id", "payment_date");

-- CreateIndex
CREATE INDEX "loan_payments_company_id_employee_id_payment_date_idx" ON "loan_payments"("company_id", "employee_id", "payment_date");

-- CreateIndex
CREATE INDEX "loan_payments_company_id_payroll_id_idx" ON "loan_payments"("company_id", "payroll_id");

-- CreateIndex
CREATE INDEX "work_schedules_company_id_department_id_idx" ON "work_schedules"("company_id", "department_id");

-- CreateIndex
CREATE INDEX "shift_assignments_company_id_employee_id_start_date_end_dat_idx" ON "shift_assignments"("company_id", "employee_id", "start_date", "end_date");

-- CreateIndex
CREATE INDEX "shift_assignments_company_id_schedule_id_idx" ON "shift_assignments"("company_id", "schedule_id");

-- CreateIndex
CREATE INDEX "holidays_company_id_date_department_id_idx" ON "holidays"("company_id", "date", "department_id");

-- CreateIndex
CREATE INDEX "attendance_corrections_company_id_employee_id_status_idx" ON "attendance_corrections"("company_id", "employee_id", "status");

-- CreateIndex
CREATE INDEX "attendance_corrections_company_id_attendance_id_idx" ON "attendance_corrections"("company_id", "attendance_id");

-- CreateIndex
CREATE INDEX "attendance_corrections_company_id_requested_by_idx" ON "attendance_corrections"("company_id", "requested_by");

-- CreateIndex
CREATE UNIQUE INDEX "leave_types_company_id_name_key" ON "leave_types"("company_id", "name");

-- CreateIndex
CREATE INDEX "leave_entitlements_company_id_year_idx" ON "leave_entitlements"("company_id", "year");

-- CreateIndex
CREATE UNIQUE INDEX "leave_entitlements_company_id_employee_id_leave_type_id_yea_key" ON "leave_entitlements"("company_id", "employee_id", "leave_type_id", "year");

-- CreateIndex
CREATE INDEX "approval_decisions_company_id_request_type_request_id_idx" ON "approval_decisions"("company_id", "request_type", "request_id");

-- CreateIndex
CREATE INDEX "approval_decisions_company_id_approver_id_created_at_idx" ON "approval_decisions"("company_id", "approver_id", "created_at");

-- CreateIndex
CREATE INDEX "attendance_payroll_inputs_company_id_employee_id_payroll_mo_idx" ON "attendance_payroll_inputs"("company_id", "employee_id", "payroll_month", "status");

-- CreateIndex
CREATE INDEX "attendance_payroll_inputs_company_id_bonus_id_idx" ON "attendance_payroll_inputs"("company_id", "bonus_id");

-- CreateIndex
CREATE INDEX "attendance_payroll_inputs_company_id_penalty_id_idx" ON "attendance_payroll_inputs"("company_id", "penalty_id");

-- CreateIndex
CREATE INDEX "leave_attachments_company_id_employee_id_idx" ON "leave_attachments"("company_id", "employee_id");

-- CreateIndex
CREATE INDEX "leave_attachments_company_id_leave_id_idx" ON "leave_attachments"("company_id", "leave_id");

-- CreateIndex
CREATE UNIQUE INDEX "leave_attachments_company_id_storage_key_key" ON "leave_attachments"("company_id", "storage_key");

-- CreateIndex
CREATE UNIQUE INDEX "leave_attachments_company_id_attachment_id_employee_id_key" ON "leave_attachments"("company_id", "attachment_id", "employee_id");

-- AddForeignKey
ALTER TABLE "departments" ADD CONSTRAINT "departments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "employees" ADD CONSTRAINT "employees_company_id_department_id_fkey" FOREIGN KEY ("company_id", "department_id") REFERENCES "departments"("company_id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "users" ADD CONSTRAINT "users_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "employees"("company_id", "employee_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "bonuses" ADD CONSTRAINT "bonuses_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "bonuses" ADD CONSTRAINT "bonuses_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "employees"("company_id", "employee_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "bonuses" ADD CONSTRAINT "bonuses_company_id_payroll_id_fkey" FOREIGN KEY ("company_id", "payroll_id") REFERENCES "payroll"("company_id", "payroll_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "employees"("company_id", "employee_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_company_id_payroll_id_fkey" FOREIGN KEY ("company_id", "payroll_id") REFERENCES "payroll"("company_id", "payroll_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "loans" ADD CONSTRAINT "loans_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "employees"("company_id", "employee_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "loan_installments" ADD CONSTRAINT "loan_installments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "loan_installments" ADD CONSTRAINT "loan_installments_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "employees"("company_id", "employee_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "loan_installments" ADD CONSTRAINT "loan_installments_company_id_payroll_run_id_fkey" FOREIGN KEY ("company_id", "payroll_run_id") REFERENCES "payroll_runs"("company_id", "payroll_run_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "loan_installments" ADD CONSTRAINT "loan_installments_company_id_loan_id_employee_id_fkey" FOREIGN KEY ("company_id", "loan_id", "employee_id") REFERENCES "loans"("company_id", "loan_id", "employee_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payroll" ADD CONSTRAINT "payroll_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payroll" ADD CONSTRAINT "payroll_company_id_department_id_fkey" FOREIGN KEY ("company_id", "department_id") REFERENCES "departments"("company_id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payroll" ADD CONSTRAINT "payroll_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "employees"("company_id", "employee_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "payroll" ADD CONSTRAINT "payroll_company_id_payroll_run_id_fkey" FOREIGN KEY ("company_id", "payroll_run_id") REFERENCES "payroll_runs"("company_id", "payroll_run_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "employees"("company_id", "employee_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "leave" ADD CONSTRAINT "leave_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "leave" ADD CONSTRAINT "leave_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "employees"("company_id", "employee_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "leave" ADD CONSTRAINT "leave_company_id_leave_type_id_fkey" FOREIGN KEY ("company_id", "leave_type_id") REFERENCES "leave_types"("company_id", "leave_type_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "leave" ADD CONSTRAINT "leave_company_id_supporting_attachment_id_employee_id_fkey" FOREIGN KEY ("company_id", "supporting_attachment_id", "employee_id") REFERENCES "leave_attachments"("company_id", "attachment_id", "employee_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "audit_logs" ADD CONSTRAINT "audit_logs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "salary_history" ADD CONSTRAINT "salary_history_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "salary_history" ADD CONSTRAINT "salary_history_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "employees"("company_id", "employee_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notifications_read" ADD CONSTRAINT "notifications_read_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "notifications_read" ADD CONSTRAINT "notifications_read_company_id_user_id_fkey" FOREIGN KEY ("company_id", "user_id") REFERENCES "users"("company_id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "idempotency" ADD CONSTRAINT "idempotency_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "idempotency" ADD CONSTRAINT "idempotency_company_id_user_id_fkey" FOREIGN KEY ("company_id", "user_id") REFERENCES "users"("company_id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "loan_payments" ADD CONSTRAINT "loan_payments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "loan_payments" ADD CONSTRAINT "loan_payments_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "employees"("company_id", "employee_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "loan_payments" ADD CONSTRAINT "loan_payments_company_id_payroll_id_fkey" FOREIGN KEY ("company_id", "payroll_id") REFERENCES "payroll"("company_id", "payroll_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "loan_payments" ADD CONSTRAINT "loan_payments_company_id_loan_id_employee_id_fkey" FOREIGN KEY ("company_id", "loan_id", "employee_id") REFERENCES "loans"("company_id", "loan_id", "employee_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "loan_payments" ADD CONSTRAINT "loan_payments_company_id_installment_id_loan_id_employee_i_fkey" FOREIGN KEY ("company_id", "installment_id", "loan_id", "employee_id") REFERENCES "loan_installments"("company_id", "installment_id", "loan_id", "employee_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_company_id_department_id_fkey" FOREIGN KEY ("company_id", "department_id") REFERENCES "departments"("company_id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "employees"("company_id", "employee_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_company_id_schedule_id_fkey" FOREIGN KEY ("company_id", "schedule_id") REFERENCES "work_schedules"("company_id", "schedule_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "holidays" ADD CONSTRAINT "holidays_company_id_department_id_fkey" FOREIGN KEY ("company_id", "department_id") REFERENCES "departments"("company_id", "department_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "employees"("company_id", "employee_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_company_id_attendance_id_employee_i_fkey" FOREIGN KEY ("company_id", "attendance_id", "employee_id") REFERENCES "attendance"("company_id", "attendance_id", "employee_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_company_id_requested_by_fkey" FOREIGN KEY ("company_id", "requested_by") REFERENCES "users"("company_id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "leave_entitlements" ADD CONSTRAINT "leave_entitlements_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "leave_entitlements" ADD CONSTRAINT "leave_entitlements_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "employees"("company_id", "employee_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "leave_entitlements" ADD CONSTRAINT "leave_entitlements_company_id_leave_type_id_fkey" FOREIGN KEY ("company_id", "leave_type_id") REFERENCES "leave_types"("company_id", "leave_type_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_company_id_approver_id_fkey" FOREIGN KEY ("company_id", "approver_id") REFERENCES "users"("company_id", "user_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attendance_payroll_inputs" ADD CONSTRAINT "attendance_payroll_inputs_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attendance_payroll_inputs" ADD CONSTRAINT "attendance_payroll_inputs_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "employees"("company_id", "employee_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attendance_payroll_inputs" ADD CONSTRAINT "attendance_payroll_inputs_company_id_bonus_id_fkey" FOREIGN KEY ("company_id", "bonus_id") REFERENCES "bonuses"("company_id", "bonus_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "attendance_payroll_inputs" ADD CONSTRAINT "attendance_payroll_inputs_company_id_penalty_id_fkey" FOREIGN KEY ("company_id", "penalty_id") REFERENCES "penalties"("company_id", "penalty_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "leave_attachments" ADD CONSTRAINT "leave_attachments_company_id_fkey" FOREIGN KEY ("company_id") REFERENCES "companies"("company_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "leave_attachments" ADD CONSTRAINT "leave_attachments_company_id_employee_id_fkey" FOREIGN KEY ("company_id", "employee_id") REFERENCES "employees"("company_id", "employee_id") ON DELETE RESTRICT ON UPDATE RESTRICT;

-- AddForeignKey
ALTER TABLE "leave_attachments" ADD CONSTRAINT "leave_attachments_company_id_leave_id_employee_id_fkey" FOREIGN KEY ("company_id", "leave_id", "employee_id") REFERENCES "leave"("company_id", "leave_id", "employee_id") ON DELETE RESTRICT ON UPDATE RESTRICT;


-- Defer foreign keys until COMMIT so atomic batches may contain cyclic links.
ALTER TABLE "departments" ALTER CONSTRAINT "departments_company_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "employees" ALTER CONSTRAINT "employees_company_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "employees" ALTER CONSTRAINT "employees_company_id_department_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "users" ALTER CONSTRAINT "users_company_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "users" ALTER CONSTRAINT "users_company_id_employee_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "bonuses" ALTER CONSTRAINT "bonuses_company_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "bonuses" ALTER CONSTRAINT "bonuses_company_id_employee_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "bonuses" ALTER CONSTRAINT "bonuses_company_id_payroll_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "penalties" ALTER CONSTRAINT "penalties_company_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "penalties" ALTER CONSTRAINT "penalties_company_id_employee_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "penalties" ALTER CONSTRAINT "penalties_company_id_payroll_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "loans" ALTER CONSTRAINT "loans_company_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "loans" ALTER CONSTRAINT "loans_company_id_employee_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "loan_installments" ALTER CONSTRAINT "loan_installments_company_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "loan_installments" ALTER CONSTRAINT "loan_installments_company_id_employee_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "loan_installments" ALTER CONSTRAINT "loan_installments_company_id_payroll_run_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "loan_installments" ALTER CONSTRAINT "loan_installments_company_id_loan_id_employee_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "payroll_runs" ALTER CONSTRAINT "payroll_runs_company_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "payroll" ALTER CONSTRAINT "payroll_company_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "payroll" ALTER CONSTRAINT "payroll_company_id_department_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "payroll" ALTER CONSTRAINT "payroll_company_id_employee_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "payroll" ALTER CONSTRAINT "payroll_company_id_payroll_run_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "attendance" ALTER CONSTRAINT "attendance_company_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "attendance" ALTER CONSTRAINT "attendance_company_id_employee_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "leave" ALTER CONSTRAINT "leave_company_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "leave" ALTER CONSTRAINT "leave_company_id_employee_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "leave" ALTER CONSTRAINT "leave_company_id_leave_type_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "leave" ALTER CONSTRAINT "leave_company_id_supporting_attachment_id_employee_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "company_settings" ALTER CONSTRAINT "company_settings_company_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "audit_logs" ALTER CONSTRAINT "audit_logs_company_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "salary_history" ALTER CONSTRAINT "salary_history_company_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "salary_history" ALTER CONSTRAINT "salary_history_company_id_employee_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "notifications_read" ALTER CONSTRAINT "notifications_read_company_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "notifications_read" ALTER CONSTRAINT "notifications_read_company_id_user_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "idempotency" ALTER CONSTRAINT "idempotency_company_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "idempotency" ALTER CONSTRAINT "idempotency_company_id_user_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "loan_payments" ALTER CONSTRAINT "loan_payments_company_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "loan_payments" ALTER CONSTRAINT "loan_payments_company_id_employee_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "loan_payments" ALTER CONSTRAINT "loan_payments_company_id_payroll_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "loan_payments" ALTER CONSTRAINT "loan_payments_company_id_loan_id_employee_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "loan_payments" ALTER CONSTRAINT "loan_payments_company_id_installment_id_loan_id_employee_i_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "work_schedules" ALTER CONSTRAINT "work_schedules_company_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "work_schedules" ALTER CONSTRAINT "work_schedules_company_id_department_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "shift_assignments" ALTER CONSTRAINT "shift_assignments_company_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "shift_assignments" ALTER CONSTRAINT "shift_assignments_company_id_employee_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "shift_assignments" ALTER CONSTRAINT "shift_assignments_company_id_schedule_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "holidays" ALTER CONSTRAINT "holidays_company_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "holidays" ALTER CONSTRAINT "holidays_company_id_department_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "attendance_corrections" ALTER CONSTRAINT "attendance_corrections_company_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "attendance_corrections" ALTER CONSTRAINT "attendance_corrections_company_id_employee_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "attendance_corrections" ALTER CONSTRAINT "attendance_corrections_company_id_attendance_id_employee_i_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "attendance_corrections" ALTER CONSTRAINT "attendance_corrections_company_id_requested_by_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "leave_types" ALTER CONSTRAINT "leave_types_company_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "leave_entitlements" ALTER CONSTRAINT "leave_entitlements_company_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "leave_entitlements" ALTER CONSTRAINT "leave_entitlements_company_id_employee_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "leave_entitlements" ALTER CONSTRAINT "leave_entitlements_company_id_leave_type_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "approval_decisions" ALTER CONSTRAINT "approval_decisions_company_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "approval_decisions" ALTER CONSTRAINT "approval_decisions_company_id_approver_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "attendance_payroll_inputs" ALTER CONSTRAINT "attendance_payroll_inputs_company_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "attendance_payroll_inputs" ALTER CONSTRAINT "attendance_payroll_inputs_company_id_employee_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "attendance_payroll_inputs" ALTER CONSTRAINT "attendance_payroll_inputs_company_id_bonus_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "attendance_payroll_inputs" ALTER CONSTRAINT "attendance_payroll_inputs_company_id_penalty_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "leave_attachments" ALTER CONSTRAINT "leave_attachments_company_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "leave_attachments" ALTER CONSTRAINT "leave_attachments_company_id_employee_id_fkey" DEFERRABLE INITIALLY DEFERRED;
ALTER TABLE "leave_attachments" ALTER CONSTRAINT "leave_attachments_company_id_leave_id_employee_id_fkey" DEFERRABLE INITIALLY DEFERRED;

-- Additional domain integrity constraints (nullable legacy cells remain NULL).
ALTER TABLE "employees" ADD CONSTRAINT "employees_nonnegative" CHECK (("basic_salary" IS NULL OR "basic_salary" >= 0) AND ("allowances" IS NULL OR "allowances" >= 0));
ALTER TABLE "bonuses" ADD CONSTRAINT "bonuses_nonnegative" CHECK (("amount" IS NULL OR "amount" >= 0));
ALTER TABLE "penalties" ADD CONSTRAINT "penalties_nonnegative" CHECK (("amount" IS NULL OR "amount" >= 0));
ALTER TABLE "loans" ADD CONSTRAINT "loans_nonnegative" CHECK (("loan_amount" IS NULL OR "loan_amount" >= 0) AND ("outstanding_balance" IS NULL OR "outstanding_balance" >= 0) AND ("installment_amount" IS NULL OR "installment_amount" >= 0));
ALTER TABLE "loan_installments" ADD CONSTRAINT "loan_installments_nonnegative" CHECK (("installment_amount" IS NULL OR "installment_amount" >= 0) AND ("amount_paid" IS NULL OR "amount_paid" >= 0) AND ("remaining_balance" IS NULL OR "remaining_balance" >= 0) AND ("reserved_amount" IS NULL OR "reserved_amount" >= 0) AND ("installment_number" IS NULL OR "installment_number" >= 0));
ALTER TABLE "payroll_runs" ADD CONSTRAINT "payroll_runs_nonnegative" CHECK (("total_employees" IS NULL OR "total_employees" >= 0) AND ("total_basic_salary" IS NULL OR "total_basic_salary" >= 0) AND ("total_allowances" IS NULL OR "total_allowances" >= 0) AND ("total_bonuses" IS NULL OR "total_bonuses" >= 0) AND ("total_gross_salary" IS NULL OR "total_gross_salary" >= 0) AND ("total_penalties" IS NULL OR "total_penalties" >= 0) AND ("total_loan_deductions" IS NULL OR "total_loan_deductions" >= 0) AND ("total_deductions" IS NULL OR "total_deductions" >= 0) AND ("total_net_payroll" IS NULL OR "total_net_payroll" >= 0));
ALTER TABLE "payroll" ADD CONSTRAINT "payroll_nonnegative" CHECK (("basic_salary" IS NULL OR "basic_salary" >= 0) AND ("allowances" IS NULL OR "allowances" >= 0) AND ("bonuses" IS NULL OR "bonuses" >= 0) AND ("gross_salary" IS NULL OR "gross_salary" >= 0) AND ("penalties" IS NULL OR "penalties" >= 0) AND ("loan_deductions" IS NULL OR "loan_deductions" >= 0) AND ("other_deductions" IS NULL OR "other_deductions" >= 0) AND ("tax_deductions" IS NULL OR "tax_deductions" >= 0) AND ("total_deductions" IS NULL OR "total_deductions" >= 0) AND ("net_salary" IS NULL OR "net_salary" >= 0));
ALTER TABLE "attendance" ADD CONSTRAINT "attendance_nonnegative" CHECK (("work_minutes" IS NULL OR "work_minutes" >= 0) AND ("break_minutes" IS NULL OR "break_minutes" >= 0) AND ("overtime_minutes" IS NULL OR "overtime_minutes" >= 0) AND ("late_minutes" IS NULL OR "late_minutes" >= 0) AND ("early_minutes" IS NULL OR "early_minutes" >= 0));
ALTER TABLE "leave" ADD CONSTRAINT "leave_nonnegative" CHECK (("days" IS NULL OR "days" >= 0) AND ("approval_level" IS NULL OR "approval_level" >= 0));
ALTER TABLE "company_settings" ADD CONSTRAINT "company_settings_nonnegative" CHECK (("payroll_start_day" IS NULL OR "payroll_start_day" >= 0) AND ("payroll_end_day" IS NULL OR "payroll_end_day" >= 0));
ALTER TABLE "salary_history" ADD CONSTRAINT "salary_history_nonnegative" CHECK (("basic_salary" IS NULL OR "basic_salary" >= 0) AND ("allowances" IS NULL OR "allowances" >= 0) AND ("previous_amount" IS NULL OR "previous_amount" >= 0) AND ("previous_allowances" IS NULL OR "previous_allowances" >= 0));
ALTER TABLE "loan_payments" ADD CONSTRAINT "loan_payments_nonnegative" CHECK (("amount" IS NULL OR "amount" >= 0));
ALTER TABLE "work_schedules" ADD CONSTRAINT "work_schedules_nonnegative" CHECK (("grace_minutes" IS NULL OR "grace_minutes" >= 0) AND ("break_minutes" IS NULL OR "break_minutes" >= 0) AND ("overtime_after_minutes" IS NULL OR "overtime_after_minutes" >= 0) AND ("half_day_minutes" IS NULL OR "half_day_minutes" >= 0));
ALTER TABLE "attendance_corrections" ADD CONSTRAINT "attendance_corrections_nonnegative" CHECK (("break_minutes" IS NULL OR "break_minutes" >= 0));
ALTER TABLE "leave_types" ADD CONSTRAINT "leave_types_nonnegative" CHECK (("annual_entitlement" IS NULL OR "annual_entitlement" >= 0) AND ("carry_forward_limit" IS NULL OR "carry_forward_limit" >= 0) AND ("carry_expiry_month" IS NULL OR "carry_expiry_month" >= 0));
ALTER TABLE "leave_entitlements" ADD CONSTRAINT "leave_entitlements_nonnegative" CHECK (("year" IS NULL OR "year" >= 0) AND ("days" IS NULL OR "days" >= 0));
ALTER TABLE "approval_decisions" ADD CONSTRAINT "approval_decisions_nonnegative" CHECK (("approval_level" IS NULL OR "approval_level" >= 0));
ALTER TABLE "attendance_payroll_inputs" ADD CONSTRAINT "attendance_payroll_inputs_nonnegative" CHECK (("amount" IS NULL OR "amount" >= 0));
ALTER TABLE "leave_attachments" ADD CONSTRAINT "leave_attachments_nonnegative" CHECK (("size" IS NULL OR "size" >= 0));
ALTER TABLE "employees" ADD CONSTRAINT "employees_dates_ordered" CHECK ("hire_date" IS NULL OR "employment_end_date" IS NULL OR "employment_end_date" >= "hire_date");
ALTER TABLE "loans" ADD CONSTRAINT "loans_dates_ordered" CHECK ("start_date" IS NULL OR "end_date" IS NULL OR "end_date" >= "start_date");
ALTER TABLE "leave" ADD CONSTRAINT "leave_dates_ordered" CHECK ("start_date" IS NULL OR "end_date" IS NULL OR "end_date" >= "start_date");
ALTER TABLE "shift_assignments" ADD CONSTRAINT "shift_assignments_dates_ordered" CHECK ("start_date" IS NULL OR "end_date" IS NULL OR "end_date" >= "start_date");
CREATE UNIQUE INDEX "users_company_email_ci" ON "users" ("company_id", lower("email")) WHERE "email" IS NOT NULL;
CREATE UNIQUE INDEX "employees_company_email_ci" ON "employees" ("company_id", lower("email")) WHERE "email" IS NOT NULL;
