import { useQuery } from "@tanstack/react-query";
import { useRef, useState, type ReactNode } from "react";
import { useAction, useList, request, type Operation } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { Button } from "@/components/ui/button";
import {
  DataTable,
  EmptyState,
  ErrorState,
  Loading,
  RelationSelect,
  SearchInput,
  Status,
  type Column,
} from "@/components/shared";
import {
  formatDateTime,
  personName,
  titleCase,
  queryString,
  type Row,
} from "@/lib/utils";
import { dateRange, duration } from "./model";
import { RefreshCw } from "lucide-react";

export function useWorkforceAction(message = "Changes saved") {
  const action = useAction(message);
  const pending = useRef<{ signature: string; key: string } | null>(null);
  const run = (operation: Operation, onSuccess?: (data: Row) => void) => {
    const signature = JSON.stringify(operation);
    if (pending.current?.signature !== signature)
      pending.current = { signature, key: crypto.randomUUID() };
    action.mutate(
      { ...operation, key: pending.current.key },
      {
        onSuccess: (r) => {
          pending.current = null;
          onSuccess?.(r.data);
        },
      },
    );
  };
  return { ...action, run };
}
export type WorkforceFilters = {
  date_from: string;
  date_to: string;
  employee_id: string;
  department_id: string;
  status: string;
  schedule_id: string;
};
export function initialFilters(): WorkforceFilters {
  return {
    ...dateRange(),
    employee_id: "",
    department_id: "",
    status: "",
    schedule_id: "",
  };
}
export function FilterBar({
  filters,
  onChange,
  employee = true,
  department = true,
  schedule = false,
  statuses = [],
  dates = true,
  fixedEmployeeId,
}: {
  filters: WorkforceFilters;
  onChange: (f: WorkforceFilters) => void;
  employee?: boolean;
  department?: boolean;
  schedule?: boolean;
  statuses?: string[];
  dates?: boolean;
  fixedEmployeeId?: string;
}) {
  const { can } = useAuth();
  const update = (key: keyof WorkforceFilters, value: string) =>
    onChange({ ...filters, [key]: value });
  return (
    <div className="workforce-filters card" aria-label="Workforce filters">
      {dates && (
        <>
          <div className="field">
            <label htmlFor="workforce-from">From</label>
            <input
              id="workforce-from"
              className="input"
              type="date"
              value={filters.date_from}
              onChange={(e) => update("date_from", e.target.value)}
            />
          </div>
          <div className="field">
            <label htmlFor="workforce-to">To</label>
            <input
              id="workforce-to"
              className="input"
              type="date"
              min={filters.date_from}
              value={filters.date_to}
              onChange={(e) => update("date_to", e.target.value)}
            />
          </div>
        </>
      )}
      {employee && can("employees.read") && !fixedEmployeeId && (
        <div className="field">
          <label htmlFor="field-workforce_employee">Employee</label>
          <RelationSelect
            field={{
              name: "workforce_employee",
              label: "Employee",
              relation: "employees",
            }}
            value={filters.employee_id}
            onChange={(v) => update("employee_id", v)}
          />
        </div>
      )}
      {department && can("employees.read") && !fixedEmployeeId && (
        <div className="field">
          <label htmlFor="field-workforce_department">Department</label>
          <RelationSelect
            field={{
              name: "workforce_department",
              label: "Department",
              relation: "departments",
            }}
            value={filters.department_id}
            onChange={(v) => update("department_id", v)}
          />
        </div>
      )}
      {schedule && (
        <div className="field">
          <label htmlFor="field-workforce_schedule">Schedule</label>
          <RelationSelect
            field={{
              name: "workforce_schedule",
              label: "Schedule",
              relation: "workforce/schedules",
              relationId: "schedule_id",
              relationLabel: "name",
            }}
            value={filters.schedule_id}
            onChange={(v) => update("schedule_id", v)}
          />
        </div>
      )}
      {statuses.length > 0 && (
        <div className="field">
          <label htmlFor="workforce-status">Status</label>
          <select
            id="workforce-status"
            className="input"
            value={filters.status}
            onChange={(e) => update("status", e.target.value)}
          >
            <option value="">All statuses</option>
            {statuses.map((s) => (
              <option key={s} value={s}>
                {titleCase(s)}
              </option>
            ))}
          </select>
        </div>
      )}
      <Button
        variant="ghost"
        size="sm"
        onClick={() => onChange(initialFilters())}
      >
        <RefreshCw size={14} />
        Reset filters
      </Button>
      {filters.date_from &&
        filters.date_to &&
        filters.date_to < filters.date_from && (
          <p role="alert" className="field-error field-wide">
            The end date must be on or after the start date.
          </p>
        )}
    </div>
  );
}
export function RecordList({
  resource,
  filters = {},
  columns,
  idKey,
  title,
  action,
  emptyDescription,
  enabled = true,
  searchable = true,
}: {
  resource: string;
  filters?: Row;
  columns: Column[];
  idKey: string;
  title: string;
  action?: ReactNode;
  emptyDescription?: string;
  enabled?: boolean;
  searchable?: boolean;
}) {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const query = useList(
    `workforce/${resource}`,
    { ...filters, search, page, pageSize: 20 },
    enabled,
  );
  const allRows = query.data?.data || [];
  const localRows = query.data?.meta
    ? allRows
    : allRows.filter(
        (r) =>
          !search ||
          Object.values(r).some((v) =>
            String(v).toLowerCase().includes(search.toLowerCase()),
          ),
      );
  const total = query.data?.meta?.total ?? localRows.length;
  const rows = (
    query.data?.meta ? localRows : localRows.slice((page - 1) * 20, page * 20)
  ).map((r, i) => ({
    ...r,
    _workforce_row_id: `${r[idKey] || i}:${r.employee_id || ""}:${r.year || ""}`,
  }));
  return (
    <div className="card">
      <div className="table-toolbar">
        <h2>
          {title}
          <span className="count-badge">{query.isPending ? "—" : total}</span>
        </h2>
        <div className="toolbar-right">
          {searchable && (
            <SearchInput
              value={search}
              onChange={(s) => {
                setSearch(s);
                setPage(1);
              }}
              placeholder={`Search ${title.toLowerCase()}…`}
            />
          )}{" "}
          {action}
        </div>
      </div>
      {query.isError ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : (
        <DataTable
          rows={rows}
          columns={columns}
          idKey="_workforce_row_id"
          loading={query.isPending}
          page={page}
          total={total}
          onPage={setPage}
          emptyTitle={
            search ? "No matching records" : `No ${title.toLowerCase()} yet`
          }
          emptyDescription={
            emptyDescription || "Records will appear here when they are added."
          }
        />
      )}
    </div>
  );
}
export function EmployeeName({ row }: { row: Row }) {
  return (
    <span className="workforce-employee-name">
      {row.employee_name ||
        row.full_name ||
        [row.first_name, row.last_name].filter(Boolean).join(" ") ||
        row.employee_number ||
        "Employee record"}
    </span>
  );
}
export function DecisionHistory({ decisions = [] }: { decisions?: Row[] }) {
  return (
    <div className="workforce-history">
      <h3>Approval history</h3>
      {decisions.length ? (
        decisions.map((r, i) => (
          <div key={r.decision_id || i}>
            <Status value={r.decision || r.status || r.action} />
            <div>
              <strong>
                {r.approver_name ||
                  r.approval_role ||
                  r.approver_role ||
                  "Authorized approver"}
              </strong>
              <p>{r.comments || r.reason || "No comments recorded."}</p>
              <small>{formatDateTime(r.created_at || r.decided_at)}</small>
            </div>
          </div>
        ))
      ) : (
        <p className="muted">No decisions have been recorded.</p>
      )}
    </div>
  );
}
export function DurationCell({ value }: { value: unknown }) {
  return <span className="money">{duration(value)}</span>;
}

export function useAllWorkforceRows(
  resource: string,
  filters: Row = {},
  enabled = true,
) {
  return useQuery({
    queryKey: [`workforce/${resource}/all`, filters],
    enabled,
    queryFn: async ({ signal }) => {
      const rows: Row[] = [];
      let page = 1;
      while (true) {
        const response = await request<Row[]>(
          `/workforce/${resource}?${queryString({ ...filters, page, pageSize: 200 })}`,
          { signal },
        );
        rows.push(...response.data);
        if (
          !response.meta ||
          rows.length >= response.meta.total ||
          response.data.length === 0
        )
          return { data: rows };
        page++;
      }
    },
  });
}
