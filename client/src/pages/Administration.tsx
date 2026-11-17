import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  Bell,
  BellRing,
  Check,
  CheckCheck,
  ChevronRight,
  Database,
  ExternalLink,
  FileClock,
  Link2,
  RefreshCw,
  Settings2,
  ShieldCheck,
} from "lucide-react";
import { toast } from "sonner";
import { useAuth } from "@/lib/auth";
import { useAction, useList, useRecord } from "@/lib/api";
import {
  formatDate,
  formatDateTime,
  formatActivity,
  titleCase,
  type Row,
} from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  DataForm,
  DataTable,
  DetailGrid,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  Restricted,
  SearchInput,
  SectionCard,
  Status,
  Tabs,
  options,
  type Field,
} from "@/components/shared";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";

export function Notifications() {
  const [filter, setFilter] = useState("all");
  const [page, setPage] = useState(1);
  const q = useList("notifications", { page, pageSize: 25 });
  const action = useAction("Notification marked as read");
  const rows = q.data?.data || [];
  const visible = rows.filter((r) => filter === "all" || !isRead(r));
  return (
    <>
      <PageHeader
        eyebrow="YOUR WORKSPACE"
        title="Notifications"
        description="Keep up with approvals, upcoming dates, and important updates."
      />
      <div className="card">
        <div className="px-6">
          <Tabs
            items={[
              { id: "all", label: "All notifications" },
              { id: "unread", label: "Unread" },
            ]}
            value={filter}
            onChange={setFilter}
          />
        </div>
        {q.isPending ? (
          <Loading />
        ) : q.isError ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : visible.length ? (
          <div className="notifications-list">
            {visible.map((r, i) => (
              <div
                key={r.notification_id || r.id || i}
                className={`notification-row ${isRead(r) ? "" : "unread"}`}
              >
                <span className="notification-icon">
                  <Bell size={19} />
                </span>
                <div>
                  <div className="notification-title">
                    <h3>
                      {r.title || titleCase(r.type || "Workspace update")}
                    </h3>
                    {!isRead(r) && <i />}
                  </div>
                  <p>{r.message || r.description}</p>
                  <small>{formatDate(r.created_at || r.timestamp)}</small>
                  {(r.href || r.link) &&
                    String(r.href || r.link).startsWith("/") &&
                    !String(r.href || r.link).startsWith("//") && (
                      <Link className="text-link ml-4" to={r.href || r.link}>
                        View details
                      </Link>
                    )}
                </div>
                {!isRead(r) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    disabled={action.isPending}
                    onClick={() =>
                      action.mutate({
                        path: `/notifications/${encodeURIComponent(r.notification_id || r.id)}/read`,
                        method: "PATCH",
                      })
                    }
                  >
                    <Check size={15} />
                    Mark read
                  </Button>
                )}
              </div>
            ))}
          </div>
        ) : (
          <EmptyState
            title={
              filter === "unread"
                ? "You’re all caught up"
                : "No notifications yet"
            }
            description="Updates about your workspace will appear here."
            icon={BellRing}
          />
        )}
        <div className="table-footer">
          <span>{q.data?.meta?.total ?? rows.length} notifications</span>
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
              disabled={page * 25 >= (q.data?.meta?.total ?? rows.length)}
              onClick={() => setPage(page + 1)}
            >
              Next
            </Button>
          </div>
        </div>
      </div>
    </>
  );
}
function isRead(r: Row) {
  return (
    r.read === true ||
    r.is_read === true ||
    r.is_read === "true" ||
    r.read === "true" ||
    !!r.read_at
  );
}
const settingsFields: Field[] = [
  {
    name: "company_name",
    label: "Company name",
    required: true,
    section: "Company profile",
  },
  { name: "company_logo", label: "Company logo URL", type: "url" },
  { name: "company_email", label: "Company email", type: "email" },
  { name: "company_phone", label: "Company phone" },
  {
    name: "company_address",
    label: "Company address",
    type: "textarea",
    wide: true,
  },
  {
    name: "currency",
    label: "Currency code",
    required: true,
    default: "USD",
    hint: "Three-letter currency code, such as USD or EUR.",
    section: "Regional preferences",
  },
  {
    name: "timezone",
    label: "Timezone",
    required: true,
    default: "UTC",
    hint: "An IANA timezone, such as UTC or America/New_York.",
  },
  {
    name: "date_format",
    label: "Date format",
    type: "select",
    required: true,
    options: ["YYYY-MM-DD", "DD/MM/YYYY", "MM/DD/YYYY"].map((value) => ({
      label: value,
      value,
    })),
    default: "YYYY-MM-DD",
  },
  {
    name: "default_payment_frequency",
    label: "Default payment frequency",
    type: "select",
    required: true,
    options: options(["monthly", "weekly", "daily", "custom"]),
    default: "monthly",
  },
  {
    name: "payroll_start_day",
    label: "Payroll start day",
    type: "number",
    min: 1,
    max: 31,
    required: true,
    default: "1",
    section: "Payroll policy",
  },
  {
    name: "payroll_end_day",
    label: "Payroll end day",
    type: "number",
    min: 1,
    max: 31,
    required: true,
    default: "31",
    hint: "The selected payroll month is the cycle closing month. A start day after the end day begins in the previous month.",
  },
  {
    name: "tax_percent",
    label: "Default tax (%)",
    type: "money",
    min: 0,
    max: 100,
    required: true,
    default: "0.00",
  },
  {
    name: "deduction_limit_percent",
    label: "Deduction review threshold (%)",
    type: "money",
    min: 0,
    max: 100,
    required: true,
    default: "100.00",
  },
  {
    name: "other_deductions",
    label: "Default other deductions",
    type: "money",
    required: true,
    default: "0.00",
  },
  {
    name: "allowances",
    label: "Default allowances",
    type: "money",
    required: true,
    default: "0.00",
  },
  {
    name: "custom_frequency_days",
    label: "Custom pay cycle length (days)",
    type: "number",
    min: 1,
    max: 366,
    hint: "Required to calculate salaries using a custom payment frequency.",
  },
];
export function Settings() {
  const { can } = useAuth();
  const [tab, setTab] = useState("general");
  const q = useRecord("settings");
  const action = useAction("Company settings updated");
  const key = useRef<{ signature: string; key: string } | null>(null);
  const settings = q.data?.data;
  const initial = settings
    ? {
        ...settings,
        ...settings.configured_deductions,
        custom_frequency_days:
          settings.configured_deductions?.frequency_days?.custom || "",
      }
    : {};
  return (
    <>
      <PageHeader
        eyebrow="ADMINISTRATION"
        title="Settings"
        description="Manage company preferences, connections, and workspace activity."
      />
      <Tabs
        items={[
          { id: "general", label: "Company & payroll" },
          { id: "connection", label: "Connections" },
          ...(can("audit.read") ? [{ id: "audit", label: "Audit log" }] : []),
        ]}
        value={tab}
        onChange={setTab}
      />
      {tab === "connection" ? (
        <ConnectionSettings />
      ) : tab === "audit" ? (
        <AuditLog />
      ) : q.isPending ? (
        <Loading />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : !can("settings.manage") ? (
        <SectionCard title="Company preferences">
          <DetailGrid
            record={settings || {}}
            fields={[
              { key: "company_name", label: "Company name" },
              { key: "currency", label: "Currency" },
              { key: "timezone", label: "Timezone" },
              { key: "date_format", label: "Date format" },
            ]}
          />
        </SectionCard>
      ) : (
        <div className="settings-layout">
          <div className="card settings-form">
            <DataForm
              fields={settingsFields}
              initial={initial}
              pending={action.isPending}
              error={action.error}
              submitLabel="Save settings"
              onSubmit={(v) => {
                const {
                  tax_percent,
                  other_deductions,
                  allowances,
                  deduction_limit_percent,
                  custom_frequency_days,
                  ...general
                } = v;
                const body = {
                  ...general,
                  configured_deductions: {
                    tax_percent,
                    other_deductions,
                    allowances,
                    deduction_limit_percent,
                    ...(custom_frequency_days
                      ? {
                          frequency_days: {
                            ...settings?.configured_deductions?.frequency_days,
                            custom: Number(custom_frequency_days),
                          },
                        }
                      : {}),
                  },
                };
                const signature = JSON.stringify(body);
                if (key.current?.signature !== signature)
                  key.current = { signature, key: crypto.randomUUID() };
                action.mutate(
                  {
                    path: "/settings",
                    method: "PUT",
                    body,
                    key: key.current.key,
                  },
                  {
                    onSuccess: () => {
                      key.current = null;
                    },
                  },
                );
              }}
            />
          </div>
          <div className="settings-aside">
            <div className="card p-6">
              <span className="metric-icon blue mb-4">
                <Settings2 size={20} />
              </span>
              <h3>Company payroll policy</h3>
              <p>
                Default allowances and deductions apply during payroll
                calculation. Review your company’s policy before finalizing a
                payroll run.
              </p>
              <p>
                Employees with deductions above the review threshold are flagged
                for explicit review.
              </p>
            </div>
            <div className="card p-6">
              <ShieldCheck size={22} className="text-teal mb-4" />
              <h3>Changes are recorded</h3>
              <p>
                Configuration updates appear in the audit log with the user,
                timestamp, and changed values.
              </p>
            </div>
          </div>
        </div>
      )}
    </>
  );
}
function ConnectionSettings() {
  const { session, refresh } = useAuth();
  const health = useRecord("health");
  return (
    <div className="connection-grid">
      <SectionCard
        title="Google account sign-in"
        subtitle="Secure access for approved workspace members"
      >
        <div className="connection-content">
          <span className="connection-logo">G</span>
          <Status
            value={
              health.data?.data?.googleConfigured ? "connected" : "unconfigured"
            }
          />
          <p>
            Users sign in with their own Google account. Workspace access is
            controlled in Users & access.
          </p>
          <Button asChild variant="outline">
            <Link to="/setup">
              View setup guide <ExternalLink size={14} />
            </Link>
          </Button>
        </div>
      </SectionCard>
      <SectionCard
        title="Google Sheets"
        subtitle="Your workspace’s persistent data connection"
      >
        <div className="connection-content">
          <span className="connection-logo sheets">
            <Database size={27} />
          </span>
          <Status
            value={
              session?.connection?.connected
                ? "connected"
                : session?.connection?.configured
                  ? "disconnected"
                  : "unconfigured"
            }
          />
          <p>
            Employee records, payroll snapshots, and audit history are stored in
            the configured spreadsheet.
          </p>
          <Button
            variant="outline"
            onClick={() => {
              health.refetch();
              refresh();
            }}
            disabled={health.isFetching}
          >
            <RefreshCw size={15} />
            Check connection status
          </Button>
          {health.error && (
            <p role="alert" className="field-error">
              {health.error.message}
            </p>
          )}
        </div>
      </SectionCard>
    </div>
  );
}
export function AuditLog() {
  const [search, setSearch] = useState("");
  const [page, setPage] = useState(1);
  const [detail, setDetail] = useState<Row | null>(null);
  const q = useList("audit-logs", { search, page, pageSize: 25 });
  return (
    <>
      <div className="card">
        <div className="table-toolbar">
          <div>
            <h2>Audit trail</h2>
            <p className="muted text-xs mt-1">
              A record of changes made across the workspace.
            </p>
          </div>
          <SearchInput
            value={search}
            onChange={(s) => {
              setSearch(s);
              setPage(1);
            }}
            placeholder="Search actions, users, or records…"
          />
        </div>
        {q.isError ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : (
          <DataTable
            rows={q.data?.data || []}
            loading={q.isPending}
            idKey="log_id"
            page={page}
            pageSize={25}
            total={q.data?.meta?.total}
            onPage={setPage}
            emptyTitle="No recorded activity"
            emptyDescription="Workspace changes will be recorded here."
            columns={[
              {
                key: "timestamp",
                label: "Time",
                render: (r) => formatDateTime(r.timestamp),
              },
              {
                key: "action",
                label: "Action",
                render: (r) => (
                  <span className="code-text">
                    {formatActivity(r.action, r.module)}
                  </span>
                ),
              },
              {
                key: "module",
                label: "Module",
                render: (r) => titleCase(r.module),
              },
              {
                key: "user_id",
                label: "User",
                render: (r) => r.user_name || r.user_email || r.user_id,
              },
              {
                key: "record_id",
                label: "Record",
                render: (r) => (
                  <span className="truncate-cell code-text">{r.record_id}</span>
                ),
              },
              {
                key: "details",
                label: "",
                render: (r) => (
                  <Button
                    size="sm"
                    variant="ghost"
                    onClick={() => setDetail(r)}
                  >
                    View changes <ChevronRight size={14} />
                  </Button>
                ),
              },
            ]}
          />
        )}
      </div>
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogTitle>Change details</DialogTitle>
          <DialogDescription>
            {detail &&
              `${titleCase(detail.action)} · ${formatDate(detail.timestamp)}`}
          </DialogDescription>
          {detail && (
            <DetailGrid
              record={{
                ...detail,
                previous_value: parse(detail.previous_value),
                new_value: parse(detail.new_value),
              }}
              fields={[
                { key: "previous_value", label: "Before", type: "json" },
                { key: "new_value", label: "After", type: "json" },
              ]}
            />
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
function parse(v: unknown) {
  try {
    return typeof v === "string" ? JSON.parse(v) : v;
  } catch {
    return v;
  }
}
