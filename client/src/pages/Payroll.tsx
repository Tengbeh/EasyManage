import { useRef, useState } from "react";
import { Link } from "react-router-dom";
import {
  AlertTriangle,
  ArrowLeft,
  ArrowRight,
  Check,
  CheckCheck,
  CircleDollarSign,
  ClipboardCheck,
  Eye,
  FileCheck2,
  LockKeyhole,
  Pencil,
  Plus,
  RefreshCw,
  Send,
  ShieldCheck,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useAction, useList, useRecord } from "@/lib/api";
import {
  formatDate,
  formatMoney,
  monthLabel,
  monthNow,
  personName,
  titleCase,
  type Row,
} from "@/lib/utils";
import { moneyField } from "@/lib/resources";
import { Button } from "@/components/ui/button";
import {
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  FormDialog,
  Loading,
  PageHeader,
  SectionCard,
  Status,
  type ConfirmSpec,
  type FormSpec,
} from "@/components/shared";

export function Payroll() {
  const { can } = useAuth();
  const [month, setMonth] = useState(monthNow());
  const [page, setPage] = useState(1);
  const [selected, setSelected] = useState<string | null>(null);
  const [preview, setPreview] = useState<Row | null>(null);
  const [form, setForm] = useState<FormSpec | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const q = useList("payroll", { page, pageSize: 20 }, can("payroll.read"));
  const detail = useRecord(
    `payroll/${selected}`,
    !!selected && can("payroll.read"),
  );
  const settings = useRecord("settings");
  const action = useAction("");
  const key = useRef<{ month: string; key: string } | null>(null);
  const currency = settings.data?.data?.currency || "USD";
  if (!can("payroll.read")) return <RestrictedPayroll />;
  const run = detail.data?.data?.run;
  const current = selected ? detail.data?.data : preview;
  const rows: Row[] = current?.rows || [];
  const totals = current?.totals || run || {};
  let warnings: string[] = current?.warnings || run?.warnings || [];
  if (!warnings.length && run?.warnings_json) {
    try {
      warnings = JSON.parse(run.warnings_json);
    } catch {
      /* invalid stored warnings are omitted */
    }
  }
  const requiresReview = rows.some(
    (r) => r.requires_review === true || r.requires_review === "true",
  );
  const showPreview = !!current;
  const previewPayroll = () => {
    if (key.current?.month !== month)
      key.current = { month, key: crypto.randomUUID() };
    action.mutate(
      {
        path: "/payroll/preview",
        body: { payroll_month: month },
        key: key.current.key,
      },
      {
        onSuccess: (r) => {
          setPreview(r.data);
          key.current = null;
        },
      },
    );
  };
  const openAction = (name: string) => {
    if (!selected) return;
    if (name === "approve") {
      setForm({
        title: "Approve payroll",
        description:
          "Review the payroll amounts and any deduction warnings before approval.",
        path: `/payroll/${selected}/approve`,
        submitLabel: "Approve payroll",
        fields: [
          {
            name: "reviewed",
            label: "Payroll review",
            type: "confirmation",
            required: true,
            wide: true,
            hint: requiresReview
              ? "I have reviewed all deduction warnings and explicitly approve the flagged amounts."
              : "I have reviewed the employee amounts, deductions, and payroll total.",
          },
          {
            name: "reason",
            label: "Approval note",
            type: "textarea",
            wide: true,
          },
        ],
      });
      return;
    }
    if (name === "reject") {
      setForm({
        title: "Reject payroll",
        description:
          "Explain the changes needed before this payroll can be approved.",
        path: `/payroll/${selected}/reject`,
        fields: [
          {
            name: "reason",
            label: "Reason for rejection",
            type: "textarea",
            required: true,
            wide: true,
          },
        ],
        submitLabel: "Reject payroll",
      });
      return;
    }
    if (name === "submit" && requiresReview) {
      setForm({
        title: "Submit payroll for approval",
        description:
          "This payroll contains deduction warnings that require explicit review.",
        path: `/payroll/${selected}/submit`,
        fields: [
          {
            name: "reviewed",
            label: "Deduction review",
            type: "confirmation",
            required: true,
            wide: true,
            hint: "I have reviewed all deduction warnings before submitting this payroll.",
          },
        ],
        submitLabel: "Submit for approval",
      });
      return;
    }
    const descriptions: Row = {
      submit:
        "Send this payroll to an authorized approver. Draft adjustments will be locked while it is under review.",
      finalize:
        "Finalize the approved payroll and preserve its amounts as a permanent snapshot. Loan installments will be reserved for this payroll.",
      paid: "Confirm that the payments have actually been completed. This records payroll as paid and applies reserved loan repayments.",
      revise:
        "Recalculate this payroll from current records and return it to draft for review.",
    };
    setConfirm({
      title: `${name === "paid" ? "Mark payroll as paid" : name === "revise" ? "Recalculate payroll" : titleCase(name) + " payroll"}?`,
      description: descriptions[name],
      label: name === "paid" ? "Confirm paid" : titleCase(name),
      operation: { path: `/payroll/${selected}/${name}` },
    });
  };
  return (
    <>
      <PageHeader
        eyebrow="PAYROLL MANAGEMENT"
        title={
          showPreview
            ? selected
              ? `${monthLabel(run?.payroll_month || month)} payroll`
              : "Payroll preview"
            : "Payroll"
        }
        description={
          showPreview
            ? "Review every amount before moving this payroll to the next stage."
            : "From calculation to payment, a clear process at every step."
        }
        actions={
          showPreview ? (
            <Button
              variant="outline"
              onClick={() => {
                setSelected(null);
                setPreview(null);
              }}
            >
              <ArrowLeft size={16} />
              All payroll runs
            </Button>
          ) : undefined
        }
      />
      {!showPreview && !selected && (
        <>
          <div className="payroll-create card">
            <div className="payroll-create-icon">
              <Wallet size={29} />
            </div>
            <div>
              <h2>Prepare your next payroll</h2>
              <p>
                Preview salary, bonuses, and deductions before creating a draft.
              </p>
            </div>
            <div className="payroll-create-actions">
              <input
                type="month"
                className="input"
                value={month}
                aria-label="Payroll month"
                onChange={(e) => {
                  if (e.target.value) setMonth(e.target.value);
                }}
              />
              {can("payroll.generate") && (
                <Button
                  onClick={previewPayroll}
                  disabled={action.isPending || !month}
                >
                  <Eye size={17} />
                  {action.isPending ? "Calculating…" : "Preview payroll"}
                </Button>
              )}
            </div>
          </div>
          {action.error && (
            <ErrorState error={action.error} retry={previewPayroll} />
          )}
          <SectionCard
            title="Payroll history"
            subtitle="Drafts, approvals, and finalized payroll runs"
          >
            {q.isError ? (
              <ErrorState error={q.error} retry={() => q.refetch()} />
            ) : (
              <DataTable
                rows={q.data?.data || []}
                loading={q.isPending}
                idKey="payroll_run_id"
                page={page}
                total={q.data?.meta?.total}
                onPage={setPage}
                emptyTitle="No payroll runs yet"
                emptyDescription="Choose a month and preview payroll to begin your first review."
                columns={[
                  {
                    key: "payroll_month",
                    label: "Period",
                    render: (r) => (
                      <button
                        className="text-link font-semibold"
                        onClick={() =>
                          setSelected(r.payroll_run_id || r.run_id)
                        }
                      >
                        {monthLabel(r.payroll_month)}
                      </button>
                    ),
                  },
                  { key: "total_employees", label: "Employees" },
                  {
                    key: "total_gross_salary",
                    label: "Gross payroll",
                    render: (r) => formatMoney(r.total_gross_salary, currency),
                  },
                  {
                    key: "total_deductions",
                    label: "Deductions",
                    render: (r) => formatMoney(r.total_deductions, currency),
                  },
                  {
                    key: "total_net_payroll",
                    label: "Net payroll",
                    render: (r) => (
                      <strong className="money">
                        {formatMoney(r.total_net_payroll, currency)}
                      </strong>
                    ),
                  },
                  {
                    key: "status",
                    label: "Status",
                    render: (r) => <Status value={r.status} />,
                  },
                  {
                    key: "created_at",
                    label: "Created",
                    render: (r) => formatDate(r.created_at),
                  },
                  {
                    key: "view",
                    label: "",
                    render: (r) => (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label={`Review ${r.payroll_month} payroll`}
                        onClick={() =>
                          setSelected(r.payroll_run_id || r.run_id)
                        }
                      >
                        <ArrowRight size={17} />
                      </Button>
                    ),
                  },
                ]}
              />
            )}
          </SectionCard>
        </>
      )}
      {selected && detail.isPending && (
        <Loading label="Loading payroll details…" />
      )}
      {selected && detail.isError && (
        <ErrorState error={detail.error} retry={() => detail.refetch()} />
      )}{" "}
      {showPreview && (
        <>
          <div className="payroll-stage card">
            <div className="flex items-center gap-3">
              {selected ? (
                <Status value={run?.status} />
              ) : (
                <span className="status status-draft">
                  <Eye size={13} />
                  Preview only
                </span>
              )}
              <span>
                {rows.length} employee{rows.length === 1 ? "" : "s"}
              </span>
            </div>
            <div className="stage-steps">
              {[
                "draft",
                "pending_approval",
                "approved",
                "finalized",
                "paid",
              ].map((s, i) => (
                <span key={s} className={run?.status === s ? "current" : ""}>
                  {i > 0 && <span className="stage-line" />}
                  <span className="stage-dot">{i + 1}</span>
                  {s === "pending_approval" ? "Review" : titleCase(s)}
                </span>
              ))}
            </div>
          </div>
          <div className="payroll-totals">
            <Total
              label="Gross payroll"
              value={totals.total_gross_salary}
              currency={currency}
            />
            <Total
              label="Total bonuses"
              value={totals.total_bonuses}
              currency={currency}
            />
            <Total
              label="Total deductions"
              value={totals.total_deductions}
              currency={currency}
            />
            <Total
              label="Net payroll"
              value={totals.total_net_payroll}
              currency={currency}
              featured
            />
          </div>
          {(warnings.length > 0 || requiresReview) && (
            <div className="warning-box">
              <AlertTriangle size={21} />
              <div>
                <h3>Payroll needs review</h3>
                {warnings.length ? (
                  <ul>
                    {warnings.map((w, i) => (
                      <li key={i}>{w}</li>
                    ))}
                  </ul>
                ) : (
                  <p>
                    One or more employees have deduction amounts that require
                    explicit review.
                  </p>
                )}
              </div>
            </div>
          )}
          {run?.rejection_reason && (
            <div className="warning-box">
              <AlertTriangle size={20} />
              <div>
                <h3>Changes requested</h3>
                <p>{run.rejection_reason}</p>
              </div>
            </div>
          )}
          <SectionCard
            title="Employee breakdown"
            subtitle={
              rows[0]?.period_start
                ? `Pay cycle: ${formatDate(rows[0].period_start)} – ${formatDate(rows[0].period_end)} · All amounts in ${currency}`
                : "All amounts in the company currency"
            }
          >
            <DataTable
              rows={rows}
              idKey="employee_id"
              emptyTitle="No eligible employees"
              emptyDescription="Check employee hire dates, employment status, and salary settings for this period."
              columns={[
                {
                  key: "employee_id",
                  label: "Employee",
                  render: (r) => (
                    <Link
                      className="text-link"
                      to={`/employees/${r.employee_id}`}
                    >
                      {r.employee_name ||
                        r.full_name ||
                        [r.first_name, r.last_name].filter(Boolean).join(" ") ||
                        r.employee_number ||
                        r.employee_id}
                    </Link>
                  ),
                },
                {
                  key: "basic_salary",
                  label: "Basic",
                  render: (r) => formatMoney(r.basic_salary, currency),
                },
                {
                  key: "allowances",
                  label: "Allowances",
                  render: (r) => formatMoney(r.allowances, currency),
                },
                {
                  key: "bonuses",
                  label: "Bonuses",
                  render: (r) => formatMoney(r.bonuses, currency),
                },
                {
                  key: "gross_salary",
                  label: "Gross",
                  render: (r) => formatMoney(r.gross_salary, currency),
                },
                {
                  key: "penalties",
                  label: "Penalties",
                  render: (r) => formatMoney(r.penalties, currency),
                },
                {
                  key: "loan_deductions",
                  label: "Loans",
                  render: (r) => formatMoney(r.loan_deductions, currency),
                },
                {
                  key: "other_deductions",
                  label: "Other",
                  render: (r) => formatMoney(r.other_deductions, currency),
                },
                {
                  key: "tax_deductions",
                  label: "Tax",
                  render: (r) => formatMoney(r.tax_deductions, currency),
                },
                {
                  key: "net_salary",
                  label: "Net salary",
                  render: (r) => (
                    <span className="money font-semibold">
                      {formatMoney(r.net_salary, currency)}
                      {r.requires_review && (
                        <AlertTriangle
                          className="inline ml-2 text-amber-600"
                          size={14}
                          aria-label="Requires review"
                        />
                      )}
                    </span>
                  ),
                },
                {
                  key: "actions",
                  label: "",
                  render: (r) =>
                    run?.status === "draft" &&
                    can("payroll.generate") && (
                      <Button
                        variant="ghost"
                        size="icon"
                        aria-label="Adjust payroll row"
                        onClick={() =>
                          setForm({
                            title: "Adjust employee payroll",
                            description:
                              "Adjustments apply only to this draft payroll. A reason is required for the audit trail.",
                            path: `/payroll/${selected}/adjustments`,
                            method: "PUT",
                            fields: [
                              moneyField("allowances", "Allowances"),
                              moneyField(
                                "other_deductions",
                                "Other deductions",
                              ),
                              moneyField("tax_deductions", "Tax deductions"),
                              {
                                name: "reason",
                                label: "Adjustment reason",
                                type: "textarea",
                                wide: true,
                                required: true,
                              },
                            ],
                            initial: r,
                            transform: (v) => ({
                              ...v,
                              employee_id: r.employee_id,
                            }),
                          })
                        }
                      >
                        <Pencil size={15} />
                      </Button>
                    ),
                },
              ]}
            />
          </SectionCard>
          <div className="payroll-action-bar">
            <p>
              <LockKeyhole size={15} />
              {!selected
                ? "Preview does not save or process payments."
                : ["finalized", "paid"].includes(run?.status)
                  ? "Finalized amounts are preserved in the payroll snapshot."
                  : "Every payroll action is recorded in the audit trail."}
            </p>
            <div>
              {!selected && can("payroll.generate") && (
                <Button
                  disabled={!rows.length}
                  onClick={() =>
                    setForm({
                      title: "Generate payroll draft",
                      description: `Create the payroll draft for ${monthLabel(month)} from current employee records.`,
                      path: "/payroll/generate",
                      fields: [
                        {
                          name: "payroll_month",
                          label: "Payroll month",
                          type: "month",
                          required: true,
                        },
                      ],
                      initial: { payroll_month: month },
                      submitLabel: "Generate draft",
                      onSuccess: (r) => {
                        setSelected(
                          r.run?.payroll_run_id ||
                            r.run?.run_id ||
                            r.payroll_run_id ||
                            r.run_id,
                        );
                        setPreview(null);
                      },
                    })
                  }
                >
                  <Plus size={16} />
                  Generate draft
                </Button>
              )}
              {run?.status === "draft" && can("payroll.generate") && (
                <>
                  <Button
                    variant="outline"
                    onClick={() => openAction("revise")}
                  >
                    <RefreshCw size={16} />
                    Recalculate
                  </Button>
                  <Button onClick={() => openAction("submit")}>
                    <Send size={16} />
                    Submit for approval
                  </Button>
                </>
              )}
              {["pending_approval", "submitted"].includes(run?.status) &&
                can("payroll.approve") && (
                  <>
                    <Button
                      variant="outline"
                      onClick={() => openAction("reject")}
                    >
                      Reject payroll
                    </Button>
                    <Button onClick={() => openAction("approve")}>
                      <ShieldCheck size={16} />
                      Approve payroll
                    </Button>
                  </>
                )}
              {run?.status === "approved" && can("payroll.finalize") && (
                <Button onClick={() => openAction("finalize")}>
                  <FileCheck2 size={16} />
                  Finalize payroll
                </Button>
              )}
              {run?.status === "finalized" && can("payroll.pay") && (
                <Button onClick={() => openAction("paid")}>
                  <CheckCheck size={16} />
                  Mark as paid
                </Button>
              )}
              {run?.status === "rejected" && can("payroll.generate") && (
                <Button onClick={() => openAction("revise")}>
                  <RefreshCw size={16} />
                  Revise payroll
                </Button>
              )}
            </div>
          </div>
        </>
      )}
      <FormDialog spec={form} onClose={() => setForm(null)} />
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
function Total({
  label,
  value,
  currency,
  featured = false,
}: {
  label: string;
  value: unknown;
  currency: string;
  featured?: boolean;
}) {
  return (
    <div className={featured ? "total-card featured" : "total-card"}>
      <span>{label}</span>
      <strong>{formatMoney(value, currency)}</strong>
      {featured && <Wallet size={22} />}
    </div>
  );
}
function RestrictedPayroll() {
  return (
    <EmptyState
      icon={ShieldCheck}
      title="Payroll access restricted"
      description="Ask your administrator for payroll access."
    />
  );
}
