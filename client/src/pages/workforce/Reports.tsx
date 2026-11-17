import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { Download } from "lucide-react";
import { request, downloadFile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  ErrorState,
  Loading,
  SectionCard,
} from "@/components/shared";
import { queryString, titleCase, formatDate, type Row } from "@/lib/utils";
import type { WorkforceFilters } from "./shared";
const kinds = [
  "attendance",
  "absence",
  "lateness",
  "overtime",
  "leave-utilization",
];
export function WorkforceReports({
  filters,
}: {
  filters: Partial<WorkforceFilters>;
}) {
  const [kind, setKind] = useState("attendance");
  const [page, setPage] = useState(1);
  const [exporting, setExporting] = useState("");
  const [error, setError] = useState<Error | null>(null);
  const params = {
    date_from: filters.date_from,
    date_to: filters.date_to,
    employee_id: filters.employee_id,
    department_id: filters.department_id,
  };
  const query = useQuery({
    queryKey: ["workforce/report", kind, params, page],
    queryFn: () =>
      request<Row[] | Row>(
        `/workforce/reports/${kind}?${queryString({ ...params, format: "json", page, pageSize: 20 })}`,
      ),
  });
  const data = query.data?.data;
  const rows: Row[] = Array.isArray(data) ? data : data?.rows || [];
  const keys = rows.length
    ? Object.keys(rows[0]).filter(
        (k) =>
          ![
            "company_id",
            "policy_snapshot",
            "breaks",
            "schedule_snapshot",
          ].includes(k),
      )
    : [];
  async function download(format: string) {
    setError(null);
    setExporting(format);
    try {
      await downloadFile(
        `/workforce/reports/${kind}?${queryString({ ...params, format })}`,
        `${kind}-${filters.date_from || "all"}-${filters.date_to || "dates"}.${format}`,
      );
    } catch (e) {
      setError(e as Error);
    } finally {
      setExporting("");
    }
  }
  return (
    <SectionCard
      title="Workforce reports"
      subtitle="Reports use the selected date range, employee, and department."
      action={
        <div className="row-actions">
          <label className="sr-only" htmlFor="workforce-report-kind">
            Report type
          </label>
          <select
            id="workforce-report-kind"
            className="input"
            value={kind}
            onChange={(e) => {
              setKind(e.target.value);
              setPage(1);
            }}
          >
            {kinds.map((k) => (
              <option key={k} value={k}>
                {titleCase(k.replaceAll("-", " "))}
              </option>
            ))}
          </select>
          {["csv", "xlsx", "pdf"].map((format) => (
            <Button
              key={format}
              size="sm"
              variant="outline"
              disabled={!!exporting || query.isPending}
              onClick={() => download(format)}
            >
              <Download size={14} />
              {exporting === format
                ? "Exporting…"
                : format === "xlsx"
                  ? "Excel"
                  : format.toUpperCase()}
            </Button>
          ))}
        </div>
      }
    >
      {error && <ErrorState error={error} />}{" "}
      {query.error ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : query.isPending ? (
        <Loading />
      ) : (
        <DataTable
          rows={rows.map((r, i) => ({
            ...r,
            _report_row_id: `${r.attendance_id || r.employee_id || i}:${r.leave_type_id || r.leave_id || i}`,
          }))}
          columns={keys.map((key) => ({
            key,
            label: titleCase(key),
            render: (r: Row) => {
              const value = r[key];
              if (value === null || value === undefined) return "—";
              if (typeof value === "object") return JSON.stringify(value);
              if (key === "date" || key.endsWith("_date"))
                return formatDate(value);
              return String(value);
            },
          }))}
          idKey="_report_row_id"
          page={page}
          pageSize={20}
          total={query.data?.meta?.total ?? rows.length}
          onPage={setPage}
          emptyTitle="No report data for this selection"
          emptyDescription="Adjust the filters or record attendance and leave to populate this report."
        />
      )}
    </SectionCard>
  );
}
