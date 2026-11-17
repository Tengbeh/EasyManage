import type { Express, Request, Response } from "express";
import { Decimal } from "decimal.js";
import { ApiContext, filtered, listResponse } from "./context.js";
import { RequestData, type Row, publicRow } from "./repository.js";
import { wrap, requirePermission } from "./auth.js";
import { assert } from "./errors.js";
import { effectiveEmployee } from "./domain.js";
import { sanitizeEmployee } from "./permissions.js";
import { expandPayroll } from "./payroll.js";
import { querySchema } from "./validation.js";
const HR = [
  "employees",
  "active-employees",
  "inactive-employees",
  "new-employees",
  "departments",
  "terminations",
  "attendance",
  "leave",
];
const FINANCE = [
  "payroll",
  "annual-payroll",
  "salaries",
  "bonuses",
  "penalties",
  "loans",
  "loan-repayments",
  "outstanding-loans",
  "deductions",
  "gross-net",
];
export async function finalizedPayroll(d: RequestData) {
  const runs = new Set(
    (await d.list("Payroll_Runs"))
      .filter((r) => ["finalized", "paid"].includes(r.status))
      .map((r) => r.payroll_run_id),
  );
  return (await d.list("Payroll"))
    .filter((r) => runs.has(r.payroll_run_id) && r.status !== "void")
    .map(expandPayroll);
}
const pick = (row: Row, keys: string[]) =>
  Object.fromEntries(
    keys.filter((k) => row[k] !== undefined).map((k) => [k, row[k]]),
  );
