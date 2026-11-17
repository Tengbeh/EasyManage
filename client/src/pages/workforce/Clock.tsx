import { useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Coffee, LogIn, LogOut, Play, ShieldCheck, Timer } from "lucide-react";
import { request } from "@/lib/api";
import { useAuth } from "@/lib/auth";
import { formatDate, formatDateTime, personName, type Row } from "@/lib/utils";
import {
  DetailGrid,
  EmptyState,
  ErrorState,
  Loading,
  SectionCard,
  Status,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import { clockState, duration } from "./model";
import { useWorkforceAction } from "./shared";

export function ClockActions({
  attendance,
  trackBreaks = false,
  pending,
  onAction,
}: {
  attendance?: Row | null;
  trackBreaks?: boolean;
  pending: boolean;
  onAction: (action: string) => void;
}) {
  const state = clockState(attendance);
  if (
    attendance &&
    !attendance.clock_in &&
    !(
      attendance.source === "reconciliation" &&
      attendance.approval_status === "pending" &&
      attendance.status === "absent"
    )
  )
    return (
      <p className="clock-note">
        A {String(attendance.status || "recorded").replaceAll("_", " ")}{" "}
        attendance record already exists for today. Request a correction from
        the Attendance tab if it needs to change.
      </p>
    );
  return (
    <div className="clock-actions" aria-label="Attendance clock actions">
      {state === "not_started" ? (
        <Button disabled={pending} onClick={() => onAction("clock-in")}>
          <LogIn size={17} />
          Clock in
        </Button>
      ) : state === "complete" ? (
        <p>
          <ShieldCheck size={17} />
          Your workday is complete.
        </p>
      ) : (
        <>
          {(trackBreaks || state === "on_break") && (
            <Button
              variant="outline"
              disabled={pending}
              onClick={() =>
                onAction(state === "on_break" ? "break-end" : "break-start")
              }
            >
              {state === "on_break" ? <Play size={17} /> : <Coffee size={17} />}{" "}
              {state === "on_break" ? "End break" : "Start break"}
            </Button>
          )}
          <Button
            disabled={pending || state === "on_break"}
            onClick={() => onAction("clock-out")}
          >
            <LogOut size={17} />
            Clock out
          </Button>
          {state === "on_break" && (
            <small>End your break before clocking out.</small>
          )}
        </>
      )}
    </div>
  );
}
export function MyDay() {
  const { can, session } = useAuth();
  const enabled =
    (can("self.attendance") || can("self.leave")) &&
    !!session?.user.employee_id;
  const query = useQuery({
    queryKey: ["workforce/me"],
    queryFn: () => request<Row>("/workforce/me"),
    enabled,
    refetchInterval: 30000,
  });
  const action = useWorkforceAction("Attendance updated");
  if (!enabled)
    return (
      <EmptyState
        icon={ShieldCheck}
        title="Link your employee record"
        description="Ask an administrator to link your account to your employee record before using personal attendance or leave."
      />
    );
  if (query.isPending) return <Loading label="Loading your workday…" />;
  if (query.isError)
    return <ErrorState error={query.error} retry={() => query.refetch()} />;
  const data = query.data?.data || {};
  const attendance = data.attendance;
  const state = clockState(attendance);
  const schedule = data.schedule;
  return (
    <div className="my-day-layout">
      <SectionCard
        title={`Your day, ${personName(data.employee).split(" ")[0]}`}
        subtitle="Clock actions are recorded using the server’s time."
      >
        <div className="clock-panel">
          <div className="clock-status">
            <span className="metric-icon teal">
              <Timer size={24} />
            </span>
            <div>
              <span>Today’s attendance</span>
              <Status
                value={
                  state === "not_started"
                    ? "not_started"
                    : state === "complete"
                      ? "completed"
                      : state
                }
              />
            </div>
          </div>
          <div className="clock-times">
            <div>
              <span>Clock in</span>
              <strong>{formatDateTime(attendance?.clock_in)}</strong>
            </div>
            <div>
              <span>Clock out</span>
              <strong>{formatDateTime(attendance?.clock_out)}</strong>
            </div>
            <div>
              <span>Recorded work</span>
              <strong>{duration(attendance?.work_minutes)}</strong>
            </div>
            <div>
              <span>Recorded breaks</span>
              <strong>{duration(attendance?.break_minutes)}</strong>
            </div>
          </div>
          {can("self.attendance") && (
            <ClockActions
              attendance={attendance}
              trackBreaks={!!schedule?.track_breaks}
              pending={action.isPending}
              onAction={(name) =>
                action.run({ path: `/workforce/${name}`, body: {} })
              }
            />
          )}{" "}
          {action.error && (
            <p role="alert" className="form-error">
              {action.error.message} Your recorded status will update only after
              the server confirms the action.
            </p>
          )}
          <p className="clock-note">
            Recorded totals refresh every 30 seconds. Your schedule’s timezone
            determines the attendance day.
          </p>
          {attendance?.breaks?.length > 0 && (
            <div className="workforce-history">
              <h3>Break history</h3>
              {attendance.breaks.map((b: Row, i: number) => (
                <p key={i}>
                  {formatDateTime(b.started_at)} →{" "}
                  {b.ended_at ? formatDateTime(b.ended_at) : "In progress"}
                </p>
              ))}
            </div>
          )}
        </div>
      </SectionCard>
      <SectionCard
        title="Your current schedule"
        subtitle={schedule?.name || "No assigned schedule"}
      >
        {schedule ? (
          <DetailGrid
            record={{
              ...schedule,
              work_days: (schedule.work_days || [])
                .map(
                  (d: number) =>
                    [
                      "Sunday",
                      "Monday",
                      "Tuesday",
                      "Wednesday",
                      "Thursday",
                      "Friday",
                      "Saturday",
                    ][d],
                )
                .join(", "),
            }}
            fields={[
              { key: "timezone", label: "Timezone" },
              { key: "work_days", label: "Working days" },
              { key: "expected_start", label: "Start time" },
              { key: "expected_end", label: "End time" },
              { key: "grace_minutes", label: "Grace period (minutes)" },
              { key: "break_minutes", label: "Scheduled break (minutes)" },
            ]}
          />
        ) : (
          <EmptyState
            compact
            title="No work schedule assigned"
            description="Ask HR to assign the schedule that applies to you."
          />
        )}
      </SectionCard>
      <SectionCard
        title="Your leave balances"
        subtitle="Balances are calculated by the server using the configured policies"
      >
        <div className="balance-cards">
          {data.leave_balances?.length ? (
            data.leave_balances.map((b: Row) => (
              <div className="balance-card" key={b.leave_type_id}>
                <span>{b.leave_type_name}</span>
                <strong>
                  {b.available} <small>days available</small>
                </strong>
                <p>
                  {b.used} used · {b.pending} pending · {b.accrued} accrued
                </p>
              </div>
            ))
          ) : (
            <EmptyState
              compact
              title="No leave balances yet"
              description="Your balances appear after HR configures leave policies and entitlements."
            />
          )}
        </div>
      </SectionCard>
    </div>
  );
}
