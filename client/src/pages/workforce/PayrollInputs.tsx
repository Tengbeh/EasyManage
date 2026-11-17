import { useRef, useState } from "react";
import { Plus, Eye } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useList, useRecord, useAction } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  DataForm,
  FormDialog,
  RelationSelect,
  Status,
  DetailGrid,
  Loading,
  ErrorState,
  EmptyState,
  SectionCard,
  options,
  type FormSpec,
  type Field,
} from "@/components/shared";
import {
  formatDate,
  formatMoney,
  monthNow,
  titleCase,
  type Row,
} from "@/lib/utils";
import {
  EmployeeName,
  RecordList,
  useAllWorkforceRows,
  type WorkforceFilters,
} from "./shared";
import { commentsField, duration, payrollCycleDates } from "./model";

export function PayrollInputs({
  filters,
}: {
  filters: Partial<WorkforceFilters>;
}) {
  const { can } = useAuth();
  const settings = useRecord("settings");
  const currency = settings.data?.data?.currency;
  const [create, setCreate] = useState(false);
  const [detail, setDetail] = useState<Row | null>(null);
  const [form, setForm] = useState<FormSpec | null>(null);
  function decide(row: Row, action: string) {
    setForm({
      title: `${titleCase(action)} payroll input`,
      description:
        action === "revoke"
          ? "Revoke this input and its linked bonus or deduction before submitting a corrected input. Any open payroll run will require revision and renewed approval. Finalized payroll cannot be changed."
          : "Review the server-calculated amount, source attendance, and policy before deciding. Approved inputs create one linked payroll bonus or deduction.",
      path: `/workforce/payroll-inputs/${row.input_id}/${action}`,
      fields: [commentsField],
      submitLabel: titleCase(action),
    });
  }
  return (
    <>
      <RecordList
        resource="payroll-inputs"
        filters={filters}
        idKey="input_id"
        title="Attendance payroll inputs"
        emptyDescription="Finalize attendance and propose eligible overtime, unpaid absence, or a related bonus. Each input requires approval before affecting payroll."
        action={
          can("attendance.payroll") && (
            <Button onClick={() => setCreate(true)}>
              <Plus size={16} />
              Propose payroll input
            </Button>
          )
        }
        columns={[
          {
            key: "employee_name",
            label: "Employee",
            render: (r) => <EmployeeName row={r} />,
          },
          { key: "payroll_month", label: "Payroll month" },
          { key: "type", label: "Type", render: (r) => titleCase(r.type) },
          {
            key: "calculated_minutes",
            label: "Eligible duration",
            render: (r) => duration(r.calculated_minutes),
          },
          {
            key: "amount",
            label: "Amount",
            render: (r) =>
              formatMoney(
                r.amount,
                r.currency || r.policy_snapshot?.currency || currency,
              ),
          },
          {
            key: "status",
            label: "Status",
            render: (r) => <Status value={r.status} />,
          },
          {
            key: "actions",
            label: "Review",
            render: (r) => (
              <Button size="sm" variant="ghost" onClick={() => setDetail(r)}>
                <Eye size={16} />
                View calculation
              </Button>
            ),
          },
        ]}
      />
      {create && <PayrollInputDialog onClose={() => setCreate(false)} />}
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="workforce-detail">
          <DialogTitle>Payroll input calculation</DialogTitle>
          <DialogDescription>
            Calculated by the server from the selected attendance and policy.
            Finalized payroll keeps an immutable copy of its inputs.
          </DialogDescription>
          {detail && (
            <>
              <PayrollInputBreakdown inputs={[detail]} currency={currency} />
              {detail.status === "approved" &&
                can("attendance.payroll") &&
                can(
                  detail.type === "unpaid_absence"
                    ? "penalties.approve"
                    : "bonuses.approve",
                ) && (
                  <div className="form-actions">
                    <Button
                      variant="outline"
                      onClick={() => decide(detail, "revoke")}
                    >
                      Revoke input for correction
                    </Button>
                  </div>
                )}
              {detail.status === "pending" &&
                can("attendance.payroll") &&
                can(
                  detail.type === "unpaid_absence"
                    ? "penalties.approve"
                    : "bonuses.approve",
                ) && (
                  <div className="form-actions">
                    <Button
                      variant="outline"
                      onClick={() => decide(detail, "reject")}
                    >
                      Reject
                    </Button>
                    <Button onClick={() => decide(detail, "approve")}>
                      Approve input
                    </Button>
                  </div>
                )}
            </>
          )}
        </DialogContent>
      </Dialog>
      <FormDialog
        spec={form}
        onClose={() => {
          setForm(null);
          setDetail(null);
        }}
      />
    </>
  );
}
export function PayrollInputDialog({ onClose }: { onClose: () => void }) {
  const settings = useRecord("settings");
  const [employee, setEmployee] = useState("");
  const [month, setMonth] = useState(monthNow());
  const [type, setType] = useState("overtime");
  const [selected, setSelected] = useState<string[]>([]);
  const [error, setError] = useState("");
  const submission = useRef<{ signature: string; key: string } | null>(null);
  const action = useAction("Payroll input proposed");
  const cycle = settings.data?.data
    ? payrollCycleDates(month, settings.data.data)
    : null;
  const q = useAllWorkforceRows(
    "attendance",
    { employee_id: employee, ...cycle, approval_status: "finalized" },
    !!employee && !!cycle,
  );
  const rows = (q.data?.data || []).filter(
    (r) => r.approval_status === "finalized",
  );
  const fields: Field[] = [
    ...(type === "bonus"
      ? [
          {
            name: "amount",
            label: "Bonus amount",
            type: "money" as const,
            required: true,
          },
        ]
      : []),
    {
      name: "reason",
      label: "Reason for payroll input",
      type: "textarea",
      required: true,
      wide: true,
    },
  ];
  return (
    <Dialog open onOpenChange={(o) => !o && !action.isPending && onClose()}>
      <DialogContent>
        <DialogTitle>Propose attendance payroll input</DialogTitle>
        <DialogDescription>
          Overtime and unpaid absence amounts are derived from finalized
          attendance, salary, and enabled schedule policy. Approval is required
          before payroll changes.
        </DialogDescription>
        <fieldset disabled={action.isPending} className="workforce-fieldset">
          <div className="form-grid">
            <div className="field field-wide">
              <label htmlFor="field-payroll_employee">Employee *</label>
              <RelationSelect
                field={{
                  name: "payroll_employee",
                  label: "Employee",
                  relation: "employees",
                }}
                value={employee}
                onChange={(v) => {
                  setEmployee(v);
                  setSelected([]);
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="input-month">Payroll month *</label>
              <input
                id="input-month"
                className="input"
                type="month"
                value={month}
                onChange={(e) => {
                  setMonth(e.target.value);
                  setSelected([]);
                }}
              />
            </div>
            <div className="field">
              <label htmlFor="input-type">Input type</label>
              <select
                id="input-type"
                className="input"
                value={type}
                onChange={(e) => setType(e.target.value)}
              >
                {options(["overtime", "unpaid_absence", "bonus"]).map((o) => (
                  <option key={o.value} value={o.value}>
                    {o.label}
                  </option>
                ))}
              </select>
            </div>
          </div>
          <div className="workforce-source-picker">
            <h3>Finalized source attendance</h3>
            {cycle && (
              <p className="muted">
                Payroll cycle: {formatDate(cycle.date_from)} –{" "}
                {formatDate(cycle.date_to)}
              </p>
            )}
            <p className="muted">
              Select the records that support this input. The server rejects
              records already used for this input type.
            </p>
            {settings.error ? (
              <ErrorState
                error={settings.error}
                retry={() => settings.refetch()}
              />
            ) : !month ? (
              <p className="muted">
                Choose a payroll month to load source attendance.
              </p>
            ) : !employee ? (
              <p className="muted">
                Choose an employee to load finalized attendance.
              </p>
            ) : q.isPending ? (
              <Loading />
            ) : q.error ? (
              <ErrorState error={q.error} retry={() => q.refetch()} />
            ) : !rows.length ? (
              <EmptyState
                title="No finalized attendance"
                description="Review and finalize eligible attendance before proposing an input."
              />
            ) : (
              rows.map((r) => (
                <label key={r.attendance_id} className="workforce-source-row">
                  <input
                    type="checkbox"
                    checked={selected.includes(r.attendance_id)}
                    onChange={(e) =>
                      setSelected(
                        e.target.checked
                          ? [...selected, r.attendance_id]
                          : selected.filter((id) => id !== r.attendance_id),
                      )
                    }
                  />
                  <span>
                    {formatDate(r.date)}
                    <small>
                      {titleCase(r.status)} · worked {duration(r.work_minutes)}{" "}
                      · overtime {duration(r.overtime_minutes)}
                    </small>
                  </span>
                </label>
              ))
            )}
          </div>
        </fieldset>
        {error && (
          <p className="form-error" role="alert">
            {error}
          </p>
        )}
        <DataForm
          fields={fields}
          pending={action.isPending}
          error={action.error}
          onCancel={onClose}
          submitLabel="Propose input"
          onSubmit={(values) => {
            if (
              !employee ||
              !month ||
              !selected.length ||
              selected.length > 31
            ) {
              setError(
                "Choose an employee, payroll month, and 1–31 finalized attendance records.",
              );
              return;
            }
            setError("");
            const body = {
              ...values,
              employee_id: employee,
              payroll_month: month,
              type,
              attendance_ids: selected,
            };
            const signature = JSON.stringify(body);
            if (submission.current?.signature !== signature)
              submission.current = { signature, key: crypto.randomUUID() };
            action.mutate(
              {
                path: "/workforce/payroll-inputs",
                body,
                key: submission.current.key,
              },
              { onSuccess: onClose },
            );
          }}
        />
      </DialogContent>
    </Dialog>
  );
}
export function PayrollInputBreakdown({
  inputs,
  currency,
}: {
  inputs: Row[];
  currency?: string;
}) {
  return (
    <div className="workforce-payroll-breakdown">
      {inputs.map((r, i) => (
        <SectionCard
          key={r.input_id || i}
          title={titleCase(r.type || "Attendance input")}
          action={<Status value={r.status || "approved"} />}
        >
          <DetailGrid
            record={{
              ...r,
              duration: duration(r.calculated_minutes),
              amount: formatMoney(
                r.amount,
                r.currency || r.policy_snapshot?.currency || currency,
              ),
              hourly_rate:
                r.hourly_rate === undefined
                  ? "—"
                  : r.hourly_rate === "varies"
                    ? "Varies by source"
                    : `${r.hourly_rate} ${r.currency || r.policy_snapshot?.currency || currency || ""}`,
            }}
            fields={[
              { key: "employee_name", label: "Employee" },
              { key: "payroll_month", label: "Payroll month" },
              { key: "duration", label: "Calculated duration" },
              { key: "hourly_rate", label: "Hourly rate" },
              { key: "multiplier", label: "Multiplier" },
              { key: "amount", label: "Amount" },
              { key: "reason", label: "Reason" },
            ]}
          />
          {r.policy_snapshot && (
            <div className="workforce-policy-note">
              <strong>Policy used for this calculation</strong>
              <dl className="policy-values">
                {Object.entries(r.policy_snapshot)
                  .filter(([key]) => key !== "sources")
                  .map(([key, value]) => (
                    <div key={key}>
                      <dt>{titleCase(key)}</dt>
                      <dd>
                        {typeof value === "boolean"
                          ? value
                            ? "Enabled"
                            : "Disabled"
                          : typeof value === "object"
                            ? JSON.stringify(value)
                            : String(value ?? "—")}
                      </dd>
                    </div>
                  ))}
              </dl>
            </div>
          )}
          {Array.isArray(r.calculation) && r.calculation.length > 0 && (
            <div className="table-wrap">
              <table>
                <caption className="sr-only">
                  Calculation for each source attendance record
                </caption>
                <thead>
                  <tr>
                    <th>Attendance date</th>
                    <th>Duration</th>
                    <th>Hourly rate</th>
                    <th>Multiplier</th>
                    <th>Amount</th>
                    <th>Schedule</th>
                  </tr>
                </thead>
                <tbody>
                  {r.calculation.map((c: Row) => (
                    <tr key={c.attendance_id}>
                      <td>{formatDate(c.date)}</td>
                      <td>{duration(c.minutes)}</td>
                      <td>{c.hourly_rate}</td>
                      <td>{c.multiplier}</td>
                      <td>
                        {formatMoney(
                          c.amount,
                          r.policy_snapshot?.currency || currency,
                        )}
                      </td>
                      <td>{c.policy?.name || "Recorded policy"}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
          {r.attendance_ids?.length > 0 && (
            <details>
              <summary>
                {r.attendance_ids.length} source attendance record
                {r.attendance_ids.length === 1 ? "" : "s"}
              </summary>
              <ul className="workforce-source-ids">
                {r.attendance_ids.map((id: string) => (
                  <li key={id}>{id}</li>
                ))}
              </ul>
            </details>
          )}
          {(r.bonus_id || r.penalty_id) && (
            <p className="muted">
              Approved {r.bonus_id ? "bonus" : "deduction"} reference:{" "}
              {r.bonus_id || r.penalty_id}
            </p>
          )}
        </SectionCard>
      ))}
    </div>
  );
}
