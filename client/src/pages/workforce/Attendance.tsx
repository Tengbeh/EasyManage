import { useState } from "react";
import { Plus, Eye, CheckCircle2, CalendarCheck } from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useRecord } from "@/lib/api";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogTitle,
  DialogDescription,
} from "@/components/ui/dialog";
import {
  FormDialog,
  ConfirmDialog,
  DetailGrid,
  ErrorState,
  Loading,
  Status,
  SectionCard,
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
  DurationCell,
  DecisionHistory,
  type WorkforceFilters,
} from "./shared";
import {
  attendanceFields,
  attendancePayload,
  correctionFields,
  utcInput,
  commentsField,
  duration,
} from "./model";

export function AttendanceLedger({
  filters,
  fixedEmployeeId,
}: {
  filters: Partial<WorkforceFilters>;
  fixedEmployeeId?: string;
}) {
  const { can } = useAuth();
  const [detail, setDetail] = useState<Row | null>(null);
  const [form, setForm] = useState<FormSpec | null>(null);
  return (
    <>
      <RecordList
        resource="attendance"
        filters={{
          ...filters,
          employee_id: fixedEmployeeId || filters.employee_id,
        }}
        idKey="attendance_id"
        title="Attendance records"
        action={
          can("attendance.write") && (
            <>
              <Button
                variant="outline"
                onClick={() =>
                  setForm({
                    title: "Reconcile attendance",
                    description:
                      "Create missing absence, holiday, rest-day, and approved-leave records for this date. This does not create payroll deductions.",
                    path: "/workforce/attendance/reconcile",
                    fields: [
                      {
                        name: "date",
                        label: "Date to reconcile",
                        type: "date",
                        required: true,
                        default: today(),
                      },
                    ],
                    submitLabel: "Reconcile date",
                  })
                }
              >
                <CalendarCheck size={16} />
                Reconcile date
              </Button>
              <Button
                onClick={() =>
                  setForm({
                    title: "Record attendance",
                    path: "/workforce/attendance",
                    fields: attendanceFields.filter(
                      (f) => !fixedEmployeeId || f.name !== "employee_id",
                    ),
                    transform: (v) =>
                      attendancePayload({
                        ...v,
                        ...(fixedEmployeeId
                          ? { employee_id: fixedEmployeeId }
                          : {}),
                      }),
                  })
                }
              >
                <Plus size={16} />
                Record attendance
              </Button>
            </>
          )
        }
        columns={[
          {
            key: "employee_name",
            label: "Employee",
            render: (r) => <EmployeeName row={r} />,
          },
          { key: "date", label: "Date", render: (r) => formatDate(r.date) },
          {
            key: "clock_in",
            label: "Clock in",
            render: (r) => formatDateTime(r.clock_in),
          },
          {
            key: "clock_out",
            label: "Clock out",
            render: (r) => formatDateTime(r.clock_out),
          },
          {
            key: "work_minutes",
            label: "Worked",
            render: (r) => <DurationCell value={r.work_minutes} />,
          },
          {
            key: "overtime_minutes",
            label: "Overtime",
            render: (r) => <DurationCell value={r.overtime_minutes} />,
          },
          {
            key: "status",
            label: "Attendance",
            render: (r) => <Status value={r.status} />,
          },
          {
            key: "approval_status",
            label: "Review",
            render: (r) => <Status value={r.approval_status} />,
          },
          {
            key: "actions",
            label: "Details",
            render: (r) => (
              <Button
                variant="ghost"
                size="sm"
                aria-label={`View attendance for ${r.employee_name || "employee"} on ${r.date}`}
                onClick={() => setDetail(r)}
              >
                <Eye size={16} />
                Review
              </Button>
            ),
          },
        ]}
      />
      <FormDialog spec={form} onClose={() => setForm(null)} />
      {detail && (
        <AttendanceDetail
          id={detail.attendance_id}
          onClose={() => setDetail(null)}
        />
      )}
    </>
  );
}
export function AttendanceDetail({
  id,
  onClose,
}: {
  id: string;
  onClose: () => void;
}) {
  const { can } = useAuth();
  const query = useRecord(`workforce/attendance/${id}`);
  const [form, setForm] = useState<FormSpec | null>(null);
  const [confirm, setConfirm] = useState<ConfirmSpec | null>(null);
  const data = query.data?.data;
  const row = data?.attendance;
  return (
    <>
      <Dialog open onOpenChange={(o) => !o && onClose()}>
        <DialogContent className="workforce-detail">
          <DialogTitle>Attendance record</DialogTitle>
          <DialogDescription>
            Recorded time, corrections, and approval history. Clock times below
            follow your workspace display preferences.
          </DialogDescription>
          {query.isPending ? (
            <Loading />
          ) : query.error ? (
            <ErrorState error={query.error} retry={() => query.refetch()} />
          ) : (
            row && (
              <>
                <div className="workforce-detail-summary">
                  <EmployeeName row={row} />
                  <span>{formatDate(row.date)}</span>
                  <Status value={row.status} />
                  <Status value={row.approval_status} />
                </div>
                <DetailGrid
                  record={{
                    ...row,
                    worked: duration(row.work_minutes),
                    break_duration: duration(row.break_minutes),
                    late: duration(row.late_minutes),
                    early: duration(row.early_minutes),
                    overtime: duration(row.overtime_minutes),
                    clock_in: formatDateTime(row.clock_in),
                    clock_out: formatDateTime(row.clock_out),
                  }}
                  fields={[
                    { key: "clock_in", label: "Clock in" },
                    { key: "clock_out", label: "Clock out" },
                    { key: "worked", label: "Worked" },
                    { key: "break_duration", label: "Breaks" },
                    { key: "late", label: "Late arrival" },
                    { key: "early", label: "Early departure" },
                    { key: "overtime", label: "Overtime" },
                    { key: "source", label: "Source" },
                    { key: "reason", label: "Recorded reason" },
                  ]}
                />
                {row.schedule_snapshot && (
                  <SectionCard title="Schedule at the time">
                    <DetailGrid
                      record={row.schedule_snapshot}
                      fields={[
                        { key: "name", label: "Schedule" },
                        { key: "timezone", label: "Timezone" },
                        { key: "expected_start", label: "Starts" },
                        { key: "expected_end", label: "Ends" },
                        { key: "grace_minutes", label: "Grace (minutes)" },
                        {
                          key: "overtime_multiplier",
                          label: "Overtime multiplier",
                        },
                      ]}
                    />
                  </SectionCard>
                )}
                {Array.isArray(row.breaks) && row.breaks.length > 0 && (
                  <SectionCard title="Break history">
                    {row.breaks.map((b: Row, i: number) => (
                      <p key={i}>
                        {formatDateTime(b.started_at)} —{" "}
                        {b.ended_at
                          ? formatDateTime(b.ended_at)
                          : "In progress"}
                      </p>
                    ))}
                  </SectionCard>
                )}
                <div className="workforce-actions">
                  {(can("attendance.write") || can("self.attendance")) && (
                    <Button
                      variant="outline"
                      onClick={() =>
                        setForm({
                          title: "Request attendance correction",
                          description:
                            "Explain the change and enter corrected UTC times. Approved corrections are audited and do not rewrite finalized payroll history.",
                          path: "/workforce/corrections",
                          fields: correctionFields,
                          initial: {
                            ...row,
                            clock_in: utcInput(row.clock_in),
                            clock_out: utcInput(row.clock_out),
                            reason: "",
                          },
                          transform: (v) => ({
                            ...attendancePayload(v),
                            attendance_id: id,
                          }),
                        })
                      }
                    >
                      Request correction
                    </Button>
                  )}
                  {can("attendance.approve") &&
                    row.approval_status !== "finalized" &&
                    row.approval_status !== "approved" && (
                      <Button
                        onClick={() =>
                          setConfirm({
                            title: "Approve attendance?",
                            description:
                              "Confirm that the recorded times and classification have been reviewed.",
                            operation: {
                              path: `/workforce/attendance/${id}/approve`,
                            },
                            label: "Approve attendance",
                          })
                        }
                      >
                        <CheckCircle2 size={16} />
                        Approve
                      </Button>
                    )}
                  {can("attendance.approve") &&
                    row.approval_status === "approved" && (
                      <Button
                        onClick={() =>
                          setConfirm({
                            title: "Finalize attendance?",
                            description:
                              "Finalize this reviewed record so it can be used as a source for approved payroll inputs. Future changes require an audited correction.",
                            operation: {
                              path: `/workforce/attendance/${id}/finalize`,
                            },
                            label: "Finalize record",
                          })
                        }
                      >
                        Finalize
                      </Button>
                    )}
                </div>
                <SectionCard title="Correction requests">
                  {data.corrections?.length ? (
                    data.corrections.map((r: Row) => (
                      <div
                        className="workforce-history-entry"
                        key={r.correction_id}
                      >
                        <Status value={r.status} />
                        <p>{r.reason}</p>
                        <small>{formatDateTime(r.created_at)}</small>
                      </div>
                    ))
                  ) : (
                    <p className="muted">No corrections requested.</p>
                  )}
                </SectionCard>
                <DecisionHistory decisions={data.decisions} />
              </>
            )
          )}
        </DialogContent>
      </Dialog>
      <FormDialog spec={form} onClose={() => setForm(null)} />
      <ConfirmDialog spec={confirm} onClose={() => setConfirm(null)} />
    </>
  );
}
export function Corrections({
  filters,
}: {
  filters: Partial<WorkforceFilters>;
}) {
  const { can, session } = useAuth();
  const [form, setForm] = useState<FormSpec | null>(null);
  const [detail, setDetail] = useState<string | null>(null);
  function decide(row: Row, decision: string) {
    setForm({
      title: `${titleCase(decision)} correction`,
      description: `Review ${row.employee_name || "the employee"}’s proposed times before recording your decision.`,
      path: `/workforce/corrections/${row.correction_id}/${decision}`,
      fields: [commentsField],
      submitLabel: titleCase(decision),
    });
  }
  return (
    <>
      <RecordList
        resource="corrections"
        filters={filters}
        idKey="correction_id"
        title="Correction requests"
        columns={[
          {
            key: "employee_name",
            label: "Employee",
            render: (r) => <EmployeeName row={r} />,
          },
          {
            key: "clock_in",
            label: "Proposed clock in",
            render: (r) => formatDateTime(r.clock_in),
          },
          {
            key: "clock_out",
            label: "Proposed clock out",
            render: (r) => formatDateTime(r.clock_out),
          },
          {
            key: "break_minutes",
            label: "Breaks",
            render: (r) => duration(r.break_minutes),
          },
          { key: "reason", label: "Reason" },
          {
            key: "status",
            label: "Status",
            render: (r) => <Status value={r.status} />,
          },
          {
            key: "actions",
            label: "Review",
            render: (r) => (
              <div className="row-actions">
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => setDetail(r.attendance_id)}
                >
                  View record
                </Button>
                {r.status === "pending" &&
                  can("attendance.approve") &&
                  r.requested_by !== session?.user.user_id && (
                    <>
                      <Button
                        variant="outline"
                        size="sm"
                        onClick={() => decide(r, "approve")}
                      >
                        Approve
                      </Button>
                      <Button
                        variant="ghost"
                        size="sm"
                        onClick={() => decide(r, "reject")}
                      >
                        Reject
                      </Button>
                    </>
                  )}
              </div>
            ),
          },
        ]}
      />
      <FormDialog spec={form} onClose={() => setForm(null)} />
      {detail && (
        <AttendanceDetail id={detail} onClose={() => setDetail(null)} />
      )}
    </>
  );
}