export async function reportRows(
  req: Request,
  d: RequestData,
  type: string,
): Promise<{ rows: Row[]; dateField?: string }> {
  assert(
    [...HR, ...FINANCE].includes(type),
    404,
    "UNKNOWN_REPORT",
    "This report type does not exist.",
  );
  if (HR.includes(type)) requirePermission(req, "reports.hr");
  else if (
    ["payroll", "annual-payroll", "deductions", "gross-net"].includes(type)
  )
    assert(
      req.permissions.includes("reports.finance") ||
        req.permissions.includes("payroll.read"),
      403,
      "FORBIDDEN",
      "Financial reporting permission is required.",
    );
  else requirePermission(req, "reports.finance");
  const employees = await d.list("Employees");
  const departments = await d.list("Departments");
  const decorate = (r: Row): Row => {
    const e = employees.find((e) => e.employee_id === r.employee_id);
    return {
      ...publicRow(r),
      employee_name:
        r.employee_name || (e ? `${e.first_name} ${e.last_name}` : ""),
      employee_number: r.employee_number || e?.employee_number || "",
      department_id: r.department_id || e?.department_id || "",
      department_name:
        r.department_name ||
        departments.find(
          (x) => x.department_id === (r.department_id || e?.department_id),
        )?.department_name ||
        "",
    };
  };
  if (
    [
      "employees",
      "active-employees",
      "inactive-employees",
      "new-employees",
      "terminations",
    ].includes(type)
  ) {
    let rows = employees.map(effectiveEmployee);
    if (type === "active-employees")
      rows = rows.filter((r) => r.employment_status === "active");
    if (type === "inactive-employees")
      rows = rows.filter((r) =>
        ["inactive", "archived", "terminated"].includes(r.employment_status),
      );
    if (type === "terminations")
      rows = rows.filter((r) => r.employment_status === "terminated");
    return {
      rows: rows.map((r) =>
        decorate(sanitizeEmployee(publicRow(r), req.permissions)),
      ),
      dateField: type === "terminations" ? "employment_end_date" : "hire_date",
    };
  }
  if (type === "departments")
    return {
      rows: departments.map((r) => ({
        ...publicRow(r),
        employee_count: employees.filter(
          (e) => e.department_id === r.department_id,
        ).length,
      })),
    };
  if (type === "salaries") {
    requirePermission(req, "salaries.read");
    return {
      rows: employees.map((r) =>
        decorate(
          pick(r, [
            "employee_id",
            "employee_number",
            "first_name",
            "last_name",
            "department_id",
            "position",
            "basic_salary",
            "allowances",
            "payment_frequency",
            "employment_status",
          ]),
        ),
      ),
    };
  }
  const tableMap: Record<string, string> = {
    attendance: "Attendance",
    leave: "Leave",
    bonuses: "Bonuses",
    penalties: "Penalties",
    loans: "Loans",
    "outstanding-loans": "Loans",
    "loan-repayments": "Loan_Payments",
  };
  if (tableMap[type]) {
    let rows = await d.list(tableMap[type]);
    if (type === "outstanding-loans")
      rows = rows.filter(
        (r) =>
          r.status === "active" &&
          new Decimal(r.outstanding_balance || 0).gt(0),
      );
    return {
      rows: rows.map(decorate),
      dateField:
        type === "attendance"
          ? "date"
          : type === "loan-repayments"
            ? "payment_date"
            : ["bonuses", "penalties"].includes(type)
              ? "effective_month"
              : type === "leave"
                ? "start_date"
                : undefined,
    };
  }
  let rows: Row[] = (await finalizedPayroll(d)).map(decorate);
  if (type === "annual-payroll") {
    rows = filtered(
      rows,
      { ...req.query, page: 1, pageSize: 200 },
      "payroll_month",
    ).rows;
    const grouped = new Map<string, Row>();
    for (const row of rows) {
      const year = row.payroll_month.slice(0, 4);
      const key = `${year}:${row.employee_id}`;
      const g = grouped.get(key) || {
        employee_id: row.employee_id,
        employee_number: row.employee_number,
        employee_name: row.employee_name,
        department_id: row.department_id,
        department_name: row.department_name,
        year,
        payroll_month: year,
        months: 0,
        gross_salary: "0.00",
        bonuses: "0.00",
        penalties: "0.00",
        loan_deductions: "0.00",
        tax_deductions: "0.00",
        other_deductions: "0.00",
        total_deductions: "0.00",
        net_salary: "0.00",
      };
      g.months++;
      for (const k of [
        "gross_salary",
        "bonuses",
        "penalties",
        "loan_deductions",
        "tax_deductions",
        "other_deductions",
        "total_deductions",
        "net_salary",
      ])
        g[k] = new Decimal(g[k]).plus(row[k] || 0).toFixed(2);
      grouped.set(key, g);
    }
    return { rows: [...grouped.values()], dateField: "year" };
  }
  const common = [
    "payroll_id",
    "employee_id",
    "employee_number",
    "employee_name",
    "department_id",
    "department_name",
    "payroll_month",
    "payment_status",
  ];
  if (type === "deductions")
    return {
      rows: rows.map((r) =>
        pick(r, [
          ...common,
          "penalties",
          "loan_deductions",
          "tax_deductions",
          "other_deductions",
          "total_deductions",
        ]),
      ),
      dateField: "payroll_month",
    };
  if (type === "gross-net")
    return {
      rows: rows.map((r) =>
        pick(r, [...common, "gross_salary", "total_deductions", "net_salary"]),
      ),
      dateField: "payroll_month",
    };
  return {
    rows: rows.map((r) =>
      pick(r, [
        ...common,
        "basic_salary",
        "allowances",
        "bonuses",
        "gross_salary",
        "penalties",
        "loan_deductions",
        "other_deductions",
        "tax_deductions",
        "total_deductions",
        "net_salary",
      ]),
    ),
    dateField: "payroll_month",
  };
}
export const safeCell = (v: unknown) => {
  const s = typeof v === "object" ? JSON.stringify(v) : String(v ?? "");
  return /^[\s]*[=+@-]/.test(s) ? `'${s}` : s;
};
const label = (s: string) =>
  s.replaceAll("_", " ").replace(/\b\w/g, (c) => c.toUpperCase());
