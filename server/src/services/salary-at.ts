type Row = Record<string, any>;
const first = (...values: unknown[]) =>
  values.find((v) => v !== undefined && v !== null && v !== "") ?? "0";
/** Uses the original baseline before the first dated change, including imported histories. */
export function salaryAt(employee: Row, history: Row[], date: string) {
  const ordered = history
    .filter((h) => h.employee_id === employee.employee_id)
    .sort(
      (a, b) =>
        String(a.effective_date).localeCompare(String(b.effective_date)) ||
        String(a.created_at || "").localeCompare(String(b.created_at || "")),
    );
  const applicable = ordered.filter((h) => h.effective_date <= date).at(-1),
    baseline = ordered[0];
  return {
    basic_salary: String(
      applicable
        ? first(
            applicable.basic_salary,
            applicable.new_amount,
            applicable.new_salary,
          )
        : first(
            baseline?.previous_amount,
            baseline?.previous_salary,
            employee.basic_salary,
          ),
    ),
    payment_frequency:
      applicable?.payment_frequency ||
      baseline?.previous_payment_frequency ||
      employee.payment_frequency ||
      "monthly",
    effective_date: applicable?.effective_date || employee.hire_date,
  };
}
