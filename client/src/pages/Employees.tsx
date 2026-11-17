import { toast } from "sonner";
import { useEffect, useState } from "react";
import {
  Link,
  useNavigate,
  useParams,
  useSearchParams,
} from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BriefcaseBusiness,
  Building2,
  CalendarDays,
  Clock3,
  Download,
  CheckCircle2,
  Mail,
  MapPin,
  Pencil,
  Phone,
  Plus,
  Users,
  UserCheck,
  UserMinus,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { downloadReport, useList, useRecord } from "@/lib/api";
import { employeeFields, salaryFields } from "@/lib/resources";
import {
  formatDate,
  formatMoney,
  personName,
  titleCase,
  type Row,
} from "@/lib/utils";
import {
  Avatar,
  DataTable,
  DetailGrid,
  EmptyState,
  ErrorState,
  FormDialog,
  Loading,
  PageHeader,
  PersonCell,
  Restricted,
  SearchInput,
  SectionCard,
  Status,
  Tabs,
  options,
  type FormSpec,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { ResourcePage } from "./Resources";

function employeeForm(can: (p: string) => boolean, row?: Row): FormSpec {
  return {
    title: row ? "Edit employee" : "Add employee",
    description:
      "Build a complete employee record. Personal and financial details are visible only to authorized team members.",
    fields: employeeFields.filter(
      (f) =>
        !(
          row &&
          [
            "basic_salary",
            "allowances",
            "payment_frequency",
            "employment_status",
          ].includes(f.name)
        ) &&
        (!["basic_salary", "allowances", "payment_frequency"].includes(
          f.name,
        ) ||
          can("salaries.write")) &&
        (!["bank_name", "account_number"].includes(f.name) ||
          can("banking.write")),
    ),
    initial: row,
    path: `/employees${row ? "/" + row.employee_id : ""}`,
    method: row ? "PUT" : "POST",
    submitLabel: row ? "Save changes" : "Create employee",
    transform: (v) =>
      !row && !can("salaries.write")
        ? {
            ...v,
            basic_salary: "0.00",
            allowances: "",
            payment_frequency: "monthly",
          }
        : v,
  };
}
export function Employees() {
  const { can } = useAuth();
  const [params] = useSearchParams();
  const [search, setSearch] = useState(params.get("search") || "");
  useEffect(() => {
    setSearch(params.get("search") || "");
    setPage(1);
  }, [params]);
  const [employmentType, setEmploymentType] = useState("");
  const [exporting, setExporting] = useState(false);
  const settings = useRecord("settings");
  const currency = settings.data?.data?.currency || "USD";
  const [department, setDepartment] = useState("");
  const [status, setStatus] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("first_name");
  const [direction, setDirection] = useState("asc");
  const [form, setForm] = useState<FormSpec | null>(null);
  const q = useList(
    "employees",
    {
      search,
      department_id: department,
      employment_status: status,
      employment_type: employmentType,
      page,
      pageSize: 20,
      sort,
      direction,
    },
    can("employees.read"),
  );
  const departments = useList(
    "departments",
    { pageSize: 100 },
    can("employees.read"),
  );
  const dashboard = useRecord("dashboard", can("employees.read"));
  const navigate = useNavigate();
  if (!can("employees.read")) return <Restricted />;
  const metrics = dashboard.data?.data?.metrics;
  return (
    <>
      <PageHeader
        eyebrow="PEOPLE OPERATIONS"
        title="Employee directory"
        description="Your people, their details, and everything that keeps them connected."
        actions={
          <>
            {can("reports.hr") && (
              <Button
                variant="outline"
                disabled={exporting}
                onClick={async () => {
                  setExporting(true);
                  try {
                    await downloadReport(
                      "employees",
                      {
                        search,
                        department_id: department,
                        employment_status: status,
                        employment_type: employmentType,
                      },
                      "xlsx",
                    );
                    toast.success("Employee directory downloaded");
                  } catch (e) {
                    toast.error(
                      e instanceof Error ? e.message : "Export failed",
                    );
                  } finally {
                    setExporting(false);
                  }
                }}
              >
                <Download size={16} />
                {exporting ? "Exporting…" : "Export"}
              </Button>
            )}
            {can("employees.write") && (
              <Button
                onClick={() =>
                  setForm({
                    ...employeeForm(can),
                    onSuccess: (r) => navigate(`/employees/${r.employee_id}`),
                  })
                }
              >
                <Plus size={17} />
                Add employee
              </Button>
            )}
          </>
        }
      />
      <div className="mini-stats">
        <MiniStat
          icon={Users}
          label="Total employees"
          value={metrics?.total_employees}
        />
        <MiniStat
          icon={UserCheck}
          label="Active employees"
          value={metrics?.active_employees}
          tone="teal"
        />
        <MiniStat
          icon={CalendarDays}
          label="On leave"
          value={metrics?.on_leave}
          tone="amber"
        />
        <MiniStat
          icon={UserMinus}
          label="Inactive employees"
          value={metrics?.inactive_employees}
          tone="slate"
        />
      </div>
      <div className="card">
        <div className="table-toolbar">
          <div className="toolbar-left">
            <h2>
              All employees{" "}
              <span className="count-badge">{q.data?.meta?.total ?? "—"}</span>
            </h2>
            <SearchInput
              value={search}
              onChange={(s) => {
                setSearch(s);
                setPage(1);
              }}
              placeholder="Search name, email, or employee ID…"
            />
          </div>
          <div className="toolbar-right">
            <select
              className="input filter-select"
              aria-label="Employment type"
              value={employmentType}
              onChange={(e) => {
                setEmploymentType(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All employment types</option>
              {["full_time", "part_time", "contract", "intern"].map((t) => (
                <option key={t} value={t}>
                  {titleCase(t)}
                </option>
              ))}
            </select>
            <select
              className="input filter-select"
              aria-label="Department"
              value={department}
              onChange={(e) => {
                setDepartment(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All departments</option>
              {departments.data?.data.map((d) => (
                <option key={d.department_id} value={d.department_id}>
                  {d.department_name}
                </option>
              ))}
            </select>
            <select
              className="input filter-select"
              aria-label="Employment status"
              value={status}
              onChange={(e) => {
                setStatus(e.target.value);
                setPage(1);
              }}
            >
              <option value="">All statuses</option>
              {["active", "inactive", "on_leave", "terminated", "archived"].map(
                (s) => (
                  <option key={s} value={s}>
                    {titleCase(s)}
                  </option>
                ),
              )}
            </select>
          </div>
        </div>
        {q.isError ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : (
          <DataTable
            loading={q.isPending}
            rows={q.data?.data || []}
            idKey="employee_id"
            emptyTitle={
              search || department || status
                ? "No employees match your filters"
                : "Your team starts here"
            }
            emptyDescription={
              search || department || status
                ? "Adjust your search or filters to see more results."
                : "Add your first employee to bring their details, compensation, and history together."
            }
            columns={[
              {
                key: "first_name",
                label: "Employee",
                sortable: true,
                render: (r) => <PersonCell row={r} />,
              },
              {
                key: "employee_number",
                label: "Employee ID",
                sortable: true,
                render: (r) => (
                  <span className="code-text">{r.employee_number}</span>
                ),
              },
              {
                key: "department_id",
                label: "Department",
                render: (r) =>
                  departments.data?.data.find(
                    (d) => d.department_id === r.department_id,
                  )?.department_name ||
                  r.department_name ||
                  "—",
              },
              { key: "position", label: "Position" },
              {
                key: "employment_status",
                label: "Status",
                render: (r) => <Status value={r.employment_status} />,
              },
              ...(can("salaries.read")
                ? [
                    {
                      key: "basic_salary",
                      label: "Basic salary",
                      render: (r: Row) => formatMoney(r.basic_salary, currency),
                    },
                  ]
                : []),
              {
                key: "hire_date",
                label: "Hire date",
                sortable: true,
                render: (r) => formatDate(r.hire_date),
              },
              {
                key: "actions",
                label: "",
                render: (r) => (
                  <Button asChild size="icon" variant="ghost">
                    <Link
                      aria-label={`View ${personName(r)}`}
                      to={`/employees/${r.employee_id}`}
                    >
                      <ArrowRight size={17} />
                    </Link>
                  </Button>
                ),
              },
            ]}
            page={page}
            total={q.data?.meta?.total}
            onPage={setPage}
            sort={sort}
            direction={direction}
            onSort={(s) => {
              setSort(s);
              setDirection(sort === s && direction === "asc" ? "desc" : "asc");
            }}
          />
        )}
      </div>
      <FormDialog spec={form} onClose={() => setForm(null)} />
    </>
  );
}
function MiniStat({
  icon: Icon,
  label,
  value,
  tone = "blue",
}: {
  icon: typeof Users;
  label: string;
  value: unknown;
  tone?: string;
}) {
  return (
    <div className="mini-stat">
      <span className={`metric-icon ${tone}`}>
        <Icon size={20} />
      </span>
      <div>
        <span>{label}</span>
        <strong>{value === undefined ? "—" : String(value)}</strong>
      </div>
    </div>
  );
}
export function EmployeeProfile() {
  const { id } = useParams();
  const { can } = useAuth();
  const q = useRecord(`employees/${id}`, can("employees.read"));
  const departments = useList(
    "departments",
    { pageSize: 100 },
    can("employees.read"),
  );
  const settings = useRecord("settings");
  const [tab, setTab] = useState("overview");
  const [form, setForm] = useState<FormSpec | null>(null);
  if (!can("employees.read")) return <Restricted />;
  if (q.isPending) return <Loading label="Loading employee profile…" />;
  if (q.isError)
    return <ErrorState error={q.error} retry={() => q.refetch()} />;
  const employee = q.data?.data?.employee || q.data?.data || {};
  const currency = settings.data?.data?.currency || "USD";
  const tabs = [
    { id: "overview", label: "Overview" },
    { id: "timeline", label: "Employment timeline" },
    ...(can("payroll.read") || can("reports.finance")
      ? [{ id: "payroll", label: "Payroll history" }]
      : []),
    ...(can("salaries.read")
      ? [{ id: "salary", label: "Salary history" }]
      : []),
    ...["bonuses", "penalties", "loans", "attendance", "leave"]
      .filter((t) => can(`${t}.read`))
      .map((t) => ({ id: t, label: t === "leave" ? "Leave" : titleCase(t) })),
  ];
  const department = departments.data?.data.find(
    (d) => d.department_id === employee.department_id,
  )?.department_name;
  return (
    <>
      <Link className="back-link" to="/employees">
        <ArrowLeft size={15} />
        Back to employees
      </Link>
      <div className="profile-banner">
        <div className="profile-banner-pattern" />
        <div className="profile-title">
          <Avatar
            name={personName(employee)}
            image={employee.profile_image}
            size="lg"
          />
          <div>
            <div className="flex items-center gap-3 flex-wrap">
              <h1>{personName(employee)}</h1>
              <Status value={employee.employment_status} />
            </div>
            <p>
              {employee.position} <span>·</span>{" "}
              {department || "Department not available"}
            </p>
            <small className="code-text">{employee.employee_number}</small>
          </div>
          <div className="profile-actions">
            {can("employees.write") && (
              <>
                <Button
                  variant="outline"
                  onClick={() => setForm(employeeForm(can, employee))}
                >
                  <Pencil size={16} />
                  Edit profile
                </Button>
                <Button
                  variant="outline"
                  onClick={() =>
                    setForm({
                      title: "Update employment status",
                      description:
                        "Status changes are recorded in the employee history.",
                      path: `/employees/${id}/status`,
                      method: "PATCH",
                      initial: employee,
                      fields: [
                        {
                          name: "employment_status",
                          label: "Employment status",
                          type: "select",
                          required: true,
                          options: options([
                            "active",
                            "inactive",
                            "on_leave",
                            "terminated",
                            "archived",
                          ]),
                        },
                        {
                          name: "employment_end_date",
                          label: "Employment end date",
                          type: "date",
                        },
                      ],
                    })
                  }
                >
                  Change status
                </Button>
              </>
            )}
          </div>
        </div>
      </div>
      <Tabs items={tabs} value={tab} onChange={setTab} />
      {tab === "overview" ? (
        <div className="profile-grid">
          <div>
            <SectionCard
              title="Personal information"
              subtitle="Contact and personal details"
            >
              <DetailGrid
                record={employee}
                fields={[
                  { key: "email", label: "Email address" },
                  { key: "phone", label: "Phone number" },
                  {
                    key: "date_of_birth",
                    label: "Date of birth",
                    type: "date",
                  },
                  { key: "gender", label: "Gender" },
                  { key: "address", label: "Address" },
                  { key: "emergency_contact", label: "Emergency contact" },
                ]}
              />
            </SectionCard>
            <SectionCard title="Employment details">
              <DetailGrid
                record={{
                  ...employee,
                  department_name: department,
                  employment_type: titleCase(employee.employment_type),
                }}
                fields={[
                  { key: "employee_number", label: "Employee ID" },
                  { key: "department_name", label: "Department" },
                  { key: "position", label: "Position" },
                  { key: "employment_type", label: "Employment type" },
                  { key: "hire_date", label: "Hire date", type: "date" },
                  {
                    key: "employment_end_date",
                    label: "End date",
                    type: "date",
                  },
                ]}
              />
            </SectionCard>
          </div>
          <div>
            {can("salaries.read") && (
              <SectionCard
                title="Compensation"
                action={
                  can("salaries.write") && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label="Adjust salary"
                      onClick={() =>
                        setForm({
                          title: "Adjust salary",
                          description:
                            "The effective date preserves historical payroll calculations.",
                          path: `/employees/${id}/salary`,
                          fields: salaryFields,
                          initial: employee,
                          submitLabel: "Save salary change",
                        })
                      }
                    >
                      <Pencil size={15} />
                    </Button>
                  )
                }
              >
                <DetailGrid
                  currency={currency}
                  record={employee}
                  fields={[
                    {
                      key: "basic_salary",
                      label: "Basic salary",
                      type: "money",
                    },
                    { key: "allowances", label: "Allowances", type: "money" },
                    { key: "payment_frequency", label: "Payment frequency" },
                  ]}
                />
              </SectionCard>
            )}
            {can("banking.read") && (
              <SectionCard title="Banking details">
                <DetailGrid
                  record={employee}
                  fields={[
                    { key: "bank_name", label: "Bank name" },
                    { key: "account_number", label: "Account number" },
                  ]}
                />
              </SectionCard>
            )}
            <SectionCard title="Record history">
              <DetailGrid
                record={employee}
                fields={[
                  { key: "created_at", label: "Created", type: "date" },
                  { key: "updated_at", label: "Last updated", type: "date" },
                ]}
              />
            </SectionCard>
          </div>
        </div>
      ) : tab === "timeline" ? (
        <EmploymentTimeline id={id!} />
      ) : tab === "payroll" ? (
        <EmployeePayroll id={id!} currency={currency} />
      ) : tab === "salary" ? (
        <SalaryHistory
          employee={employee}
          currency={currency}
          onEdit={() =>
            setForm({
              title: "Adjust salary",
              description:
                "A dated change preserves previous compensation for historical payroll.",
              path: `/employees/${id}/salary`,
              fields: salaryFields,
              initial: employee,
              submitLabel: "Save salary change",
            })
          }
        />
      ) : (
        <ResourcePage
          key={tab}
          resource={tab}
          embedded
          fixedFilters={{ employee_id: id }}
        />
      )}
      <FormDialog spec={form} onClose={() => setForm(null)} />
    </>
  );
}
function SalaryHistory({
  employee,
  currency,
  onEdit,
}: {
  employee: Row;
  currency: string;
  onEdit: () => void;
}) {
  const [page, setPage] = useState(1);
  const q = useList(`employees/${employee.employee_id}/salary`, {
    page,
    pageSize: 20,
  });
  const { can } = useAuth();
  return (
    <SectionCard
      title="Salary history"
      subtitle="Effective-dated compensation changes"
      action={
        can("salaries.write") && (
          <Button onClick={onEdit}>
            <Plus size={16} />
            Adjust salary
          </Button>
        )
      }
    >
      {q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <DataTable
          rows={q.data?.data || []}
          loading={q.isPending}
          page={page}
          total={q.data?.meta?.total}
          onPage={setPage}
          emptyTitle="No salary changes yet"
          emptyDescription="The employee's original salary applies until a dated adjustment is added."
          columns={[
            {
              key: "effective_date",
              label: "Effective from",
              render: (r) => formatDate(r.effective_date),
            },
            {
              key: "basic_salary",
              label: "Basic salary",
              render: (r) => formatMoney(r.basic_salary, currency),
            },
            {
              key: "allowances",
              label: "Allowances",
              render: (r) => formatMoney(r.allowances, currency),
            },
            {
              key: "payment_frequency",
              label: "Frequency",
              render: (r) => titleCase(r.payment_frequency),
            },
            { key: "reason", label: "Reason" },
            {
              key: "created_at",
              label: "Recorded",
              render: (r) => formatDate(r.created_at),
            },
          ]}
        />
      )}
    </SectionCard>
  );
}
export function Salaries() {
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [form, setForm] = useState<FormSpec | null>(null);
  const q = useList(
    "employees",
    { search, page, pageSize: 20 },
    can("salaries.read"),
  );
  const settings = useRecord("settings");
  const currency = settings.data?.data?.currency || "USD";
  if (!can("salaries.read")) return <Restricted />;
  return (
    <>
      <PageHeader
        eyebrow="COMPENSATION"
        title="Salaries"
        description="Manage compensation with a complete history of effective-dated changes."
      />
      <div className="info-banner">
        <CalendarDays size={19} />
        <span>
          Salary adjustments apply from their effective date. Previously
          finalized payroll stays unchanged.
        </span>
      </div>
      <div className="card">
        <div className="table-toolbar">
          <h2>Employee compensation</h2>
          <SearchInput
            value={search}
            onChange={(s) => {
              setSearch(s);
              setPage(1);
            }}
            placeholder="Search employees…"
          />
        </div>
        {q.isError ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : (
          <DataTable
            rows={q.data?.data || []}
            loading={q.isPending}
            idKey="employee_id"
            page={page}
            total={q.data?.meta?.total}
            onPage={setPage}
            emptyTitle="No salary records yet"
            emptyDescription="Add employees to manage their compensation and salary history."
            columns={[
              {
                key: "employee",
                label: "Employee",
                render: (r) => <PersonCell row={r} />,
              },
              { key: "position", label: "Position" },
              {
                key: "basic_salary",
                label: "Basic salary",
                render: (r) => (
                  <span className="money">
                    {formatMoney(r.basic_salary, currency)}
                  </span>
                ),
              },
              {
                key: "allowances",
                label: "Allowances",
                render: (r) => formatMoney(r.allowances, currency),
              },
              {
                key: "payment_frequency",
                label: "Frequency",
                render: (r) => titleCase(r.payment_frequency),
              },
              {
                key: "employment_status",
                label: "Status",
                render: (r) => <Status value={r.employment_status} />,
              },
              {
                key: "actions",
                label: "",
                render: (r) =>
                  can("salaries.write") && (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() =>
                        setForm({
                          title: `Adjust salary · ${personName(r)}`,
                          description:
                            "Enter the new compensation and the date it takes effect.",
                          path: `/employees/${r.employee_id}/salary`,
                          fields: salaryFields,
                          initial: r,
                          submitLabel: "Save salary change",
                        })
                      }
                    >
                      <Pencil size={14} />
                      Adjust salary
                    </Button>
                  ),
              },
            ]}
          />
        )}
      </div>
      <FormDialog spec={form} onClose={() => setForm(null)} />
    </>
  );
}

function EmploymentTimeline({ id }: { id: string }) {
  const [page, setPage] = useState(1);
  const q = useList(`employees/${id}/history`, { page, pageSize: 25 });
  return (
    <SectionCard
      title="Employment timeline"
      subtitle="Recorded changes to this employee’s employment"
    >
      {q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : q.isPending ? (
        <Loading />
      ) : q.data?.data.length ? (
        <>
          <div className="employment-timeline">
            {q.data.data.map((r: Row) => (
              <div className="timeline-row" key={r.log_id}>
                <span>
                  <Clock3 size={16} />
                </span>
                <div>
                  <strong>{r.summary || titleCase(r.action)}</strong>
                  <small>{formatDate(r.timestamp)}</small>
                </div>
              </div>
            ))}
          </div>
          <div className="table-footer">
            <span>{q.data.meta?.total} events</span>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                disabled={page <= 1}
                onClick={() => setPage(page - 1)}
              >
                Previous
              </Button>
              <Button
                variant="outline"
                size="sm"
                disabled={page * 25 >= (q.data.meta?.total || 0)}
                onClick={() => setPage(page + 1)}
              >
                Next
              </Button>
            </div>
          </div>
        </>
      ) : (
        <EmptyState
          icon={Clock3}
          title="No employment changes recorded"
          description="Future employment updates will appear in this timeline."
        />
      )}
    </SectionCard>
  );
}
function EmployeePayroll({ id, currency }: { id: string; currency: string }) {
  const [page, setPage] = useState(1);
  const q = useList("reports/payroll", { employee_id: id, page, pageSize: 20 });
  return (
    <SectionCard
      title="Payroll history"
      subtitle="Finalized payroll snapshots for this employee"
    >
      {q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <DataTable
          rows={q.data?.data || []}
          loading={q.isPending}
          idKey="payroll_id"
          page={page}
          total={q.data?.meta?.total}
          onPage={setPage}
          emptyTitle="No finalized payroll yet"
          emptyDescription="Payroll appears here after it has been approved and finalized."
          columns={[
            { key: "payroll_month", label: "Period" },
            {
              key: "basic_salary",
              label: "Basic salary",
              render: (r) => formatMoney(r.basic_salary, currency),
            },
            {
              key: "gross_salary",
              label: "Gross",
              render: (r) => formatMoney(r.gross_salary, currency),
            },
            {
              key: "total_deductions",
              label: "Deductions",
              render: (r) => formatMoney(r.total_deductions, currency),
            },
            {
              key: "net_salary",
              label: "Net salary",
              render: (r) => formatMoney(r.net_salary, currency),
            },
            {
              key: "payment_status",
              label: "Payment status",
              render: (r) => <Status value={r.payment_status} />,
            },
          ]}
        />
      )}
    </SectionCard>
  );
}
