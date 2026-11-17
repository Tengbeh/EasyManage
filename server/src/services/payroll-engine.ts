import { salaryAt } from "./salary-at.js";
/** Pure payroll calculator. Decimal strings enter and leave this boundary.
 * Monthly salaries and allowances are prorated by eligible calendar days in the
 * configured cycle. payroll_month identifies the month the cycle ends in.
 * Weekly = seven calendar days; daily = each eligible calendar day.
 * No writes, approvals, payments or clock-dependent decisions occur here.
 */
import { Decimal } from "decimal.js";

type Row = Record<string, any>;
export interface PayrollInput {
  payroll_month: string;
  employees: Row[];
  salary_history: Row[];
  bonuses: Row[];
  penalties: Row[];
  loans: Row[];
  installments: Row[];
  settings: Row;
  existing_payroll?: Row[];
}
const D = Decimal.clone({ precision: 40, rounding: Decimal.ROUND_HALF_UP });
const zero = () => new D(0);
const firstValue = (...values: unknown[]) =>
  values.find(
    (value) => value !== undefined && value !== null && value !== "",
  ) ?? "0";
function amount(value: unknown, label: string): Decimal {
  const str =
    value === undefined || value === null || value === "" ? "0" : String(value);
  if (!/^\d{1,12}(?:\.\d{1,2})?$/.test(str))
    throw new Error(
      `${label} must be a non-negative amount with at most two decimal places.`,
    );
  return new D(str);
}
const sum = (items: Decimal[]) => items.reduce((a, b) => a.plus(b), zero());
const money = (value: Decimal) =>
  value.toDecimalPlaces(2, Decimal.ROUND_HALF_UP).toFixed(2);
function isoDate(value: string, label: string): string {
  if (
    !/^\d{4}-\d{2}-\d{2}$/.test(value) ||
    Number.isNaN(Date.parse(`${value}T00:00:00Z`)) ||
    new Date(`${value}T00:00:00Z`).toISOString().slice(0, 10) !== value
  )
    throw new Error(`${label} must be a valid ISO date.`);
  return value;
}
function json(value: any, fallback: any) {
  if (!value) return fallback;
  if (typeof value === "string") {
    try {
      return JSON.parse(value);
    } catch {
      throw new Error("Invalid stored payroll configuration.");
    }
  }
  return value;
}
function unique(rows: Row[], field: string): Row[] {
  const ids = new Set<string>();
  return rows.filter((row) => {
    const id = row[field];
    if (!id) throw new Error(`A payroll source is missing ${field}.`);
    if (ids.has(id)) return false;
    ids.add(id);
    return true;
  });
}
function percent(value: unknown, label: string): Decimal {
  const n = amount(value, label);
  if (n.gt(100)) throw new Error(`${label} cannot exceed 100%.`);
  return n;
}

