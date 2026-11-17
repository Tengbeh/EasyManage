import { useState } from "react";
import {
  BarChart3,
  Download,
  FileDown,
  FileSpreadsheet,
  FileText,
  Search,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { downloadReport, useList } from "@/lib/api";
import { monthNow, titleCase, type Row } from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  EmptyState,
  ErrorState,
  PageHeader,
  RelationSelect,
  Restricted,
  SectionCard,
} from "@/components/shared";
const hrReports = [
  "employees",
  "active-employees",
  "inactive-employees",
  "new-employees",
  "departments",
  "terminations",
  "attendance",
  "leave",
];
const financeReports = [
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
const labels: Row = {
  "gross-net": "Gross vs. net payroll",
  "new-employees": "New hires",
  "loan-repayments": "Loan repayments",
  "annual-payroll": "Annual payroll",
  "outstanding-loans": "Outstanding loans",
};
export function Reports() {
  const { can } = useAuth();
  const allowed = [
    ...(can("reports.hr") ? hrReports : []),
    ...(can("reports.finance") ? financeReports : []),
  ];
  const [type, setType] = useState(allowed[0] || "employees");
  const [month, setMonth] = useState(monthNow().slice(5));
  const [year, setYear] = useState(monthNow().slice(0, 4));
  const [department, setDepartment] = useState("");
  const [employee, setEmployee] = useState("");
  const [selected, setSelected] = useState<Row | null>(null);
  const [page, setPage] = useState(1);
  const [downloading, setDownloading] = useState("");
  const filters = {
    month,
    year,
    department_id: department,
    employee_id: employee,
  };
  const q = useList(
    `reports/${selected?.type || type}`,
    { ...selected?.filters, page, pageSize: 25 },
    !!selected,
  );
  const departments = useList(
    "departments",
    { pageSize: 200 },
    can("employees.read"),
  );
  if (!allowed.length) return <Restricted />;
  const rows = q.data?.data || [];
  const columns = rows.length
    ? Object.keys(rows[0])
        .filter(
          (k) =>
            !k.endsWith("_json") &&
            ![
              "profile_image",
              "snapshot",
              "installment_allocations",
              "bonus_ids",
              "penalty_ids",
            ].includes(k),
        )
        .map((key) => ({
          key,
          label: titleCase(key),
          render: (r: Row) =>
            typeof r[key] === "object"
              ? JSON.stringify(r[key])
              : String(r[key] ?? "—"),
        }))
    : [];
  const exportFile = async (format: string) => {
    if (!selected) return;
    setDownloading(format);
    try {
      await downloadReport(selected.type, selected.filters, format);
      toast.success("Report downloaded");
    } catch (e) {
      toast.error(e instanceof Error ? e.message : "Export failed");
    } finally {
      setDownloading("");
    }
  };
  return (
    <>
      <PageHeader
        eyebrow="INSIGHTS & EXPORTS"
        title="Reports"
        description="Turn your workforce and payroll records into useful, shareable reports."
      />
      <div className="report-layout">
        <div className="report-sidebar card">
          <div className="card-header">
            <h2>Report library</h2>
            <FileText size={18} className="muted" />
          </div>
          {can("reports.hr") && (
            <>
              <span className="report-group">PEOPLE & OPERATIONS</span>
              {hrReports.map((t) => (
                <button
                  key={t}
                  className={type === t ? "active" : ""}
                  onClick={() => setType(t)}
                >
                  <span>{labels[t] || titleCase(t.replaceAll("-", " "))}</span>
                  {type === t && <span className="nav-active-dot" />}
                </button>
              ))}
            </>
          )}
          {can("reports.finance") && (
            <>
              <span className="report-group">FINANCE & PAYROLL</span>
              {financeReports.map((t) => (
                <button
                  key={t}
                  className={type === t ? "active" : ""}
                  onClick={() => setType(t)}
                >
                  <span>{labels[t] || titleCase(t.replaceAll("-", " "))}</span>
                  {type === t && <span className="nav-active-dot" />}
                </button>
              ))}
            </>
          )}
        </div>
        <div className="report-main">
          <SectionCard
            title={labels[type] || titleCase(type.replaceAll("-", " "))}
            subtitle="Choose the records to include in your report"
          >
            <div className="report-filters">
              <div className="field">
                <label htmlFor="report-month">Month</label>
                <select
                  className="input"
                  id="report-month"
                  value={month}
                  onChange={(e) => setMonth(e.target.value)}
                >
                  <option value="">All months</option>
                  {Array.from({ length: 12 }, (_, i) => (
                    <option key={i} value={String(i + 1).padStart(2, "0")}>
                      {new Intl.DateTimeFormat("en", { month: "long" }).format(
                        new Date(2024, i, 1),
                      )}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label htmlFor="report-year">Year</label>
                <input
                  className="input"
                  id="report-year"
                  type="number"
                  min="1900"
                  max="9999"
                  value={year}
                  onChange={(e) => setYear(e.target.value)}
                />
              </div>
              <div className="field">
                <label htmlFor="report-department">Department</label>
                <select
                  className="input"
                  id="report-department"
                  value={department}
                  onChange={(e) => setDepartment(e.target.value)}
                >
                  <option value="">All departments</option>
                  {departments.data?.data.map((d) => (
                    <option key={d.department_id} value={d.department_id}>
                      {d.department_name}
                    </option>
                  ))}
                </select>
              </div>
              <div className="field">
                <label>Employee</label>
                <RelationSelect
                  field={{
                    name: "employee_id",
                    label: "Employee",
                    relation: "employees",
                  }}
                  value={employee}
                  onChange={setEmployee}
                />
              </div>
            </div>
            <div className="report-filter-footer">
              <p>
                <ShieldCheck size={14} />
                {[
                  "payroll",
                  "annual-payroll",
                  "deductions",
                  "gross-net",
                ].includes(type)
                  ? "Payroll reports use finalized snapshots."
                  : "Reports reflect the records you have permission to access."}
              </p>
              <Button
                disabled={!/^\d{4}$/.test(year)}
                onClick={() => {
                  setSelected({ type, filters });
                  setPage(1);
                }}
              >
                <Search size={16} />
                Preview report
              </Button>
            </div>
          </SectionCard>
          <SectionCard
            title="Report preview"
            subtitle={
              selected
                ? `${labels[selected.type] || titleCase(selected.type.replaceAll("-", " "))} · ${q.data?.meta?.total ?? "—"} records`
                : "Run a report to preview its contents"
            }
            action={
              selected && (
                <div className="export-actions">
                  {["pdf", "xlsx", "csv"].map((format) => (
                    <Button
                      key={format}
                      size="sm"
                      variant="outline"
                      disabled={
                        !!downloading ||
                        q.isPending ||
                        q.isError ||
                        !rows.length
                      }
                      onClick={() => exportFile(format)}
                    >
                      <Download size={14} />
                      {downloading === format
                        ? "Exporting…"
                        : format === "xlsx"
                          ? "Excel"
                          : format.toUpperCase()}
                    </Button>
                  ))}
                </div>
              )
            }
          >
            {!selected ? (
              <EmptyState
                icon={BarChart3}
                title="Your report is ready to build"
                description="Select a report, apply your filters, and choose Preview report."
              />
            ) : q.isError ? (
              <ErrorState error={q.error} retry={() => q.refetch()} />
            ) : (
              <DataTable
                rows={rows}
                columns={columns}
                loading={q.isPending}
                page={page}
                pageSize={25}
                total={q.data?.meta?.total}
                onPage={setPage}
                emptyTitle="No records for these filters"
                emptyDescription="Try another period, department, or employee."
              />
            )}
          </SectionCard>
        </div>
      </div>
    </>
  );
}
