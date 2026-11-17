import { useState } from "react";
import { Link } from "react-router-dom";
import { ArrowRight, Check, Eye, Pencil, Plus, X } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useList, useRecord } from "@/lib/api";
import {
  cn,
  formatDate,
  formatMoney,
  personName,
  titleCase,
  today,
  type Row,
} from "@/lib/utils";
import { resources, moneyField } from "@/lib/resources";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import {
  ConfirmDialog,
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
  Status,
  Tabs,
  type Column,
  type ConfirmSpec,
  type FormSpec,
} from "@/components/shared";

export function ResourcePage({
  resource,
  embedded = false,
  fixedFilters = {},
}: {
  resource: string;
  embedded?: boolean;
  fixedFilters?: Row;
}) {
  const config = resources[resource];
  const { can } = useAuth();
  const [search, setSearch] = useState("");
  const [status, setStatus] = useState("");
  const [month, setMonth] = useState("");
  const [page, setPage] = useState(1);
  const [sort, setSort] = useState("created_at");
  const [direction, setDirection] = useState("desc");
  const [form, setForm] = useState<FormSpec | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const [tab, setTab] = useState("attendance");
  const q = useList(
    resource,
    {
      search,
      status,
      month,
      page,
      pageSize: 20,
      sort,
      direction,
      ...fixedFilters,
    },
    can(config.read),
  );
  const employees = useList(
    "employees",
    { pageSize: 200 },
    can("employees.read") && config.columns.some((c) => c.type === "employee"),
  );
  const settings = useRecord("settings");
  const currency = settings.data?.data?.currency || "USD";
  if (!can(config.read)) return <Restricted />;
  if (resource === "attendance" && tab === "leave")
    return (
      <>
        <PageHeader
          title="Attendance & leave"
          description="Keep daily attendance and time away in one place."
        />
        <Tabs
          items={[
            { id: "attendance", label: "Attendance" },
            { id: "leave", label: "Leave requests" },
          ]}
          value={tab}
          onChange={setTab}
        />
        <ResourcePage resource="leave" embedded />
      </>
    );
  const newForm = (row?: Row) =>
    setForm({
      title: `${row ? "Edit" : "Add"} ${config.singular}`,
      description:
        resource === "users"
          ? "Only listed active users can sign in with their Google account."
          : undefined,
      fields: config.fields,
      initial: { ...row, ...fixedFilters },
      path: `/${resource}${row ? "/" + row[config.id] : ""}`,
      method: row ? "PUT" : "POST",
      submitLabel: row ? "Save changes" : `Add ${config.singular}`,
    });
  const approve = (r: Row, approve: boolean) =>
    !approve
      ? setForm({
          title: `Reject ${config.singular}`,
          description:
            "Provide the reason for this decision. It will be recorded in the audit trail.",
          fields: [
            {
              name: "reason",
              label: "Rejection reason",
              type: "textarea",
              wide: true,
              required: true,
            },
          ],
          path: `/${resource}/${r[config.id]}/reject`,
          method: resource === "loans" ? "POST" : "PATCH",
          submitLabel: "Reject request",
        })
      : setConfirm({
          title: `${approve ? "Approve" : "Reject"} ${config.singular}?`,
          description: approve
            ? `This ${config.singular} will be approved and recorded in the audit trail.`
            : `This ${config.singular} will be rejected and excluded from applicable payroll calculations.`,
          label: approve ? "Approve" : "Reject",
          destructive: !approve,
          operation: {
            path: `/${resource}/${r[config.id]}/${approve ? "approve" : "reject"}`,
            method: resource === "loans" ? "POST" : "PATCH",
          },
        });
  const columns: Column[] = config.columns.map((c) => ({
    ...c,
    sortable: [
      "created_at",
      "date",
      "amount",
      "department_name",
      "full_name",
      "effective_month",
    ].includes(c.key),
    render: (r) => {
      const v = r[c.key];
      if (c.type === "employee") {
        const e = employees.data?.data.find((e) => e.employee_id === v);
        return e ? (
          <PersonCell row={e} />
        ) : (
          <Link className="text-link" to={`/employees/${v}`}>
            {r.employee_name || v || "—"}
          </Link>
        );
      }
      if (c.type === "user") return <PersonCell row={r} link={false} />;
      if (c.type === "money")
        return <span className="money">{formatMoney(v, currency)}</span>;
      if (c.type === "date") return formatDate(v);
      if (c.type === "status") return <Status value={v} />;
      if (c.type === "enum") return titleCase(v);
      return (
        <span className={c.key === "description" ? "truncate-cell" : ""}>
          {String(v || "—")}
        </span>
      );
    },
  }));
  columns.push({
    key: "actions",
    label: "Actions",
    className: "actions-cell",
    render: (r) => (
      <div className="row-actions">
        <Button
          variant="ghost"
          size="icon"
          aria-label={`View ${config.singular}`}
          onClick={() => setDetail(r)}
        >
          <Eye size={16} />
        </Button>
        {can(config.write) && (!config.approve || r.status === "pending") && (
          <Button
            variant="ghost"
            size="icon"
            aria-label={`Edit ${config.singular}`}
            onClick={() => newForm(r)}
          >
            <Pencil size={15} />
          </Button>
        )}
        {config.approve && can(config.approve) && r.status === "pending" && (
          <>
            <Button
              variant="ghost"
              size="icon"
              className="text-teal"
              aria-label={`Approve ${config.singular}`}
              onClick={() => approve(r, true)}
            >
              <Check size={17} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="text-danger"
              aria-label={`Reject ${config.singular}`}
              onClick={() => approve(r, false)}
            >
              <X size={17} />
            </Button>
          </>
        )}
      </div>
    ),
  });
  return (
    <>
      {!embedded && (
        <PageHeader
          eyebrow={
            ["bonuses", "penalties", "loans"].includes(resource)
              ? "COMPENSATION"
              : resource === "users"
                ? "ADMINISTRATION"
                : "PEOPLE OPERATIONS"
          }
          title={config.title}
          description={config.description}
          actions={
            can(config.write) && (
              <Button onClick={() => newForm()}>
                <Plus size={17} />
                Add {config.singular}
              </Button>
            )
          }
        />
      )}{" "}
      {resource === "attendance" && (
        <Tabs
          items={[
            { id: "attendance", label: "Attendance" },
            { id: "leave", label: "Leave requests" },
          ]}
          value={tab}
          onChange={setTab}
        />
      )}
      <div className="card">
        <div className="table-toolbar">
          <div className="toolbar-left">
            <h2>
              {embedded
                ? config.title
                : `All ${resource === "leave" ? "requests" : resource}`}{" "}
              <span className="count-badge">{q.data?.meta?.total ?? "—"}</span>
            </h2>
            <SearchInput
              value={search}
              onChange={(v) => {
                setSearch(v);
                setPage(1);
              }}
              placeholder={`Search ${resource}…`}
            />
          </div>
          <div className="toolbar-right">
            {["bonuses", "penalties", "loans", "attendance", "leave"].includes(
              resource,
            ) && (
              <input
                className="input filter-select"
                type="month"
                aria-label="Filter by month"
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  setPage(1);
                }}
              />
            )}
            {config.statuses && (
              <select
                className="input filter-select"
                aria-label="Filter by status"
                value={status}
                onChange={(e) => {
                  setStatus(e.target.value);
                  setPage(1);
                }}
              >
                <option value="">All statuses</option>
                {config.statuses.map((s) => (
                  <option key={s} value={s}>
                    {titleCase(s)}
                  </option>
                ))}
              </select>
            )}
            {embedded && can(config.write) && (
              <Button size="sm" onClick={() => newForm()}>
                <Plus size={15} />
                Add {config.singular}
              </Button>
            )}
          </div>
        </div>
        {q.isError ? (
          <ErrorState error={q.error} retry={() => q.refetch()} />
        ) : (
          <DataTable
            rows={q.data?.data || []}
            columns={columns}
            idKey={config.id}
            loading={q.isPending}
            emptyTitle={
              search || status
                ? "No matching records"
                : `No ${resource === "leave" ? "leave requests" : resource} yet`
            }
            emptyDescription={
              search || status
                ? "Try a different search or clear the status filter."
                : `Add a ${config.singular} to get started. Your records will appear here.`
            }
            page={page}
            total={q.data?.meta?.total}
            onPage={setPage}
            sort={sort}
            direction={direction}
            onSort={(s) => {
              setDirection(sort === s && direction === "asc" ? "desc" : "asc");
              setSort(s);
            }}
          />
        )}
      </div>
      <FormDialog spec={form} onClose={() => setForm(null)} />
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent>
          <DialogTitle>{titleCase(config.singular)} details</DialogTitle>
          <DialogDescription>
            Record details and current status.
          </DialogDescription>
          {detail && (
            <>
              <DetailGrid
                record={detail}
                fields={config.columns}
                currency={currency}
              />
              {resource === "loans" && (
                <LoanSchedule loan={detail} currency={currency} />
              )}
            </>
          )}
        </DialogContent>
      </Dialog>
    </>
  );
}
function LoanSchedule({ loan, currency }: { loan: Row; currency: string }) {
  const { can } = useAuth();
  const [page, setPage] = useState(1);
  const q = useList(`loans/${loan.loan_id}/installments`, {
    page,
    pageSize: 20,
    sort: "due_date",
    direction: "asc",
  });
  const [form, setForm] = useState<FormSpec | null>(null);
  return (
    <div className="mt-6">
      <h3 className="mb-3 font-semibold">Repayment schedule</h3>
      {q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <DataTable
          rows={q.data?.data || []}
          loading={q.isPending}
          idKey="installment_id"
          page={page}
          total={q.data?.meta?.total}
          onPage={setPage}
          emptyTitle="No installments yet"
          emptyDescription="A repayment schedule is created when this loan is approved."
          columns={[
            {
              key: "due_date",
              label: "Due date",
              render: (r) => formatDate(r.due_date),
            },
            {
              key: "installment_amount",
              label: "Amount",
              render: (r) => formatMoney(r.installment_amount, currency),
            },
            {
              key: "amount_paid",
              label: "Paid",
              render: (r) => formatMoney(r.amount_paid, currency),
            },
            {
              key: "remaining_balance",
              label: "Remaining",
              render: (r) => formatMoney(r.remaining_balance, currency),
            },
            {
              key: "status",
              label: "Status",
              render: (r) => <Status value={r.status} />,
            },
            {
              key: "action",
              label: "",
              render: (r) =>
                can("loans.write") &&
                Number(r.remaining_balance) > 0 &&
                !r.payroll_run_id &&
                ["pending", "partial"].includes(r.status) && (
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() =>
                      setForm({
                        title: "Record loan payment",
                        description:
                          "Record an actual repayment received for this installment.",
                        path: `/loans/${loan.loan_id}/payments`,
                        fields: [
                          {
                            ...moneyField("amount", "Payment amount"),
                            min: 0.01,
                            max: Number(r.remaining_balance),
                          },
                          {
                            name: "payment_date",
                            label: "Payment date",
                            type: "date",
                            required: true,
                            default: today(),
                          },
                        ],
                        initial: {
                          amount: r.remaining_balance,
                          payment_date: today(),
                        },
                        transform: (v) => ({
                          ...v,
                          installment_id: r.installment_id,
                        }),
                        submitLabel: "Record payment",
                      })
                    }
                  >
                    Record payment
                  </Button>
                ),
            },
          ]}
        />
      )}
      <FormDialog spec={form} onClose={() => setForm(null)} />
    </div>
  );
}
