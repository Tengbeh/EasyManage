import { useRef, useState } from "react";
import { useForm, Controller } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { useMutation, useQueryClient } from "@tanstack/react-query";
import { toast } from "sonner";
import {
  Plus,
  Paperclip,
  Download,
  ChevronLeft,
  ChevronRight,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { request, useList, downloadFile } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  RelationSelect,
  FormDialog,
  ConfirmDialog,
  Status,
  ErrorState,
  Loading,
  EmptyState,
  SectionCard,
  DetailGrid,
  type FormSpec,
  type ConfirmSpec,
} from "@/components/shared";
import {
  formatDate,
  formatDateTime,
  titleCase,
  today,
  type Row,
} from "@/lib/utils";
import {
  RecordList,
  EmployeeName,
  DecisionHistory,
  useAllWorkforceRows,
  type WorkforceFilters,
} from "./shared";
import { commentsField, validateAttachment } from "./model";

const leaveSchema = z
  .object({
    employee_id: z.string(),
    leave_type_id: z.string().min(1, "Choose a leave type."),
    start_date: z.string().min(1, "Choose a start date."),
    end_date: z.string().min(1, "Choose an end date."),
    reason: z
      .string()
      .trim()
      .min(1, "Explain the reason for this request.")
      .max(2000, "Use 2,000 characters or fewer."),
    status: z.enum(["draft", "pending"]),
  })
  .refine((v) => v.end_date >= v.start_date, {
    path: ["end_date"],
    message: "The end date must be on or after the start date.",
  });
