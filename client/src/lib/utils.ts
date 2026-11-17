import { clsx, type ClassValue } from "clsx";
import { twMerge } from "tailwind-merge";
export const cn = (...inputs: ClassValue[]) => twMerge(clsx(inputs));
export type Row = Record<string, any>;
export const titleCase = (s: unknown) =>
  String(s ?? "")
    .replaceAll("_", " ")
    .replace(/\b\w/g, (c) => c.toUpperCase());
export const personName = (r?: Row) =>
  r?.full_name ||
  r?.name ||
  [r?.first_name, r?.last_name].filter(Boolean).join(" ") ||
  r?.email ||
  "Employee";
export const initials = (name: string) =>
  name
    .split(/\s+/)
    .slice(0, 2)
    .map((n) => n[0])
    .join("")
    .toUpperCase() || "EM";
let displayPreferences: { date_format?: string; timezone?: string } = {};
export function setDisplayPreferences(preferences: {
  date_format?: string;
  timezone?: string;
}) {
  displayPreferences = preferences;
}
export const formatDate = (value: unknown) => {
  if (!value) return "—";
  const input = String(value);
  const date = new Date(input);
  if (Number.isNaN(date.getTime())) return input;
  const timeZone = /^\d{4}-\d{2}-\d{2}$/.test(input)
    ? "UTC"
    : displayPreferences.timezone || "UTC";
  try {
    if (displayPreferences.date_format) {
      const parts = new Intl.DateTimeFormat("en", {
        year: "numeric",
        month: "2-digit",
        day: "2-digit",
        timeZone,
      }).formatToParts(date);
      const get = (type: string) =>
        parts.find((p) => p.type === type)?.value || "";
      const y = get("year"),
        m = get("month"),
        d = get("day");
      if (displayPreferences.date_format === "DD/MM/YYYY")
        return `${d}/${m}/${y}`;
      if (displayPreferences.date_format === "MM/DD/YYYY")
        return `${m}/${d}/${y}`;
      return `${y}-${m}-${d}`;
    }
    return new Intl.DateTimeFormat("en", {
      day: "numeric",
      month: "short",
      year: "numeric",
      timeZone,
    }).format(date);
  } catch {
    return input;
  }
};
export const formatDateTime = (value: unknown) => {
  if (!value) return "—";
  try {
    return (
      formatDate(value) +
      " · " +
      new Intl.DateTimeFormat("en", {
        hour: "2-digit",
        minute: "2-digit",
        timeZone: displayPreferences.timezone || "UTC",
      }).format(new Date(String(value)))
    );
  } catch {
    return String(value);
  }
};
export const monthNow = () => new Date().toISOString().slice(0, 7);
export const today = () => new Date().toISOString().slice(0, 10);
export const monthLabel = (month: string) =>
  new Intl.DateTimeFormat("en", {
    month: "long",
    year: "numeric",
    timeZone: "UTC",
  }).format(new Date(`${month}-01T00:00:00Z`));
export function formatMoney(value: unknown, currency = "USD", compact = false) {
  if (value === undefined || value === null || value === "") return "—";
  const n = Number(value);
  if (!Number.isFinite(n)) return "—";
  try {
    return new Intl.NumberFormat("en", {
      style: "currency",
      currency,
      ...(compact
        ? { notation: "compact", maximumFractionDigits: 1 }
        : { minimumFractionDigits: 2, maximumFractionDigits: 2 }),
    }).format(n);
  } catch {
    return `${n.toFixed(2)} ${currency}`;
  }
}
export const queryString = (values: Row) => {
  const p = new URLSearchParams();
  Object.entries(values).forEach(([k, v]) => {
    if (v !== "" && v !== undefined && v !== null) p.set(k, String(v));
  });
  return p.toString();
};

export function formatActivity(action: unknown, module?: unknown) {
  const raw = String(action || "");
  if (!/^(POST|PUT|PATCH|DELETE)\s/i.test(raw))
    return titleCase(raw || module || "Record updated");
  const [method, path = ""] = raw.split(/\s+/, 2);
  const segment = path.split("/").filter(Boolean);
  const resource = String(module || segment[1] || "record").toLowerCase();
  const names: Record<string, string> = {
    employees: "Employee",
    departments: "Department",
    bonuses: "Bonus",
    penalties: "Penalty",
    loans: "Loan",
    leave: "Leave request",
    attendance: "Attendance",
    users: "User access",
    payroll: "Payroll",
    settings: "Company settings",
    salary: "Salary",
    loan_payments: "Loan payment",
    notifications: "Notification",
  };
  const subject = names[resource] || titleCase(resource);
  const operation = segment.at(-1);
  const verbs: Record<string, string> = {
    approve: "approved",
    reject: "rejected",
    submit: "submitted for approval",
    finalize: "finalized",
    paid: "marked as paid",
    generate: "draft generated",
    preview: "previewed",
    revise: "recalculated",
    adjustments: "adjusted",
    status: "status changed",
    read: "marked as read",
  };
  if (operation === "salary") return "Salary adjusted";
  if (operation === "payments") return "Loan payment recorded";
  if (operation && verbs[operation]) return `${subject} ${verbs[operation]}`;
  return `${subject} ${method === "POST" ? "added" : method === "DELETE" ? "removed" : "updated"}`;
}
