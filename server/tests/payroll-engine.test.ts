import test from "node:test";
import assert from "node:assert/strict";
import {
  calculatePayroll,
  type PayrollInput,
} from "../src/services/payroll-engine.js";
const employee = {
  employee_id: "e1",
  employee_number: "EMP001",
  first_name: "Amina",
  last_name: "Cole",
  department_id: "d1",
  hire_date: "2025-01-01",
  employment_status: "active",
  basic_salary: "3100.00",
  payment_frequency: "monthly",
};
const input = (extra: Partial<PayrollInput> = {}): PayrollInput => ({
  payroll_month: "2026-01",
  employees: [employee],
  salary_history: [],
  bonuses: [],
  penalties: [],
  loans: [],
  installments: [],
  settings: { configured_deductions: {} },
  ...extra,
});
test("transparent decimal-safe calculation includes only approved adjustments", () => {
  const r = calculatePayroll(
    input({
      bonuses: [
        {
          bonus_id: "b1",
          employee_id: "e1",
          effective_month: "2026-01",
          status: "approved",
          amount: "100.10",
        },
        {
          bonus_id: "b2",
          employee_id: "e1",
          effective_month: "2026-01",
          status: "pending",
          amount: "999.99",
        },
      ],
      penalties: [
        {
          penalty_id: "p1",
          employee_id: "e1",
          effective_month: "2026-01",
          status: "approved",
          amount: "20.20",
          description: "Approved deduction",
        },
      ],
      settings: {
        configured_deductions: {
          allowances: "50.30",
          tax_percent: "10",
          other_deductions: "1.10",
        },
      },
    }),
  );
  assert.equal(r.rows[0].gross_salary, "3250.40");
  assert.equal(r.rows[0].tax_deductions, "325.04");
  assert.equal(r.rows[0].total_deductions, "346.34");
  assert.equal(r.rows[0].net_salary, "2904.06");
  assert.equal(r.rows[0].payment_status, "unpaid");
});
test("deduplicates bonus ids and excludes previously snapshotted adjustments", () => {
  const b = {
    bonus_id: "b1",
    employee_id: "e1",
    effective_month: "2026-01",
    status: "approved",
    amount: "10.00",
  };
  assert.equal(
    calculatePayroll(input({ bonuses: [b, b] })).rows[0].bonuses,
    "10.00",
  );
  assert.equal(
    calculatePayroll(
      input({ bonuses: [b], existing_payroll: [{ bonus_ids: ["b1"] }] }),
    ).rows[0].bonuses,
    "0.00",
  );
});
test("hire and termination boundaries are inclusive and past terminated employees remain eligible for historical runs", () => {
  const e = {
    ...employee,
    hire_date: "2026-01-16",
    employment_end_date: "2026-01-20",
    employment_status: "terminated",
  };
  assert.equal(
    calculatePayroll(input({ employees: [e] })).rows[0].basic_salary,
    "500.00",
  );
  assert.equal(
    calculatePayroll(input({ payroll_month: "2026-02", employees: [e] })).rows
      .length,
    0,
  );
});
test("salary history restores previous amount and prorates effective changes", () => {
  const r = calculatePayroll(
    input({
      employees: [{ ...employee, basic_salary: "6200.00" }],
      salary_history: [
        {
          employee_id: "e1",
          effective_date: "2026-01-16",
          previous_amount: "3100.00",
          basic_salary: "6200.00",
          payment_frequency: "monthly",
        },
      ],
    }),
  );
  assert.equal(r.rows[0].basic_salary, "4700.00");
  assert.equal(
    calculatePayroll(
      input({
        payroll_month: "2025-12",
        employees: [{ ...employee, basic_salary: "6200.00" }],
        salary_history: [
          {
            employee_id: "e1",
            effective_date: "2026-01-16",
            previous_amount: "3100.00",
            basic_salary: "6200.00",
          },
        ],
      }),
    ).rows[0].basic_salary,
    "3100.00",
  );
});
test("loan installments deduct only unpaid amount and cap to loan balance", () => {
  const r = calculatePayroll(
    input({
      loans: [
        {
          loan_id: "l1",
          employee_id: "e1",
          status: "active",
          outstanding_balance: "75.00",
        },
      ],
      installments: [
        {
          installment_id: "i1",
          loan_id: "l1",
          employee_id: "e1",
          due_date: "2026-01-10",
          installment_amount: "100.00",
          amount_paid: "40.00",
          status: "partial",
        },
        {
          installment_id: "i2",
          loan_id: "l1",
          employee_id: "e1",
          due_date: "2026-01-20",
          installment_amount: "100.00",
          amount_paid: "0.00",
          status: "pending",
        },
      ],
    }),
  );
  assert.equal(r.rows[0].loan_deductions, "75.00");
  assert.deepEqual(
    r.rows[0].installment_allocations.map((x: any) => x.amount),
    ["60.00", "15.00"],
  );
});
test("reserved, future, paid, and previously allocated installments cannot be included", () => {
  const base = {
    loan_id: "l1",
    employee_id: "e1",
    installment_amount: "100.00",
    amount_paid: "0.00",
    due_date: "2026-01-01",
  };
  const r = calculatePayroll(
    input({
      loans: [
        {
          loan_id: "l1",
          employee_id: "e1",
          status: "active",
          outstanding_balance: "900.00",
        },
      ],
      installments: [
        { ...base, installment_id: "i1", status: "reserved" },
        { ...base, installment_id: "i2", status: "paid" },
        {
          ...base,
          installment_id: "i3",
          status: "pending",
          due_date: "2026-02-01",
        },
        { ...base, installment_id: "i4", status: "pending" },
      ],
      existing_payroll: [
        { installment_allocations: [{ installment_id: "i4" }] },
      ],
    }),
  );
  assert.equal(r.rows[0].loan_deductions, "0.00");
});
test("rounds currency half-up after prorating, with exact totals", () => {
  const employees = Array.from({ length: 3 }, (_, i) => ({
    ...employee,
    employee_id: `e${i}`,
    basic_salary: "0.10",
    hire_date: "2026-01-17",
  }));
  const r = calculatePayroll(input({ employees }));
  assert.equal(r.rows[0].basic_salary, "0.05");
  assert.equal(r.totals.total_gross_salary, "0.15");
});
test("weekly and daily salary conversion is explicit", () => {
  assert.equal(
    calculatePayroll(
      input({
        employees: [
          { ...employee, payment_frequency: "weekly", basic_salary: "700.00" },
        ],
      }),
    ).rows[0].basic_salary,
    "3100.00",
  );
  assert.equal(
    calculatePayroll(
      input({
        employees: [
          { ...employee, payment_frequency: "daily", basic_salary: "100.00" },
        ],
      }),
    ).rows[0].basic_salary,
    "3100.00",
  );
  assert.throws(
    () =>
      calculatePayroll(
        input({ employees: [{ ...employee, payment_frequency: "custom" }] }),
      ),
    /Configure calendar/,
  );
});
test("policy threshold flags review; negative net and unreasoned penalties block calculation", () => {
  const p = {
    penalty_id: "p1",
    employee_id: "e1",
    effective_month: "2026-01",
    status: "approved",
    amount: "400.00",
    description: "Policy-reviewed deduction",
  };
  assert.equal(
    calculatePayroll(
      input({
        penalties: [p],
        settings: { configured_deductions: { deduction_limit_percent: "10" } },
      }),
    ).rows[0].requires_review,
    true,
  );
  assert.throws(
    () => calculatePayroll(input({ penalties: [{ ...p, amount: "4000.00" }] })),
    /Deductions exceed/,
  );
  assert.throws(
    () => calculatePayroll(input({ penalties: [{ ...p, description: "" }] })),
    /documented reason/,
  );
});
test("invalid calendar dates, precision, negative rates and invalid percentages are rejected", () => {
  assert.throws(
    () =>
      calculatePayroll(
        input({ employees: [{ ...employee, hire_date: "2026-02-30" }] }),
      ),
    /valid ISO/,
  );
  for (const value of ["-1.00", "NaN", "1.001", "1e3"])
    assert.throws(
      () =>
        calculatePayroll(
          input({ employees: [{ ...employee, basic_salary: value }] }),
        ),
      /non-negative amount/,
    );
  assert.throws(
    () =>
      calculatePayroll(
        input({ settings: { configured_deductions: { tax_percent: "101" } } }),
      ),
    /exceed 100/,
  );
});
test("empty workforce is a valid zero payroll preview", () => {
  const r = calculatePayroll(input({ employees: [] }));
  assert.equal(r.totals.total_net_payroll, "0.00");
  assert.equal(r.totals.total_employees, 0);
});
test("empty optional spreadsheet cells use company allowance defaults", () => {
  const r = calculatePayroll(
    input({
      employees: [{ ...employee, allowances: "" }],
      settings: { configured_deductions: { allowances: "155.00" } },
    }),
  );
  assert.equal(r.rows[0].allowances, "155.00");
  const explicitZero = calculatePayroll(
    input({
      employees: [{ ...employee, allowances: "0.00" }],
      settings: { configured_deductions: { allowances: "155.00" } },
    }),
  );
  assert.equal(explicitZero.rows[0].allowances, "0.00");
});
test("configured payroll cycle ends in selected month and crosses year boundaries safely", () => {
  const r = calculatePayroll(
    input({
      settings: { payroll_start_day: 26, payroll_end_day: 25 },
      employees: [{ ...employee, hire_date: "2026-01-01" }],
    }),
  );
  assert.equal(r.rows[0].period_start, "2025-12-26");
  assert.equal(r.rows[0].period_end, "2026-01-25");
  assert.equal(r.rows[0].period_days, 31);
  assert.equal(r.rows[0].eligible_days, 25);
  assert.equal(r.rows[0].basic_salary, "2500.00");
});
test("payroll cycle clips to actual month length including leap day", () => {
  const r = calculatePayroll(
    input({
      payroll_month: "2028-02",
      settings: { payroll_start_day: 1, payroll_end_day: 31 },
    }),
  );
  assert.equal(r.rows[0].period_end, "2028-02-29");
  assert.equal(r.rows[0].period_days, 29);
  assert.equal(r.rows[0].basic_salary, "3100.00");
});
