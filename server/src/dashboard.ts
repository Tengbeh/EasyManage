import type { Express, Request } from "express";
import { randomUUID } from "node:crypto";
import { Decimal } from "decimal.js";
import { ApiContext, listResponse } from "./context.js";
import { RequestData, publicRow, type Row } from "./repository.js";
import { wrap } from "./auth.js";
import { assert } from "./errors.js";
import { effectiveEmployee } from "./domain.js";
import { sanitizeEmployee } from "./permissions.js";
import { month } from "./validation.js";
const sum = (rows: Row[], field: string) =>
  rows.reduce((s, r) => s.plus(r[field] || 0), new Decimal(0)).toFixed(2);
const recent = (rows: Row[], key = "created_at", n = 5) =>
  [...rows]
    .sort((a, b) => String(b[key] || "").localeCompare(String(a[key] || "")))
    .slice(0, n)
    .map(publicRow);
export async function notificationRows(
  req: Request,
  d: RequestData,
): Promise<Row[]> {
  const result: Row[] = [];
  const stamp = new Date().toISOString();
  const today = stamp.slice(0, 10);
  const currentMonth = today.slice(0, 7);
  const recentCutoff = new Date(Date.now() - 30 * 86400000).toISOString();
  const soon = new Date(Date.now() + 30 * 86400000).toISOString().slice(0, 10);
  const add = (
    id: string,
    title: string,
    message: string,
    href: string,
    created_at: string,
    type: string,
  ) =>
    result.push({
      notification_id: id,
      title,
      message,
      href,
      created_at: created_at || stamp,
      type,
    });
  if (req.permissions.includes("employees.read")) {
    const employees = (await d.list("Employees")).map(effectiveEmployee);
    for (const e of employees.filter(
      (e) =>
        e.employment_end_date &&
        e.employment_end_date >= today &&
        e.employment_end_date <= soon,
    ))
      add(
        `end:${e.employee_id}:${e.employment_end_date}`,
        "Employment ending soon",
        `${e.first_name} ${e.last_name} · ${e.employment_end_date}`,
        `/employees/${e.employee_id}`,
        e.updated_at,
        "employment",
      );
    for (const e of employees.filter(
      (e) => String(e.created_at) >= recentCutoff,
    ))
      add(
        `employee:${e.employee_id}`,
        "New employee registered",
        `${e.first_name} ${e.last_name} joined the directory.`,
        `/employees/${e.employee_id}`,
        e.created_at,
        "employee",
      );
  }
  if (req.permissions.includes("payroll.read"))
    for (const r of (await d.list("Payroll_Runs")).filter(
      (r) =>
        ["finalized", "paid"].includes(r.status) &&
        String(r.finalized_at || r.updated_at || r.created_at) >= recentCutoff,
    ))
      add(
        `finalized:${r.payroll_run_id}`,
        "Payroll finalized",
        `Payroll for ${r.payroll_month} has been finalized.`,
        "/payroll",
        r.finalized_at || r.updated_at || r.created_at,
        "payroll",
      );
  for (const [table, permission, path, title, idField] of [
    [
      "Bonuses",
      "bonuses.approve",
      "bonuses",
      "Bonus awaiting approval",
      "bonus_id",
    ],
    [
      "Penalties",
      "penalties.approve",
      "penalties",
      "Penalty awaiting approval",
      "penalty_id",
    ],
    ["Loans", "loans.approve", "loans", "Loan awaiting approval", "loan_id"],
    ["Leave", "leave.approve", "leave", "Leave awaiting approval", "leave_id"],
    [
      "Payroll_Runs",
      "payroll.approve",
      "payroll",
      "Payroll awaiting approval",
      "payroll_run_id",
    ],
  ])
    if (req.permissions.includes(permission)) {
      for (const r of (await d.list(table)).filter(
        (r) =>
          r.status ===
          (table === "Payroll_Runs" ? "pending_approval" : "pending"),
      ))
        add(
          `approval:${table}:${r[idField]}`,
          title,
          table === "Payroll_Runs"
            ? `Payroll for ${r.payroll_month}`
            : "Review the pending request.",
          `/${path}`,
          r.created_at,
          "approval",
        );
    }
  if (req.permissions.includes("loans.read"))
    for (const i of (await d.list("Loan_Installments")).filter(
      (i) => ["pending", "partial"].includes(i.status) && i.due_date <= soon,
    ))
      add(
        `${i.due_date < today ? "overdue" : "upcoming"}:${i.installment_id}`,
        i.due_date < today
          ? "Overdue loan installment"
          : "Upcoming loan installment",
        `Payment due ${i.due_date}`,
        "/loans",
        i.created_at,
        "loan",
      );
  if (
    req.permissions.includes("payroll.generate") &&
    !(await d.list("Payroll_Runs")).some(
      (r) => r.payroll_month === currentMonth,
    )
  )
    add(
      `payroll-reminder:${currentMonth}`,
      "Payroll reminder",
      `Prepare payroll for ${currentMonth}.`,
      "/payroll",
      `${currentMonth}-01T00:00:00.000Z`,
      "payroll",
    );
  const read = new Set(
    (await d.list("Notifications_Read"))
      .filter((r) => r.user_id === req.user.user_id)
      .map((r) => r.notification_id),
  );
  return result.map((r) => ({
    ...r,
    read: read.has(r.notification_id),
    is_read: read.has(r.notification_id),
  }));
}
export function installDashboard(app: Express, ctx: ApiContext) {
  app.get(
    "/api/notifications",
    wrap(async (req, res) => {
      listResponse(
        res,
        await notificationRows(req, new RequestData(ctx.repository)),
        req.query,
      );
    }),
  );
  app.patch(
    "/api/notifications/:id/read",
    wrap(async (req, res) => {
      await ctx.mutate(req, res, async (d) => {
        const notifications = await notificationRows(req, d);
        const notification = notifications.find(
          (n) => n.notification_id === req.params.id,
        );
        assert(notification, 404, "NOT_FOUND", "Notification was not found.");
        const previous = (await d.list("Notifications_Read")).find(
          (r) =>
            r.user_id === req.user.user_id &&
            r.notification_id === req.params.id,
        );
        const record = {
          notification_read_id: previous?.notification_read_id || randomUUID(),
          user_id: req.user.user_id,
          notification_id: notification.notification_id,
          read_at: new Date().toISOString(),
        };
        return {
          data: { ...notification, read: true, is_read: true },
          changes: [{ table: "Notifications_Read", record }],
          entity: "notifications",
          id: notification.notification_id,
        };
      });
    }),
  );
  app.get(
    "/api/dashboard",
    wrap(async (req, res) => {
      const selected = month.parse(
        req.query.month || new Date().toISOString().slice(0, 7),
      );
      const d = new RequestData(ctx.repository);
      const can = (p: string) => req.permissions.includes(p);
      const data: Row = {
        metrics: {},
        payroll_trend: [],
        department_distribution: [],
        status_distribution: [],
        bonus_penalty_trend: [],
        loan_repayments: [],
        recent_employees: [],
        recent_activity: [],
        pending_approvals: [],
        upcoming_end_dates: [],
        recent_adjustments: [],
        upcoming_installments: [],
      };
      let employees: Row[] = [];
      if (can("employees.read")) {
        employees = (await d.list("Employees")).map(effectiveEmployee);
        const departments = await d.list("Departments");
        data.metrics.total_employees = employees.length;
        data.metrics.active_employees = employees.filter(
          (e) => e.employment_status === "active",
        ).length;
        data.metrics.inactive_employees = employees.filter((e) =>
          ["inactive", "terminated", "archived"].includes(e.employment_status),
        ).length;
        const todayStatus = new Date().toISOString().slice(0, 10);
        const leaveIds = new Set(
          (await d.list("Leave"))
            .filter(
              (r) =>
                r.status === "approved" &&
                r.start_date <= todayStatus &&
                r.end_date >= todayStatus,
            )
            .map((r) => r.employee_id),
        );
        employees = employees.map((e) =>
          leaveIds.has(e.employee_id) && e.employment_status === "active"
            ? { ...e, employment_status: "on_leave" }
            : e,
        );
        data.metrics.active_employees = employees.filter(
          (e) => e.employment_status === "active",
        ).length;
        data.metrics.on_leave = employees.filter(
          (e) => e.employment_status === "on_leave",
        ).length;
        data.department_distribution = departments.map((r) => ({
          name: r.department_name,
          value: employees.filter((e) => e.department_id === r.department_id)
            .length,
        }));
        data.status_distribution = [
          ...new Set(employees.map((e) => e.employment_status)),
        ].map((status) => ({
          name: status,
          value: employees.filter((e) => e.employment_status === status).length,
        }));
        data.recent_employees = recent(employees).map((e) =>
          sanitizeEmployee(e, req.permissions),
        );
        const today = new Date().toISOString().slice(0, 10);
        const soon = new Date(Date.now() + 30 * 86400000)
          .toISOString()
          .slice(0, 10);
        data.upcoming_end_dates = employees
          .filter(
            (e) =>
              e.employment_end_date >= today && e.employment_end_date <= soon,
          )
          .map((e) => sanitizeEmployee(publicRow(e), req.permissions));
      }
      if (can("payroll.read")) {
        const all = await d.list("Payroll_Runs");
        const runs = all.filter((r) =>
          ["finalized", "paid"].includes(r.status),
        );
        const current = runs.filter((r) => r.payroll_month === selected);
        data.metrics.monthly_gross_payroll = sum(current, "total_gross_salary");
        data.metrics.monthly_net_payroll = sum(current, "total_net_payroll");
        data.metrics.pending_payroll_approvals = all.filter(
          (r) => r.status === "pending_approval",
        ).length;
        data.payroll_trend = runs
          .sort((a, b) => a.payroll_month.localeCompare(b.payroll_month))
          .slice(-12)
          .map((r) => ({
            month: r.payroll_month,
            gross: r.total_gross_salary,
            net: r.total_net_payroll,
          }));
      }
      let bonuses: Row[] = [];
      let penalties: Row[] = [];
      if (can("bonuses.read")) {
        bonuses = await d.list("Bonuses");
        data.metrics.total_bonuses = sum(
          bonuses.filter(
            (r) => r.effective_month === selected && r.status === "approved",
          ),
          "amount",
        );
        data.recent_adjustments.push(
          ...recent(bonuses).map((r) => ({ ...r, type: "bonus" })),
        );
      }
      if (can("penalties.read")) {
        penalties = await d.list("Penalties");
        data.metrics.total_penalties = sum(
          penalties.filter(
            (r) => r.effective_month === selected && r.status === "approved",
          ),
          "amount",
        );
        data.recent_adjustments.push(
          ...recent(penalties).map((r) => ({ ...r, type: "penalty" })),
        );
      }
      const months = [
        ...new Set([...bonuses, ...penalties].map((r) => r.effective_month)),
      ]
        .filter(Boolean)
        .sort()
        .slice(-12);
      data.bonus_penalty_trend = months.map((month) => ({
        month,
        ...(can("bonuses.read")
          ? {
              bonuses: sum(
                bonuses.filter(
                  (r) => r.effective_month === month && r.status === "approved",
                ),
                "amount",
              ),
            }
          : {}),
        ...(can("penalties.read")
          ? {
              penalties: sum(
                penalties.filter(
                  (r) => r.effective_month === month && r.status === "approved",
                ),
                "amount",
              ),
            }
          : {}),
      }));
      if (can("loans.read")) {
        const loans = await d.list("Loans");
        data.metrics.outstanding_loans = sum(
          loans.filter((l) => l.status === "active"),
          "outstanding_balance",
        );
        const payments = await d.list("Loan_Payments");
        const paymentMonths = [
          ...new Set(payments.map((p) => String(p.payment_date).slice(0, 7))),
        ]
          .sort()
          .slice(-12);
        data.loan_repayments = paymentMonths.map((month) => ({
          month,
          amount: sum(
            payments.filter((p) => p.payment_date.startsWith(month)),
            "amount",
          ),
        }));
        const today = new Date().toISOString().slice(0, 10);
        data.upcoming_installments = (await d.list("Loan_Installments"))
          .filter(
            (i) =>
              ["pending", "partial"].includes(i.status) && i.due_date >= today,
          )
          .sort((a, b) => a.due_date.localeCompare(b.due_date))
          .slice(0, 8)
          .map(publicRow);
      }
      if (can("audit.read"))
        data.recent_activity = recent(
          await d.list("Audit_Logs"),
          "timestamp",
          8,
        );
      else
        data.recent_activity = recent(
          [
            ...employees.map((e) => ({
              action: "Employee registered",
              module: "employees",
              timestamp: e.created_at,
              record_id: e.employee_id,
              summary: `${e.first_name} ${e.last_name}`,
            })),
            ...bonuses.map((r) => ({
              action: "Bonus recorded",
              module: "bonuses",
              timestamp: r.created_at,
              record_id: r.bonus_id,
              summary: r.status,
            })),
            ...penalties.map((r) => ({
              action: "Penalty recorded",
              module: "penalties",
              timestamp: r.created_at,
              record_id: r.penalty_id,
              summary: r.status,
            })),
          ],
          "timestamp",
          8,
        );
      data.pending_approvals = (await notificationRows(req, d))
        .filter((n) => n.type === "approval")
        .slice(0, 10);
      res.json({ data });
    }),
  );
}
