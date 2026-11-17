/** Explicit development-only fixture written to a real configured spreadsheet. Never a fallback. */
import { createHash, randomUUID } from "node:crypto";
import { readConfig } from "../config.js";
import { SheetsRepository, RequestData, type Change } from "../repository.js";
import { acquireWriterLock } from "../writer-lock.js";
import { defaultSettings } from "../domain.js";
import { calculatePayroll } from "../services/payroll-engine.js";
import { payrollInput, payrollRecord } from "../payroll.js";
const config = readConfig();
if (config.production || process.env.NODE_ENV !== "development")
  throw new Error(
    "Demo seed requires NODE_ENV=development. Production seeding is forbidden.",
  );
if (
  process.env.SEED_DEMO_CONFIRM !== "WRITE_FICTIONAL_DATA_TO_DEVELOPMENT_SHEETS"
)
  throw new Error(
    "Set SEED_DEMO_CONFIRM=WRITE_FICTIONAL_DATA_TO_DEVELOPMENT_SHEETS after verifying the development spreadsheet ID.",
  );
const release = await acquireWriterLock(config.spreadsheetId);
try {
  const repo = new SheetsRepository(config);
  await repo.initialize();
  for (const table of [
    "Employees",
    "Departments",
    "Loans",
    "Bonuses",
    "Penalties",
    "Payroll",
    "Payroll_Runs",
  ])
    if ((await repo.list(table)).length)
      throw new Error(`Refusing to seed: ${table} already contains data.`);
  const stamp = new Date().toISOString();
  const month = stamp.slice(0, 7);
  const departments = ["Operations", "Engineering", "Finance"].map(
    (department_name) => ({
      department_id: randomUUID(),
      department_name,
      description: "Fictional development department",
      status: "active",
      created_at: stamp,
    }),
  );
  const people = [
    "Avery Chen",
    "Jordan Taylor",
    "Morgan Patel",
    "Sam Rivera",
    "Casey Brooks",
    "Riley Kim",
    "Jamie Reed",
    "Alex Parker",
    "Quinn Davis",
    "Taylor Evans",
  ].map((name, i) => {
    const [first_name, last_name] = name.split(" ");
    return {
      employee_id: randomUUID(),
      employee_number: `DEMO-${String(i + 1).padStart(3, "0")}`,
      first_name,
      last_name,
      email: `demo-${i + 1}@example.test`,
      department_id: departments[i % 3].department_id,
      position: [
        "Operations specialist",
        "Software engineer",
        "Finance analyst",
      ][i % 3],
      employment_type: i === 9 ? "contract" : "full_time",
      hire_date: "2025-01-01",
      employment_status: i === 8 ? "on_leave" : i === 9 ? "inactive" : "active",
      basic_salary: `${3000 + i * 250}.00`,
      allowances: "100.00",
      payment_frequency: "monthly",
      created_at: stamp,
      updated_at: stamp,
    };
  });
  const loan = {
    loan_id: randomUUID(),
    employee_id: people[1].employee_id,
    loan_amount: "1200.00",
    installment_amount: "200.00",
    installment_frequency: "monthly",
    outstanding_balance: "1200.00",
    start_date: `${month}-20`,
    status: "active",
    description: "Fictional development advance",
    approved_by: "development-seed",
    created_at: stamp,
  };
  const changes: Change[] = [
    ...departments.map((record) => ({ table: "Departments", record })),
    ...people.map((record) => ({ table: "Employees", record })),
    ...people.map((e) => ({
      table: "Salary_History",
      record: {
        salary_history_id: randomUUID(),
        employee_id: e.employee_id,
        basic_salary: e.basic_salary,
        allowances: e.allowances,
        payment_frequency: e.payment_frequency,
        previous_amount: e.basic_salary,
        previous_allowances: e.allowances,
        previous_payment_frequency: e.payment_frequency,
        effective_date: e.hire_date,
        reason: "Development starting salary",
        changed_by: "development-seed",
        created_at: stamp,
      },
    })),
    {
      table: "Bonuses",
      record: {
        bonus_id: randomUUID(),
        employee_id: people[0].employee_id,
        bonus_type: "performance",
        amount: "250.00",
        description: "Fictional development recognition",
        effective_month: month,
        status: "approved",
        approved_by: "development-seed",
        created_by: "development-seed",
        created_at: stamp,
      },
    },
    {
      table: "Penalties",
      record: {
        penalty_id: randomUUID(),
        employee_id: people[2].employee_id,
        penalty_type: "other",
        amount: "25.00",
        description: "Fictional documented deduction",
        effective_month: month,
        status: "approved",
        approved_by: "development-seed",
        created_by: "development-seed",
        created_at: stamp,
      },
    },
    { table: "Loans", record: loan },
  ];
  for (let i = 0; i < 6; i++) {
    const start = new Date(`${month}-20T00:00:00Z`);
    start.setUTCMonth(start.getUTCMonth() + i);
    const due = start.toISOString().slice(0, 10);
    changes.push({
      table: "Loan_Installments",
      record: {
        installment_id: randomUUID(),
        loan_id: loan.loan_id,
        employee_id: loan.employee_id,
        installment_number: i + 1,
        installment_amount: "200.00",
        due_date: due,
        amount_paid: "0.00",
        remaining_balance: "200.00",
        status: "pending",
        created_at: stamp,
      },
    });
  }
  changes.push(
    {
      table: "Bonuses",
      record: {
        bonus_id: randomUUID(),
        employee_id: people[3].employee_id,
        bonus_type: "recognition",
        amount: "150.00",
        description: "Fictional pending recognition",
        effective_month: month,
        status: "pending",
        created_by: "development-seed",
        created_at: stamp,
      },
    },
    {
      table: "Penalties",
      record: {
        penalty_id: randomUUID(),
        employee_id: people[4].employee_id,
        penalty_type: "late_attendance",
        amount: "15.00",
        description: "Fictional pending documented deduction",
        effective_month: month,
        status: "pending",
        created_by: "development-seed",
        created_at: stamp,
      },
    },
    {
      table: "Loans",
      record: {
        loan_id: randomUUID(),
        employee_id: people[5].employee_id,
        loan_amount: "600.00",
        installment_amount: "100.00",
        installment_frequency: "monthly",
        outstanding_balance: "600.00",
        start_date: `${month}-25`,
        status: "pending",
        description: "Fictional advance awaiting approval",
        created_by: "development-seed",
        created_at: stamp,
      },
    },
  );
  if (!(await repo.list("Company_Settings")).length)
    changes.push({
      table: "Company_Settings",
      record: {
        ...defaultSettings(),
        company_name: "Fictional Development Company",
        updated_at: stamp,
      },
    });
  changes.push({
    table: "Audit_Logs",
    record: {
      log_id: randomUUID(),
      user_id: "development-seed",
      action: "seed_development_data",
      module: "system",
      record_id: "development-fixture",
      new_value: JSON.stringify({ employees: 10, departments: 3 }),
      timestamp: stamp,
      created_at: stamp,
    },
  });
  await repo.commit(changes);
  const input = await payrollInput(new RequestData(repo), month);
  const calculated = calculatePayroll(input);
  const run = {
    payroll_run_id: randomUUID(),
    payroll_month: month,
    status: "draft",
    ...calculated.totals,
    source_hash: createHash("sha256")
      .update(JSON.stringify(input))
      .digest("hex"),
    warnings_json: JSON.stringify(calculated.warnings),
    generated_by: "development-seed",
    revision: 1,
    created_at: stamp,
    updated_at: stamp,
  };
  await repo.commit([
    { table: "Payroll_Runs", record: run },
    ...calculated.rows.map((row) => ({
      table: "Payroll",
      record: payrollRecord(row, run),
    })),
    {
      table: "Audit_Logs",
      record: {
        log_id: randomUUID(),
        user_id: "development-seed",
        action: "seed_draft_payroll",
        module: "payroll",
        record_id: run.payroll_run_id,
        new_value: JSON.stringify(calculated.totals),
        timestamp: stamp,
        created_at: stamp,
      },
    },
  ]);
  console.log(
    "Seeded 10 fictional employees, 3 departments, salary histories, two bonuses, two penalties, two loans with six scheduled installments, and an unpaid draft payroll in the configured development spreadsheet. No login bypass was created.",
  );
} finally {
  await release();
}