export function calculatePayroll(input: PayrollInput) {
  if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(input.payroll_month))
    throw new Error("Payroll month must use YYYY-MM.");
  const [year, month] = input.payroll_month.split("-").map(Number);
  if (year! < 1900 || year! > 9999)
    throw new Error("Payroll year is outside the supported range.");
  const startDay = Number(input.settings.payroll_start_day || 1);
  const endDay = Number(input.settings.payroll_end_day || 31);
  if (
    ![startDay, endDay].every(
      (day) => Number.isInteger(day) && day >= 1 && day <= 31,
    )
  )
    throw new Error("Payroll cycle days must be between 1 and 31.");
  const cycleDate = (offset: number, day: number) => {
    const first = new Date(Date.UTC(year!, month! - 1 + offset, 1));
    const lastDay = new Date(
      Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
    ).getUTCDate();
    first.setUTCDate(Math.min(day, lastDay));
    return first.toISOString().slice(0, 10);
  };
  const start = cycleDate(startDay > endDay ? -1 : 0, startDay);
  const end = cycleDate(0, endDay);
  const startTime = Date.parse(`${start}T00:00:00Z`);
  const days =
    Math.round((Date.parse(`${end}T00:00:00Z`) - startTime) / 86400000) + 1;
  const cfg = json(input.settings.configured_deductions, {});
  const taxPercent = percent(cfg.tax_percent, "Tax rate");
  const limitPercent = percent(
    cfg.deduction_limit_percent ?? "100",
    "Deduction review limit",
  );
  const warnings: string[] = [];
  const consumedBonuses = new Set<string>();
  const consumedPenalties = new Set<string>();
  const consumedInstallments = new Set<string>();
  for (const past of input.existing_payroll ?? []) {
    for (const id of json(past.bonus_ids, [])) consumedBonuses.add(id);
    for (const id of json(past.penalty_ids, [])) consumedPenalties.add(id);
    for (const x of json(past.installment_allocations, []))
      consumedInstallments.add(x.installment_id);
  }
  const rows: Row[] = [];
  const employees = unique(input.employees, "employee_id");
  for (const e of employees) {
    const hire = isoDate(
      e.hire_date,
      `${e.employee_number || e.employee_id} hire date`,
    );
    const termination = e.employment_end_date
      ? isoDate(e.employment_end_date, "Employment end date")
      : null;
    if (termination && termination < hire)
      throw new Error("Employment end date cannot precede hire date.");
    if (hire > end || (termination && termination < start)) continue;
    if (
      ["inactive", "archived", "terminated"].includes(e.employment_status) &&
      !termination
    )
      continue;
    const first = hire > start ? hire : start;
    const last = termination && termination < end ? termination : end;
    const history = input.salary_history
      .filter((h) => h.employee_id === e.employee_id)
      .sort(
        (a, b) =>
          String(a.effective_date).localeCompare(String(b.effective_date)) ||
          String(a.created_at).localeCompare(String(b.created_at)),
      );
    history.forEach((h) => isoDate(h.effective_date, "Salary effective date"));
    let salary = zero();
    let allowances = zero();
    let eligibleDays = 0;
    for (let day = 0; day < days; day++) {
      const date = new Date(startTime + day * 86400000)
        .toISOString()
        .slice(0, 10);
      if (date < first || date > last) continue;
      eligibleDays++;
      const applicable = history.filter((h) => h.effective_date <= date).at(-1);
      const baseline = history[0];
      const resolvedSalary = salaryAt(e, history, date);
      const rate = amount(resolvedSalary.basic_salary, "Basic salary");
      const frequency = resolvedSalary.payment_frequency;
      let divisor = days;
      if (frequency === "weekly") divisor = 7;
      else if (frequency === "daily") divisor = 1;
      else if (frequency !== "monthly") {
        const customDays = Number(cfg.frequency_days?.[frequency]);
        if (!Number.isInteger(customDays) || customDays < 1 || customDays > 366)
          throw new Error(
            `Configure calendar days per cycle for payment frequency ${frequency}.`,
          );
        divisor = customDays;
      }
      salary = salary.plus(rate.div(divisor));
      const allowanceValue = applicable
        ? firstValue(applicable.allowances, cfg.allowances)
        : firstValue(
            baseline?.previous_allowances,
            e.allowances,
            cfg.allowances,
          );
      allowances = allowances.plus(
        amount(allowanceValue, "Allowances").div(days),
      );
    }
    salary = new D(money(salary));
    allowances = new D(money(allowances));
    const bonuses = unique(
      input.bonuses.filter(
        (b) =>
          b.employee_id === e.employee_id &&
          b.effective_month === input.payroll_month &&
          b.status === "approved" &&
          !consumedBonuses.has(b.bonus_id),
      ),
      "bonus_id",
    );
    const penalties = unique(
      input.penalties.filter(
        (p) =>
          p.employee_id === e.employee_id &&
          p.effective_month === input.payroll_month &&
          p.status === "approved" &&
          !consumedPenalties.has(p.penalty_id),
      ),
      "penalty_id",
    );
    if (penalties.some((p) => !String(p.description || p.reason || "").trim()))
      throw new Error("Every approved penalty must have a documented reason.");
    const bonus = sum(bonuses.map((b) => amount(b.amount, "Bonus")));
    const penalty = sum(penalties.map((p) => amount(p.amount, "Penalty")));
    const gross = salary.plus(allowances).plus(bonus);
    const loanBalances = new Map<string, Decimal>();
    const loans = input.loans.filter(
      (l) =>
        l.employee_id === e.employee_id &&
        ["active", "approved"].includes(l.status),
    );
    loans.forEach((l) =>
      loanBalances.set(
        l.loan_id,
        amount(l.outstanding_balance, "Loan balance"),
      ),
    );
    const allocations: Row[] = [];
    const installments = unique(
      input.installments.filter(
        (i) => i.employee_id === e.employee_id && loanBalances.has(i.loan_id),
      ),
      "installment_id",
    ).sort(
      (a, b) =>
        a.due_date.localeCompare(b.due_date) ||
        a.installment_id.localeCompare(b.installment_id),
    );
    for (const inst of installments) {
      const due = isoDate(inst.due_date, "Installment due date");
      if (
        due > end ||
        ["paid", "reserved", "cancelled", "deducted"].includes(inst.status) ||
        inst.payroll_run_id ||
        inst.applied_payroll_run_id ||
        consumedInstallments.has(inst.installment_id)
      )
        continue;
      const scheduled = amount(inst.installment_amount, "Installment");
      const paid = amount(inst.amount_paid, "Installment amount paid");
      if (paid.gt(scheduled))
        throw new Error("An installment payment exceeds its scheduled amount.");
      const balance = loanBalances.get(inst.loan_id)!;
      const take = Decimal.min(scheduled.minus(paid), balance);
      if (take.gt(0)) {
        allocations.push({
          installment_id: inst.installment_id,
          loan_id: inst.loan_id,
          amount: money(take),
        });
        loanBalances.set(inst.loan_id, balance.minus(take));
      }
    }
    const loanDeduction = sum(allocations.map((a) => new D(a.amount)));
    const tax = new D(money(gross.mul(taxPercent).div(100)));
    const other = amount(cfg.other_deductions, "Other authorized deductions");
    const deductions = penalty.plus(loanDeduction).plus(tax).plus(other);
    const net = gross.minus(deductions);
    if (net.lt(0))
      throw new Error(
        `Deductions exceed gross salary for ${e.employee_number || e.employee_id}. Review deductions before generating payroll.`,
      );
    const requiresReview = deductions.gt(gross.mul(limitPercent).div(100));
    if (requiresReview)
      warnings.push(
        `${e.employee_number || e.employee_id}: deductions exceed the configured ${limitPercent.toString()}% review limit.`,
      );
    rows.push({
      employee_id: e.employee_id,
      employee_number: e.employee_number,
      employee_name: `${e.first_name} ${e.last_name}`,
      department_id: e.department_id,
      payroll_month: input.payroll_month,
      basic_salary: money(salary),
      allowances: money(allowances),
      bonuses: money(bonus),
      gross_salary: money(gross),
      penalties: money(penalty),
      loan_deductions: money(loanDeduction),
      other_deductions: money(other),
      tax_deductions: money(tax),
      total_deductions: money(deductions),
      net_salary: money(net),
      payment_status: "unpaid",
      bonus_ids: bonuses.map((b) => b.bonus_id),
      penalty_ids: penalties.map((p) => p.penalty_id),
      installment_allocations: allocations,
      eligible_days: eligibleDays,
      period_days: days,
      period_start: start,
      period_end: end,
      requires_review: requiresReview,
      calculation_policy: {
        proration: "calendar_days",
        rounding: "half_up_2dp",
        tax_percent: taxPercent.toString(),
        deduction_limit_percent: limitPercent.toString(),
      },
    });
  }
  const total = (field: string) => money(sum(rows.map((r) => new D(r[field]))));
  return {
    rows,
    totals: {
      total_employees: rows.length,
      total_basic_salary: total("basic_salary"),
      total_allowances: total("allowances"),
      total_bonuses: total("bonuses"),
      total_gross_salary: total("gross_salary"),
      total_penalties: total("penalties"),
      total_loan_deductions: total("loan_deductions"),
      total_deductions: total("total_deductions"),
      total_net_payroll: total("net_salary"),
    },
    warnings,
  };
}
