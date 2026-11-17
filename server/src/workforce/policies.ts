import type { Express } from "express";
import { ApiContext } from "../context.js";
import { RequestData, type Row } from "../repository.js";
import { wrap, requirePermission } from "../auth.js";
import { assert } from "../errors.js";
import * as V from "./validation.js";
import { access, has, uid, stamp, respondList, joined } from "./shared.js";
export function installPolicies(app: Express, ctx: ApiContext) {
  const definitions = [
    ["schedules", "Work_Schedules", "schedule_id", V.scheduleSchema],
    ["assignments", "Shift_Assignments", "assignment_id", V.assignmentSchema],
    ["holidays", "Holidays", "holiday_id", V.holidaySchema],
    ["leave-types", "Leave_Types", "leave_type_id", V.leaveTypeSchema],
    [
      "entitlements",
      "Leave_Entitlements",
      "entitlement_id",
      V.entitlementSchema,
    ],
  ] as const;
  for (const [path, table, id, schema] of definitions) {
    app.get(
      `/api/workforce/${path}`,
      wrap(async (req, res) => {
        assert(
          has(req, "attendance.read") ||
            has(req, "self.attendance") ||
            has(req, "leave.read") ||
            has(req, "self.leave") ||
            has(req, "workforce.manage"),
          403,
          "FORBIDDEN",
          "You do not have access to workforce policies.",
        );
        const d = new RequestData(ctx.repository);
        let rows = await d.list(table);
        if (["assignments", "entitlements"].includes(path)) {
          if (!has(req, "workforce.manage"))
            rows = rows.filter((r) => r.employee_id === req.user.employee_id);
          rows = await joined(d, rows);
        }
        const departments = await d.list("Departments");
        const schedules = path === "assignments" ? await d.list("Work_Schedules") : [];
        const types = path === "entitlements" ? await d.list("Leave_Types") : [];
        rows = rows.map(r => ({...r, department_name: departments.find(x => x.department_id === r.department_id)?.department_name || "", ...(path === "assignments" ? {schedule_name:schedules.find(x=>x.schedule_id===r.schedule_id)?.name || ""} : {}), ...(path === "entitlements" ? {leave_type_name:types.find(x=>x.leave_type_id===r.leave_type_id)?.name || ""} : {})}));
        respondList(res, rows, req.query);
      }),
    );
    for (const method of ["post", "put"] as const)
      app[method](
        `/api/workforce/${path}${method === "put" ? "/:id" : ""}`,
        wrap(async (req, res) => {
          requirePermission(req, "workforce.manage");
          await ctx.mutate(req, res, async (d) => {
            const previous =
              method === "put"
                ? await d.find(table, String(req.params.id))
                : undefined;
            const body = schema.parse({
              ...Object.fromEntries(
                Object.entries(previous || {}).filter(
                  ([k]) => k in (schema as any).shape,
                ),
              ),
              ...req.body,
            });
            // Parse only schema fields: server metadata is never writable.
            const row: Row = {
              ...previous,
              ...body,
              [id]: previous?.[id] || uid(),
              created_at: previous?.created_at || stamp(),
              updated_at: stamp(),
            };
            if (row.department_id)
              await d.find("Departments", row.department_id);
            if (row.employee_id) await d.find("Employees", row.employee_id);
            if (path === "assignments") {
              await d.find("Work_Schedules", row.schedule_id);
              assert(
                !(await d.list(table)).some(
                  (r) =>
                    r[id] !== row[id] &&
                    r.employee_id === row.employee_id &&
                    r.start_date <= (row.end_date || "9999") &&
                    (!r.end_date || r.end_date >= row.start_date),
                ),
                409,
                "OVERLAPPING_SCHEDULE",
                "This employee already has an assignment in this date range.",
              );
            }
            if (path === "schedules" && row.is_default !== false)
              assert(
                !(await d.list(table)).some(
                  (r) =>
                    r[id] !== row[id] &&
                    r.status !== "inactive" &&
                    r.is_default !== false &&
                    row.status !== "inactive" &&
                    (r.department_id || "") === (row.department_id || ""),
                ),
                409,
                "SCHEDULE_DEFAULT_EXISTS",
                "Only one active default schedule is allowed per department. Assign individual shifts using assignments.",
              );
            if (path === "entitlements") {
              await d.find("Leave_Types", row.leave_type_id);
              assert(
                !(await d.list(table)).some(
                  (r) =>
                    r[id] !== row[id] &&
                    r.employee_id === row.employee_id &&
                    r.leave_type_id === row.leave_type_id &&
                    Number(r.year) === row.year,
                ),
                409,
                "ENTITLEMENT_EXISTS",
                "An entitlement for this employee, type and year already exists. Edit it instead.",
              );
            }
            return {
              data: row,
              changes: [{ table, record: row }],
              previous,
              entity: path,
              id: row[id],
              status: method === "post" ? 201 : 200,
            };
          });
        }),
      );
  }
}
