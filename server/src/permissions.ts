export const PERMISSIONS = [
  "employees.read",
  "employees.write",
  "salaries.read",
  "salaries.write",
  "banking.read",
  "banking.write",
  "departments.write",
  "bonuses.read",
  "bonuses.write",
  "bonuses.approve",
  "penalties.read",
  "penalties.write",
  "penalties.approve",
  "loans.read",
  "loans.write",
  "loans.approve",
  "payroll.read",
  "payroll.generate",
  "payroll.approve",
  "payroll.finalize",
  "payroll.pay",
  "workforce.manage",
  "attendance.approve",
  "attendance.payroll",
  "self.attendance",
  "self.leave",
  "attendance.read",
  "attendance.write",
  "leave.read",
  "leave.write",
  "leave.approve",
  "reports.hr",
  "reports.finance",
  "users.manage",
  "settings.manage",
  "audit.read",
] as const;
export type Permission = (typeof PERMISSIONS)[number];
export const ROLE_PERMISSIONS: Record<string, readonly string[]> = {
  administrator: PERMISSIONS,
  employee: ["self.attendance", "self.leave"],
  hr: [
    "workforce.manage",
    "attendance.approve",
    "self.attendance",
    "self.leave",
    "employees.read",
    "employees.write",
    "salaries.read",
    "salaries.write",
    "banking.read",
    "banking.write",
    "departments.write",
    "bonuses.read",
    "bonuses.write",
    "penalties.read",
    "penalties.write",
    "attendance.read",
    "attendance.write",
    "leave.read",
    "leave.write",
    "leave.approve",
    "reports.hr",
  ],
  accountant: [
    "attendance.read",
    "attendance.payroll",
    "self.attendance",
    "self.leave",
    "employees.read",
    "salaries.read",
    "salaries.write",
    "banking.read",
    "bonuses.read",
    "bonuses.write",
    "penalties.read",
    "penalties.write",
    "loans.read",
    "loans.write",
    "loans.approve",
    "payroll.read",
    "payroll.generate",
    "payroll.finalize",
    "payroll.pay",
    "reports.finance",
  ],
};
export function parseJSON<T>(v: unknown, fallback: T): T {
  if (typeof v === "string") {
    try {
      return JSON.parse(v);
    } catch {
      return fallback;
    }
  }
  return (v ?? fallback) as T;
}
export function permissions(user: Record<string, any>): string[] {
  return [
    ...new Set([
      ...(ROLE_PERMISSIONS[user.role] || []),
      ...parseJSON<string[]>(user.permissions, []).filter((p) =>
        PERMISSIONS.includes(p as Permission),
      ),
    ]),
  ];
}
export function sanitizeEmployee(row: Record<string, any>, p: string[]) {
  const out = { ...row };
  if (!p.includes("salaries.read"))
    for (const k of ["basic_salary", "allowances", "payment_frequency"])
      delete out[k];
  if (!p.includes("banking.read"))
    for (const k of [
      "account_number",
      "bank_name",
      "bank_account_number",
      "bank_account_name",
      "bank_branch",
      "bank_code",
    ])
      delete out[k];
  return out;
}