type LeaveValues = z.infer<typeof leaveSchema>;
export function LeaveRequestDialog({
  record,
  fixedEmployeeId,
  onClose,
}: {
  record: Row;
  fixedEmployeeId?: string;
  onClose: () => void;
}) {
  const { can, session } = useAuth();
  const staff = can("leave.write");
  const fixed = record.leave_id
    ? record.employee_id
    : fixedEmployeeId || (!staff ? session?.user.employee_id : undefined);
  const types = useList("workforce/leave-types", { pageSize: 100 });
  const qc = useQueryClient();
  const fileRef = useRef<HTMLInputElement>(null);
  const [file, setFile] = useState<File | null>(null);
  const [fileError, setFileError] = useState("");
  const [attachment, setAttachment] = useState<string>(
    record.supporting_attachment_id || "",
  );
  const uploadKey = useRef(crypto.randomUUID());
  const submission = useRef<{ signature: string; key: string } | null>(null);
  const {
    register,
    handleSubmit,
    control,
    watch,
    setError,
    formState: { errors },
  } = useForm<LeaveValues>({
    resolver: zodResolver(leaveSchema),
    defaultValues: {
      employee_id: fixed || record.employee_id || "",
      leave_type_id: record.leave_type_id || "",
      start_date: record.start_date || today(),
      end_date: record.end_date || today(),
      reason: record.reason || "",
      status: record.status === "pending" ? "pending" : "draft",
    },
  });
  const values = watch();
  const policy = types.data?.data.find(
    (r) => r.leave_type_id === values.leave_type_id,
  );
  const save = useMutation({
    retry: false,
    mutationFn: async (v: LeaveValues) => {
      let attachmentId = attachment;
      if (file && !attachmentId) {
        const body = new FormData();
        body.append("file", file);
        if (v.employee_id) body.append("employee_id", v.employee_id);
        const uploaded = await request("/workforce/leave-attachments", {
          method: "POST",
          body,
          key: uploadKey.current,
        });
        attachmentId = uploaded.data.attachment_id;
        setAttachment(attachmentId);
      }
      const body: Row = { ...v };
      if (!staff) delete body.employee_id;
      if (attachmentId) body.supporting_attachment_id = attachmentId;
      const path =
        "/workforce/leave" + (record.leave_id ? `/${record.leave_id}` : "");
      const signature = JSON.stringify({ path, body });
      if (submission.current?.signature !== signature)
        submission.current = { signature, key: crypto.randomUUID() };
      return request(path, {
        method: record.leave_id ? "PUT" : "POST",
        body: JSON.stringify(body),
        key: submission.current.key,
      });
    },
    onSuccess: () => {
      qc.invalidateQueries();
      toast.success(
        values.status === "draft"
          ? "Leave draft saved"
          : "Leave request submitted",
      );
      onClose();
    },
  });
  function submit(v: LeaveValues) {
    if (staff && !v.employee_id) {
      setError("employee_id", { message: "Choose an employee." });
      return;
    }
    if (!staff && !fixed) {
      setError("employee_id", {
        message:
          "Your account must be linked to an employee before requesting leave.",
      });
      return;
    }
    if (!policy) {
      setError("leave_type_id", {
        message: "Choose an available leave policy.",
      });
      return;
    }
    if (policy.requires_document && !file && !attachment) {
      setFileError("This leave policy requires a supporting document.");
      return;
    }
    if (fileError) return;
    save.mutate(v);
  }
  const invalid = (name: keyof LeaveValues) =>
    errors[name] ? (
      <p className="field-error" role="alert">
        {errors[name]?.message}
      </p>
    ) : null;
  return (
    <Dialog open onOpenChange={(o) => !o && !save.isPending && onClose()}>
      <DialogContent>
        <DialogTitle>
          {record.leave_id ? "Edit leave draft" : "Request leave"}
        </DialogTitle>
        <DialogDescription>
          Working days and available balance are checked by the server. Submit
          for the approval stages defined in the selected leave policy.
        </DialogDescription>
        <form onSubmit={handleSubmit(submit)} noValidate className="data-form">
          <fieldset disabled={save.isPending} className="workforce-fieldset">
            <div className="form-grid">
              {staff && !fixed ? (
                <div className="field field-wide">
                  <label htmlFor="field-leave_employee">Employee *</label>
                  <Controller
                    name="employee_id"
                    control={control}
                    render={({ field }) => (
                      <RelationSelect
                        field={{
                          name: "leave_employee",
                          label: "Employee",
                          relation: "employees",
                        }}
                        value={field.value}
                        onChange={(v) => {
                          field.onChange(v);
                          setAttachment("");
                          setFile(null);
                          uploadKey.current = crypto.randomUUID();
                          if (fileRef.current) fileRef.current.value = "";
                        }}
                        invalid={!!errors.employee_id}
                      />
                    )}
                  />
                  {invalid("employee_id")}
                </div>
              ) : (
                <p className="field-wide muted">
                  Request for{" "}
                  {record.employee_name ||
                    (staff ? "this employee" : "your linked employee account")}
                  .{invalid("employee_id")}
                </p>
              )}
              <div className="field field-wide">
                <label htmlFor="leave-type">Leave type *</label>
                <select
                  className="input"
                  id="leave-type"
                  {...register("leave_type_id")}
                  aria-invalid={!!errors.leave_type_id}
                >
                  <option value="">
                    {types.isPending
                      ? "Loading leave types…"
                      : "Choose a leave type"}
                  </option>
                  {types.data?.data.map((r) => (
                    <option key={r.leave_type_id} value={r.leave_type_id}>
                      {r.name} · {r.paid ? "Paid" : "Unpaid"}
                    </option>
                  ))}
                </select>
                {invalid("leave_type_id")}
                {types.error && (
                  <ErrorState
                    error={types.error}
                    retry={() => types.refetch()}
                  />
                )}
              </div>
              {policy && (
                <div className="workforce-policy-note field-wide">
                  <strong>{policy.name}</strong>
                  <p>
                    Approval:{" "}
                    {(policy.approval_roles || []).map(titleCase).join(" → ") ||
                      "Configured approvers"}
                    .{" "}
                    {policy.requires_document
                      ? "A supporting document is required."
                      : "A supporting document is optional."}
                  </p>
                </div>
              )}
              <div className="field">
                <label htmlFor="leave-start">Start date *</label>
                <input
                  className="input"
                  id="leave-start"
                  type="date"
                  {...register("start_date")}
                  aria-invalid={!!errors.start_date}
                />
                {invalid("start_date")}
              </div>
              <div className="field">
                <label htmlFor="leave-end">End date *</label>
                <input
                  className="input"
                  id="leave-end"
                  type="date"
                  min={values.start_date}
                  {...register("end_date")}
                  aria-invalid={!!errors.end_date}
                />
                {invalid("end_date")}
              </div>
              <div className="field field-wide">
                <label htmlFor="leave-reason">Reason *</label>
                <textarea
                  className="input"
                  id="leave-reason"
                  rows={3}
                  {...register("reason")}
                  aria-invalid={!!errors.reason}
                />
                {invalid("reason")}
              </div>
              <div className="field field-wide">
                <label htmlFor="leave-document">
                  <Paperclip size={14} /> Supporting document
                </label>
                {attachment && (
                  <p className="muted">
                    A private document is attached. Choose a file to replace it.
                  </p>
                )}
                <input
                  ref={fileRef}
                  className="input"
                  id="leave-document"
                  type="file"
                  accept="application/pdf,image/png,image/jpeg"
                  onChange={(e) => {
                    const selected = e.target.files?.[0] || null;
                    setFile(selected);
                    setAttachment("");
                    setFileError(
                      selected ? validateAttachment(selected) || "" : "",
                    );
                    uploadKey.current = crypto.randomUUID();
                  }}
                  aria-describedby="leave-document-help"
                />
                <small id="leave-document-help" className="field-hint">
                  PDF, PNG, or JPEG up to 5 MB. Only authorized users can
                  download this file.
                </small>
                {fileError && (
                  <p role="alert" className="field-error">
                    {fileError}
                  </p>
                )}
              </div>
              <div className="field field-wide">
                <label htmlFor="leave-save-as">Save as</label>
                <select
                  id="leave-save-as"
                  className="input"
                  {...register("status")}
                >
                  <option value="draft">Draft — finish later</option>
                  <option value="pending">Submit for approval</option>
                </select>
              </div>
            </div>
          </fieldset>
          {save.error && (
            <p className="form-error" role="alert">
              {save.error.message}
            </p>
          )}
          <div className="form-actions">
            <Button
              type="button"
              variant="outline"
              disabled={save.isPending}
              onClick={onClose}
            >
              Cancel
            </Button>
            <Button type="submit" disabled={save.isPending || types.isPending}>
              {save.isPending
                ? "Saving…"
                : values.status === "draft"
                  ? "Save draft"
                  : "Submit request"}
            </Button>
          </div>
        </form>
      </DialogContent>
    </Dialog>
  );
}
export function LeaveRequests({
  filters,
  fixedEmployeeId,
}: {
  filters: Partial<WorkforceFilters>;
  fixedEmployeeId?: string;
}) {
  const { can, session } = useAuth();
  const [record, setRecord] = useState<Row | null>(null);
  const [detail, setDetail] = useState<Row | null>(null);
  const [form, setForm] = useState<FormSpec | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const [error, setError] = useState<Error | null>(null);
  const mayWrite = can("leave.write") || can("self.leave");
  function decision(r: Row, action: string) {
    setForm({
      title: `${titleCase(action)} leave request`,
      description: `${r.employee_name || "Employee"} · ${formatDate(r.start_date)} – ${formatDate(r.end_date)}. ${r.reason || ""} This decision is recorded in the approval history.`,
      path: `/workforce/leave/${r.leave_id}/${action}`,
      fields: [commentsField],
      submitLabel: titleCase(action),
    });
  }
  return (
    <>
      {error && <ErrorState error={error} />}
      <RecordList
        resource="leave"
        filters={{
          ...filters,
          employee_id: fixedEmployeeId || filters.employee_id,
        }}
        idKey="leave_id"
        title="Leave requests"
        action={
          mayWrite && (
            <Button onClick={() => setRecord({})}>
              <Plus size={16} />
              Request leave
            </Button>
          )
        }
        columns={[
          {
            key: "employee_name",
            label: "Employee",
            render: (r) => <EmployeeName row={r} />,
          },
          {
            key: "leave_type_name",
            label: "Leave type",
            render: (r) => r.leave_type_name || r.leave_type || "—",
          },
          {
            key: "start_date",
            label: "Dates",
            render: (r) => (
              <div>
                {formatDate(r.start_date)}
                <span className="cell-secondary">
                  to {formatDate(r.end_date)}
                </span>
              </div>
            ),
          },
          { key: "days", label: "Working days" },
          { key: "reason", label: "Reason" },
          {
            key: "status",
            label: "Status",
            render: (r) => (
              <>
                <Status value={r.status} />
                {r.status === "pending" && Array.isArray(r.approval_roles) && (
                  <span className="cell-secondary">
                    Stage {Number(r.approval_level || 0) + 1} of{" "}
                    {r.approval_roles.length} ·{" "}
                    {titleCase(
                      r.approval_roles[Number(r.approval_level || 0)] ||
                        "review",
                    )}
                  </span>
                )}
              </>
            ),
          },
          {
            key: "actions",
            label: "Actions",
            render: (r) => {
              const own = r.employee_id === session?.user.employee_id;
              const ownWrite = can("leave.write") || (can("self.leave") && own);
              const ownRequest = own || r.created_by === session?.user.user_id;
              const policyAllows =
                (r.policy_snapshot?.allow_self_approval === true ||
                  r.allow_self_approval === true) &&
                session?.user.role === "administrator";
              const currentRole =
                r.approval_roles?.[Number(r.approval_level || 0)];
              const approver =
                can("leave.approve") &&
                (!ownRequest || policyAllows) &&
                (session?.user.role === "administrator" ||
                  currentRole === session?.user.role);
              return (
                <div className="row-actions">
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setDetail(r)}
                  >
                    Details
                  </Button>
                  {r.supporting_attachment_id && (
                    <Button
                      variant="ghost"
                      size="sm"
                      aria-label={`Download supporting document for ${r.employee_name || "leave request"}`}
                      onClick={() =>
                        downloadFile(
                          `/workforce/leave-attachments/${r.supporting_attachment_id}/download`,
                          "leave-supporting-document",
                        ).catch(setError)
                      }
                    >
                      <Download size={15} />
                    </Button>
                  )}
                  {r.status === "draft" && ownWrite && (
                    <>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => setRecord(r)}
                      >
                        Edit
                      </Button>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() =>
                          setConfirm({
                            title: "Submit leave request?",
                            description:
                              "The server will check the document requirement, overlapping requests, and leave balance before submission.",
                            operation: {
                              path: `/workforce/leave/${r.leave_id}/submit`,
                            },
                            label: "Submit request",
                          })
                        }
                      >
                        Submit
                      </Button>
                    </>
                  )}
                  {r.status === "pending" && approver && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => decision(r, "approve")}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => decision(r, "reject")}
                      >
                        Reject
                      </Button>
                    </>
                  )}
                  {["draft", "pending", "approved"].includes(r.status) &&
                    ownWrite && (
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() =>
                          setConfirm({
                            title: "Cancel leave request?",
                            description:
                              "Cancellation releases the reserved leave balance when permitted. Recorded attendance and finalized payroll protections still apply.",
                            operation: {
                              path: `/workforce/leave/${r.leave_id}/cancel`,
                            },
                            label: "Cancel request",
                            destructive: true,
                          })
                        }
                      >
                        Cancel
                      </Button>
                    )}
                </div>
              );
            },
          },
        ]}
      />
      <Dialog open={!!detail} onOpenChange={(o) => !o && setDetail(null)}>
        <DialogContent className="workforce-detail">
          <DialogTitle>Leave request details</DialogTitle>
          <DialogDescription>
            Request dates, policy, and recorded approval decisions.
          </DialogDescription>
          {detail && (
            <>
              <DetailGrid
                record={{
                  ...detail,
                  leave_type_name: detail.leave_type_name || detail.leave_type,
                  approval_stages: (detail.approval_roles || [])
                    .map(titleCase)
                    .join(" → "),
                }}
                fields={[
                  { key: "employee_name", label: "Employee" },
                  { key: "leave_type_name", label: "Leave type" },
                  { key: "start_date", label: "Start date", type: "date" },
                  { key: "end_date", label: "End date", type: "date" },
                  { key: "days", label: "Working days" },
                  { key: "status", label: "Status", type: "status" },
                  { key: "reason", label: "Reason" },
                  { key: "approval_stages", label: "Approval stages" },
                  { key: "comments", label: "Latest decision comments" },
                ]}
              />
              <DecisionHistory decisions={detail.decisions} />
            </>
          )}
        </DialogContent>
      </Dialog>
      {record && (
        <LeaveRequestDialog
          record={record}
          fixedEmployeeId={fixedEmployeeId}
          onClose={() => setRecord(null)}
        />
      )}
      <FormDialog spec={form} onClose={() => setForm(null)} />
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
export function LeaveBalances({ employeeId }: { employeeId?: string }) {
  const [year, setYear] = useState(new Date().getFullYear());
  return (
    <>
      <div className="workforce-inline-filter">
        <label htmlFor="balance-year">Balance year</label>
        <input
          className="input"
          id="balance-year"
          type="number"
          min="2000"
          max="2200"
          value={year}
          onChange={(e) => setYear(Number(e.target.value))}
        />
      </div>
      <RecordList
        resource="leave-balances"
        filters={{ employee_id: employeeId, year }}
        idKey="leave_type_id"
        title="Leave balances"
        searchable={false}
        columns={[
          {
            key: "employee_name",
            label: "Employee",
            render: (r) => <EmployeeName row={r} />,
          },
          { key: "leave_type_name", label: "Leave type" },
          { key: "entitled", label: "Entitled" },
          { key: "accrued", label: "Accrued" },
          { key: "carried", label: "Carried" },
          { key: "used", label: "Used" },
          { key: "pending", label: "Pending" },
          {
            key: "available",
            label: "Available",
            render: (r) => <strong>{r.available} days</strong>,
          },
        ]}
      />
    </>
  );
}
export function LeaveCalendar({
  filters,
}: {
  filters: Partial<WorkforceFilters>;
}) {
  const [month, setMonth] = useState(today().slice(0, 7));
  const first = new Date(`${month}-01T12:00:00Z`);
  const last = new Date(
    Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + 1, 0),
  );
  const from = `${month}-01`;
  const to = last.toISOString().slice(0, 10);
  const query = useAllWorkforceRows("leave-calendar", {
    employee_id: filters.employee_id,
    department_id: filters.department_id,
    date_from: from,
    date_to: to,
    pageSize: 100,
  });
  function move(amount: number) {
    setMonth(
      new Date(
        Date.UTC(first.getUTCFullYear(), first.getUTCMonth() + amount, 1),
      )
        .toISOString()
        .slice(0, 7),
    );
  }
  const rows = query.data?.data || [];
  return (
    <SectionCard
      title="Leave calendar"
      subtitle="Pending and approved requests across the selected month"
      action={
        <div className="row-actions">
          <Button
            variant="ghost"
            size="sm"
            aria-label="Previous month"
            onClick={() => move(-1)}
          >
            <ChevronLeft size={16} />
          </Button>
          <label className="sr-only" htmlFor="calendar-month">
            Calendar month
          </label>
          <input
            id="calendar-month"
            className="input"
            type="month"
            value={month}
            onChange={(e) => e.target.value && setMonth(e.target.value)}
          />
          <Button
            variant="ghost"
            size="sm"
            aria-label="Next month"
            onClick={() => move(1)}
          >
            <ChevronRight size={16} />
          </Button>
        </div>
      }
    >
      {query.isPending ? (
        <Loading />
      ) : query.error ? (
        <ErrorState error={query.error} retry={() => query.refetch()} />
      ) : (
        <>
          <div className="workforce-calendar">
            {["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"].map((d) => (
              <div className="calendar-weekday" key={d}>
                {d}
              </div>
            ))}
            {Array.from({ length: first.getUTCDay() }, (_, i) => (
              <div className="calendar-blank" key={`blank${i}`} />
            ))}
            {Array.from({ length: last.getUTCDate() }, (_, i) => {
              const date = `${month}-${String(i + 1).padStart(2, "0")}`;
              const dayRows = rows.filter(
                (r) =>
                  r.start_date <= date &&
                  r.end_date >= date &&
                  ["pending", "approved"].includes(r.status),
              );
              return (
                <div
                  key={date}
                  className={`calendar-day ${date === today() ? "calendar-today" : ""}`}
                >
                  <time dateTime={date}>{i + 1}</time>
                  {dayRows.slice(0, 3).map((r) => (
                    <span
                      key={r.leave_id}
                      className={`calendar-leave ${r.status}`}
                      title={`${r.employee_name || "Your leave"} · ${r.leave_type_name || "Leave"} · ${r.status}`}
                    >
                      {r.employee_name || "Your leave"}
                    </span>
                  ))}
                  {dayRows.length > 3 && (
                    <small>+{dayRows.length - 3} more</small>
                  )}
                </div>
              );
            })}
          </div>
          {rows.length === 0 && (
            <EmptyState
              title="No leave in this month"
              description="Leave requests will appear on the calendar when they are submitted."
            />
          )}
          <div className="calendar-agenda">
            {rows
              .filter((r) => ["pending", "approved"].includes(r.status))
              .map((r) => (
                <div key={r.leave_id}>
                  <EmployeeName row={r} />
                  <span>
                    {formatDate(r.start_date)} – {formatDate(r.end_date)}
                  </span>
                  <Status value={r.status} />
                </div>
              ))}
          </div>
        </>
      )}
    </SectionCard>
  );
}