async function exportRows(
  res: Response,
  rows: Row[],
  type: string,
  format: string,
) {
  const excluded = new Set([
    "__row",
    "snapshot_json",
    "google_id",
    "permissions",
    "created_by",
    "approved_by",
    "updated_at",
  ]);
  const columns = [...new Set(rows.flatMap((r) => Object.keys(r)))].filter(
    (k) => !excluded.has(k),
  );
  const filename = `easymanage-${type}-${new Date().toISOString().slice(0, 10)}.${format}`;
  res.setHeader("Content-Disposition", `attachment; filename="${filename}"`);
  if (format === "csv") {
    res.type("text/csv; charset=utf-8");
    const escape = (v: unknown) => `"${safeCell(v).replaceAll('"', '""')}"`;
    res.send(
      "\ufeff" +
        [
          columns.map(label).map(escape).join(","),
          ...rows.map((r) => columns.map((c) => escape(r[c])).join(",")),
        ].join("\r\n"),
    );
    return;
  }
  if (format === "xlsx") {
    const { default: ExcelJS } = await import("exceljs");
    const workbook = new ExcelJS.Workbook();
    workbook.creator = "EasyManage";
    workbook.created = new Date();
    const sheet = workbook.addWorksheet("Report");
    sheet.columns = columns.map((c) => ({
      header: label(c),
      key: c,
      width: Math.min(42, Math.max(18, c.length + 5)),
    }));
    for (const row of rows)
      sheet.addRow(
        Object.fromEntries(columns.map((c) => [c, safeCell(row[c])])),
      );
    sheet.getRow(1).font = { bold: true, color: { argb: "FFFFFFFF" } };
    sheet.getRow(1).fill = {
      type: "pattern",
      pattern: "solid",
      fgColor: { argb: "FF15263D" },
    };
    sheet.views = [{ state: "frozen", ySplit: 1 }];
    if (columns.length)
      sheet.autoFilter = {
        from: { row: 1, column: 1 },
        to: { row: Math.max(rows.length + 1, 1), column: columns.length },
      };
    res.type(
      "application/vnd.openxmlformats-officedocument.spreadsheetml.sheet",
    );
    res.send(Buffer.from(await workbook.xlsx.writeBuffer()));
    return;
  }
  const { default: PDFDocument } = await import("pdfkit");
  const doc = new PDFDocument({
    size: "A4",
    layout: "landscape",
    margin: 32,
    bufferPages: true,
  });
  const chunks: Buffer[] = [];
  const finished = new Promise<Buffer>((resolve, reject) => {
    doc.on("data", (b) => chunks.push(b));
    doc.on("end", () => resolve(Buffer.concat(chunks)));
    doc.on("error", reject);
  });
  doc
    .fillColor("#15263D")
    .fontSize(20)
    .text(`EasyManage · ${label(type)}`);
  doc
    .fontSize(9)
    .fillColor("#64748b")
    .text(
      `Generated ${new Date().toISOString().slice(0, 10)} · ${rows.length} records`,
    );
  doc.moveDown();
  const display = columns.filter(
    (c) =>
      !c.endsWith("_id") &&
      !["profile_image", "company_logo", "created_at"].includes(c),
  );
  if (!rows.length) doc.text("No records match these filters.");
  for (const [index, row] of rows.entries()) {
    if (doc.y > 465) doc.addPage();
    doc
      .fillColor("#15263D")
      .fontSize(11)
      .text(
        `${index + 1}. ${row.employee_name || row.department_name || row.employee_number || "Record"}`,
      );
    doc.moveDown(0.2);
    for (let i = 0; i < display.length; i += 3) {
      if (doc.y > 510) doc.addPage();
      const y = doc.y;
      display.slice(i, i + 3).forEach((key, j) => {
        doc
          .fillColor("#475569")
          .fontSize(8)
          .text(
            `${label(key)}: ${String(row[key] ?? "").slice(0, 220)}`,
            32 + j * 260,
            y,
            { width: 245, height: 30, ellipsis: true },
          );
      });
      doc.y = y + 32;
    }
    doc.moveDown(0.4);
  }
  const pageRange = doc.bufferedPageRange();
  for (let i = 0; i < pageRange.count; i++) {
    doc.switchToPage(i);
    doc
      .fillColor("#64748b")
      .fontSize(8)
      .text(`EasyManage · ${i + 1} / ${pageRange.count}`, 32, 560, {
        lineBreak: false,
      });
  }
  doc.end();
  res.type("application/pdf");
  res.send(await finished);
}
export function installReporting(app: Express, ctx: ApiContext) {
  app.get(
    "/api/reports/:type",
    wrap(async (req, res) => {
      const query = querySchema.parse(req.query);
      const type = String(req.params.type);
      const result = await reportRows(
        req,
        new RequestData(ctx.repository),
        type,
      );
      const filters =
        type === "annual-payroll"
          ? { ...req.query, month: undefined }
          : req.query;
      if (query.format && query.format !== "json") {
        await exportRows(
          res,
          filtered(result.rows, filters, result.dateField).rows,
          type,
          query.format,
        );
        return;
      }
      listResponse(res, result.rows, filters, result.dateField);
    }),
  );
}
