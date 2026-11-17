import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import {
  ResponsiveContainer,
  AreaChart,
  Area,
  CartesianGrid,
  XAxis,
  YAxis,
  Tooltip,
  BarChart,
  Bar,
  Legend,
} from "recharts";
import {
  CalendarClock,
  Users,
  Clock,
  CalendarDays,
  CheckCircle2,
  AlertCircle,
} from "lucide-react";
import { request } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import {
  PageHeader,
  Tabs,
  Restricted,
  SectionCard,
  Loading,
  ErrorState,
  EmptyState,
  Status,
} from "@/components/shared";
import { queryString, formatDate, type Row } from "@/lib/utils";
import {
  FilterBar,
  initialFilters,
  type WorkforceFilters,
  EmployeeName,
} from "./workforce/shared";
import { MyDay } from "./workforce/Clock";
import { AttendanceLedger, Corrections } from "./workforce/Attendance";
import { LeaveRequests, LeaveBalances, LeaveCalendar } from "./workforce/Leave";
import { Policies } from "./workforce/Policies";
import { PayrollInputs } from "./workforce/PayrollInputs";
import { WorkforceReports } from "./workforce/Reports";
import { duration } from "./workforce/model";

export function Workforce({
  initialTab,
  fixedEmployeeId,
  embedded = false,
}: {
  initialTab?: string;
  fixedEmployeeId?: string;
  embedded?: boolean;
}) {
  const { can, session } = useAuth();
  const self = can("self.attendance") || can("self.leave");
  const attendance = can("attendance.read") || can("self.attendance");
  const leave = can("leave.read") || can("self.leave");
  const tabs = [
    ...(can("attendance.read") && !embedded
      ? [{ id: "overview", label: "Overview" }]
      : []),
    ...(self && !fixedEmployeeId ? [{ id: "my-day", label: "My day" }] : []),
    ...(attendance
      ? [
          { id: "attendance", label: "Attendance" },
          { id: "corrections", label: "Corrections" },
        ]
      : []),
    ...(leave
      ? [
          { id: "leave", label: "Leave requests" },
          { id: "balances", label: "Balances" },
          { id: "calendar", label: "Leave calendar" },
        ]
      : []),
    ...(can("workforce.manage") && !embedded
      ? [{ id: "policies", label: "Schedules & policies" }]
      : []),
    ...(can("attendance.payroll") && !embedded
      ? [{ id: "payroll-inputs", label: "Payroll inputs" }]
      : []),
    ...(can("reports.hr") && !embedded
      ? [{ id: "reports", label: "Reports" }]
      : []),
  ];
  const [selected, setSelected] = useState(
    initialTab || (session?.user.role === "employee" ? "my-day" : tabs[0]?.id),
  );
  const tab = tabs.some((t) => t.id === selected) ? selected : tabs[0]?.id;
  const [filters, setFilters] = useState(initialFilters);
  const scoped = {
    ...filters,
    employee_id: fixedEmployeeId || filters.employee_id,
  };
  const validDates =
    !filters.date_from ||
    !filters.date_to ||
    filters.date_from <= filters.date_to;
  if (!tabs.length) return <Restricted />;
  return (
    <div className="workforce-workspace">
      {!embedded && (
        <PageHeader
          eyebrow="WORKFORCE MANAGEMENT"
          title={
            session?.user.role === "employee"
              ? "Your attendance & leave"
              : "Attendance & leave"
          }
          description="Time, leave, and workforce policies in one place."
        />
      )}
      <Tabs
        items={tabs}
        value={tab}
        onChange={(value) => {
          setSelected(value);
          setFilters((current) => ({
            ...current,
            status: "",
            schedule_id: "",
          }));
        }}
      />
      {!["my-day", "policies", "balances", "calendar"].includes(tab) && (
        <FilterBar
          filters={filters}
          onChange={setFilters}
          fixedEmployeeId={fixedEmployeeId}
          schedule={tab === "overview" && can("attendance.read")}
          statuses={
            tab === "attendance"
              ? [
                  "present",
                  "absent",
                  "late",
                  "half_day",
                  "on_leave",
                  "holiday",
                  "rest_day",
                  "pending_correction",
                ]
              : tab === "leave"
                ? ["draft", "pending", "approved", "rejected", "cancelled"]
                : ["corrections", "payroll-inputs"].includes(tab)
                  ? ["pending", "approved", "rejected"]
                  : []
          }
        />
      )}
      {!validDates &&
      !["my-day", "policies", "balances", "calendar"].includes(tab) ? (
        <EmptyState
          title="Choose a valid date range"
          description="The end date must be on or after the start date."
        />
      ) : (
        <div
          key={tab + JSON.stringify(scoped)}
          className="workforce-tab-content"
        >
          {tab === "overview" && <WorkforceOverview filters={scoped} />}{" "}
          {tab === "my-day" && <MyDay />}
          {tab === "attendance" && (
            <AttendanceLedger
              filters={scoped}
              fixedEmployeeId={fixedEmployeeId}
            />
          )}{" "}
          {tab === "corrections" && <Corrections filters={scoped} />}{" "}
          {tab === "leave" && (
            <LeaveRequests filters={scoped} fixedEmployeeId={fixedEmployeeId} />
          )}{" "}
          {tab === "balances" && (
            <>
              <FilterBar
                filters={filters}
                onChange={setFilters}
                dates={false}
                department={false}
                fixedEmployeeId={fixedEmployeeId}
              />
              <LeaveBalances
                employeeId={fixedEmployeeId || filters.employee_id}
              />
            </>
          )}{" "}
          {tab === "calendar" && (
            <>
              <FilterBar
                filters={filters}
                onChange={setFilters}
                dates={false}
                fixedEmployeeId={fixedEmployeeId}
              />
              <LeaveCalendar filters={scoped} />
            </>
          )}{" "}
          {tab === "policies" && <Policies />}{" "}
          {tab === "payroll-inputs" && <PayrollInputs filters={scoped} />}{" "}
          {tab === "reports" && <WorkforceReports filters={scoped} />}
        </div>
      )}
    </div>
  );
}
function WorkforceOverview({ filters }: { filters: WorkforceFilters }) {
  const q = useQuery({
    queryKey: ["workforce/dashboard", filters],
    queryFn: () => request<Row>(`/workforce/dashboard?${queryString(filters)}`),
  });
  if (q.isPending) return <Loading label="Loading workforce overview…" />;
  if (q.error) return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const data = q.data?.data || {};
  const metrics = data.metrics || {};
  const cards = [
    {
      label: "Present",
      value: metrics.present,
      icon: CheckCircle2,
      color: "teal",
    },
    { label: "Absent", value: metrics.absent, icon: Users, color: "blue" },
    {
      label: "Late arrivals",
      value: metrics.late,
      icon: Clock,
      color: "amber",
    },
    {
      label: "On leave",
      value: metrics.on_leave,
      icon: CalendarDays,
      color: "purple",
    },
    {
      label: "Recorded work",
      value: duration(metrics.work_minutes),
      icon: CalendarClock,
      color: "blue",
    },
    {
      label: "Overtime",
      value: duration(metrics.overtime_minutes),
      icon: Clock,
      color: "teal",
    },
  ];
  return (
    <>
      <div className="workforce-metrics">
        {cards.map((c) => (
          <div className="card workforce-metric" key={c.label}>
            <span className={`metric-icon ${c.color}`}>
              <c.icon size={19} />
            </span>
            <div>
              <span>{c.label}</span>
              <strong>{c.value ?? "—"}</strong>
            </div>
          </div>
        ))}
      </div>
      <div className="workforce-overview-summary">
        <span>Attendance rate</span>
        <strong>
          {metrics.attendance_percentage === undefined
            ? "—"
            : `${Number(metrics.attendance_percentage).toFixed(1)}%`}
        </strong>
        <span>For the selected period and filters</span>
      </div>
      {data.definitions?.attendance_percentage && (
        <p className="workforce-metric-definition">
          {data.definitions.attendance_percentage}
        </p>
      )}
      <div className="workforce-chart-grid">
        <SectionCard
          title="Daily attendance"
          subtitle="Present and absent records across the selected period"
        >
          {data.trends?.length ? (
            <div
              className="workforce-chart"
              role="img"
              aria-label="Daily present and absent attendance chart"
            >
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={data.trends}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e5eaf0"
                  />
                  <XAxis
                    dataKey="date"
                    tickFormatter={(v) => String(v).slice(5)}
                    tick={{ fill: "#526079", fontSize: 11 }}
                  />
                  <YAxis
                    tick={{ fill: "#526079", fontSize: 11 }}
                    allowDecimals={false}
                  />
                  <Tooltip labelFormatter={(v) => formatDate(String(v))} />
                  <Legend />
                  <Area
                    dataKey="present"
                    name="Present"
                    stroke="#057d73"
                    fill="#c3eee8"
                    strokeWidth={2}
                  />
                  <Area
                    dataKey="absent"
                    name="Absent"
                    stroke="#b45309"
                    fill="#fff0d3"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="Attendance trends will appear here"
              description="Record attendance or reconcile missing days to populate the overview."
            />
          )}
        </SectionCard>
        <SectionCard
          title="Attendance by department"
          subtitle="Recorded attendance within each department"
        >
          {data.departments?.length ? (
            <div
              className="workforce-chart"
              role="img"
              aria-label="Department attendance comparison"
            >
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={data.departments}>
                  <CartesianGrid
                    strokeDasharray="3 3"
                    vertical={false}
                    stroke="#e5eaf0"
                  />
                  <XAxis
                    dataKey="name"
                    tick={{ fill: "#526079", fontSize: 11 }}
                  />
                  <YAxis
                    tick={{ fill: "#526079", fontSize: 11 }}
                    allowDecimals={false}
                  />
                  <Tooltip />
                  <Legend />
                  <Bar
                    dataKey="present"
                    name="Present"
                    fill="#2563eb"
                    radius={[4, 4, 0, 0]}
                  />
                  <Bar
                    dataKey="absent"
                    name="Absent"
                    fill="#a16207"
                    radius={[4, 4, 0, 0]}
                  />
                </BarChart>
              </ResponsiveContainer>
            </div>
          ) : (
            <EmptyState
              title="No department attendance yet"
              description="Department totals appear when attendance is recorded."
            />
          )}
        </SectionCard>
      </div>
      <SectionCard
        title="Corrections awaiting review"
        subtitle="Review proposed changes in the Corrections tab"
      >
        {data.pending_corrections?.length ? (
          <div className="workforce-pending">
            {data.pending_corrections.map((r: Row) => (
              <div key={r.correction_id}>
                <span className="metric-icon amber">
                  <AlertCircle size={18} />
                </span>
                <div>
                  <EmployeeName row={r} />
                  <p>{r.reason}</p>
                </div>
                <Status value={r.status || "pending"} />
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            compact
            title="No corrections awaiting review"
            description="New correction requests will appear here."
          />
        )}
      </SectionCard>
    </>
  );
}
