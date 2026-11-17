import { useState } from "react";
import { Link } from "react-router-dom";
import {
  Area,
  AreaChart,
  Bar,
  BarChart,
  CartesianGrid,
  Cell,
  Legend,
  Pie,
  PieChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  ArrowDownLeft,
  ArrowRight,
  ArrowUpRight,
  Banknote,
  Building2,
  CalendarDays,
  CheckCircle2,
  ChevronRight,
  Clock3,
  Gift,
  HandCoins,
  Plus,
  Receipt,
  ShieldCheck,
  TrendingUp,
  UserCheck,
  Users,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useRecord } from "@/lib/api";
import {
  formatDate,
  formatActivity,
  formatMoney,
  monthLabel,
  monthNow,
  personName,
  titleCase,
  type Row,
} from "@/lib/utils";
import { Button } from "@/components/ui/button";
import {
  Avatar,
  EmptyState,
  ErrorState,
  Loading,
  PageHeader,
  PersonCell,
  SectionCard,
  Status,
} from "@/components/shared";
const colors = [
  "#4e6cf5",
  "#18b7a0",
  "#9aaefb",
  "#80d7c6",
  "#f5ba61",
  "#a88ee3",
];
export function Dashboard() {
  const { session, can } = useAuth();
  const [month, setMonth] = useState(monthNow());
  const q = useRecord(`dashboard?month=${month}`);
  const settings = useRecord("settings");
  const currency = settings.data?.data?.currency || "USD";
  const data = q.data?.data || {};
  const metrics = data?.metrics || {};
  const name = personName(session?.user).split(" ")[0];
  const stats = [
    {
      key: "total_employees",
      label: "Total employees",
      icon: Users,
      tone: "blue",
      sub:
        metrics.active_employees !== undefined
          ? `${metrics.active_employees} active employees`
          : "Your workforce",
      href: "/employees",
    },
    {
      key: "monthly_net_payroll",
      label: "Monthly net payroll",
      icon: Wallet,
      tone: "teal",
      money: true,
      sub: "Finalized payroll",
      href: "/payroll",
    },
    {
      key: "outstanding_loans",
      label: "Outstanding loans",
      icon: HandCoins,
      tone: "purple",
      money: true,
      sub: "Remaining employee balances",
      href: "/loans",
    },
    {
      key: "pending_payroll_approvals",
      label: "Pending approvals",
      icon: ClipboardIcon,
      tone: "amber",
      sub: "Payroll awaiting review",
      href: "/payroll",
    },
  ].filter((s) => s.key in metrics);
  return (
    <>
      <PageHeader
        eyebrow="WORKSPACE OVERVIEW"
        title={`Welcome back, ${name}.`}
        description="Here’s what’s happening with your people and payroll."
        actions={
          <>
            <input
              className="input month-picker"
              type="month"
              aria-label="Dashboard month"
              value={month}
              onChange={(e) => e.target.value && setMonth(e.target.value)}
            />
            {can("employees.write") && (
              <Button asChild>
                <Link to="/employees">
                  <Plus size={17} />
                  Add employee
                </Link>
              </Button>
            )}
          </>
        }
      />
      {q.isPending ? (
        <Loading label="Preparing your overview…" />
      ) : q.isError ? (
        <ErrorState error={q.error} retry={() => q.refetch()} />
      ) : (
        <>
          <div className="metric-grid">
            {stats.map((s) => (
              <Link to={s.href} key={s.key} className="metric-card">
                <div className="metric-top">
                  <span>{s.label}</span>
                  <span className={`metric-icon ${s.tone}`}>
                    <s.icon size={19} />
                  </span>
                </div>
                <strong>
                  {s.money
                    ? formatMoney(metrics[s.key], currency)
                    : metrics[s.key]}
                </strong>
                <div className="metric-bottom">
                  <span>{s.sub}</span>
                  <ArrowUpRight size={15} />
                </div>
              </Link>
            ))}
          </div>
          <div className="dashboard-primary">
            {can("payroll.read") && (
              <SectionCard
                title="Payroll overview"
                subtitle="Gross and net payroll over time"
                action={
                  <Link className="subtle-link" to="/payroll">
                    View payroll <ArrowRight size={14} />
                  </Link>
                }
              >
                <div className="chart-summary">
                  <div>
                    <span>Gross payroll · {monthLabel(month)}</span>
                    <strong>
                      {formatMoney(metrics.monthly_gross_payroll, currency)}
                    </strong>
                  </div>
                  <div className="chart-legend">
                    <span>
                      <i style={{ background: colors[0] }} />
                      Gross payroll
                    </span>
                    <span>
                      <i style={{ background: colors[1] }} />
                      Net payroll
                    </span>
                  </div>
                </div>
                <div className="chart-area">
                  {data?.payroll_trend?.length ? (
                    <ResponsiveContainer width="100%" height={250}>
                      <AreaChart
                        data={data.payroll_trend.map((r: Row) => ({
                          ...r,
                          gross: Number(r.gross),
                          net: Number(r.net),
                        }))}
                        margin={{ left: 4, right: 22, top: 10, bottom: 5 }}
                      >
                        <defs>
                          <linearGradient
                            id="gross-fill"
                            x1="0"
                            y1="0"
                            x2="0"
                            y2="1"
                          >
                            <stop
                              offset="0%"
                              stopColor={colors[0]}
                              stopOpacity={0.16}
                            />
                            <stop
                              offset="100%"
                              stopColor={colors[0]}
                              stopOpacity={0}
                            />
                          </linearGradient>
                        </defs>
                        <CartesianGrid
                          vertical={false}
                          stroke="#edf0f5"
                          strokeDasharray="4 4"
                        />
                        <XAxis
                          dataKey="month"
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: "#8a95a7" }}
                          tickFormatter={(v) => String(v).slice(5)}
                        />
                        <YAxis
                          axisLine={false}
                          tickLine={false}
                          tick={{ fontSize: 11, fill: "#8a95a7" }}
                          width={70}
                          tickFormatter={(v) => formatMoney(v, currency, true)}
                        />
                        <Tooltip
                          formatter={(v) => formatMoney(v, currency)}
                          contentStyle={{
                            border: "1px solid #e8ecf4",
                            borderRadius: 10,
                          }}
                        />
                        <Area
                          type="monotone"
                          dataKey="gross"
                          name="Gross payroll"
                          stroke={colors[0]}
                          strokeWidth={2.5}
                          fill="url(#gross-fill)"
                        />
                        <Area
                          type="monotone"
                          dataKey="net"
                          name="Net payroll"
                          stroke={colors[1]}
                          strokeWidth={2.5}
                          fill="transparent"
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <EmptyState
                      compact
                      icon={TrendingUp}
                      title="Your payroll trends will appear here"
                      description="Finalize a payroll run to start tracking gross and net totals."
                    />
                  )}
                </div>
              </SectionCard>
            )}
            <SectionCard
              title="Team by department"
              subtitle="How your people are organized"
              action={<Building2 size={18} className="muted" />}
            >
              {data?.department_distribution?.length ? (
                <>
                  <div className="donut-wrap">
                    <ResponsiveContainer width="100%" height={205}>
                      <PieChart>
                        <Pie
                          data={data.department_distribution}
                          dataKey="value"
                          nameKey="name"
                          innerRadius={65}
                          outerRadius={88}
                          paddingAngle={4}
                          stroke="none"
                        >
                          {data.department_distribution.map(
                            (department: Row, i: number) => (
                              <Cell
                                key={i}
                                fill={colors[i % colors.length]}
                                aria-label={`${department.name}: ${department.value} employees`}
                              />
                            ),
                          )}
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                    <div className="donut-center">
                      <strong>{metrics.total_employees ?? "—"}</strong>
                      <span>employees</span>
                    </div>
                  </div>
                  <div className="distribution-legend">
                    {data.department_distribution.map((d: Row, i: number) => (
                      <div key={d.name}>
                        <span>
                          <i
                            style={{ background: colors[i % colors.length] }}
                          />
                          {d.name}
                        </span>
                        <strong>{d.value}</strong>
                      </div>
                    ))}
                  </div>
                </>
              ) : (
                <EmptyState
                  compact
                  icon={Building2}
                  title="Build your organization"
                  description="Department distribution appears as you add employees."
                />
              )}
            </SectionCard>
          </div>
          <div className="dashboard-secondary">
            <SectionCard
              title="Employment status"
              subtitle="Your current workforce"
            >
              <div className="status-overview">
                {["active", "on_leave", "inactive"].map((s, i) => (
                  <div key={s}>
                    <span className={`status-marker marker-${i}`} />
                    <span>{titleCase(s)}</span>
                    <strong>
                      {metrics[
                        s === "on_leave" ? "on_leave" : s + "_employees"
                      ] ?? "—"}
                    </strong>
                  </div>
                ))}
              </div>
              {data?.status_distribution?.length > 0 && (
                <div className="status-bar">
                  {data.status_distribution
                    .filter((r: Row) => Number(r.value) > 0)
                    .map((r: Row, i: number) => (
                      <span
                        key={r.name}
                        style={{
                          flex: Number(r.value),
                          background: colors[i % colors.length],
                        }}
                        title={`${titleCase(r.name)}: ${r.value}`}
                      />
                    ))}
                </div>
              )}
            </SectionCard>
            {(can("bonuses.read") || can("penalties.read")) && (
              <SectionCard
                title="Bonuses & penalties"
                subtitle="Approved amounts by month"
              >
                <div className="adjustment-totals">
                  {"total_bonuses" in metrics && (
                    <div>
                      <span>Bonuses</span>
                      <strong>
                        {formatMoney(metrics.total_bonuses, currency)}
                      </strong>
                    </div>
                  )}
                  {"total_penalties" in metrics && (
                    <div>
                      <span>Penalties</span>
                      <strong>
                        {formatMoney(metrics.total_penalties, currency)}
                      </strong>
                    </div>
                  )}
                </div>
                {data?.bonus_penalty_trend?.length ? (
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart
                      data={data.bonus_penalty_trend.map((r: Row) => ({
                        ...r,
                        bonuses: Number(r.bonuses),
                        penalties: Number(r.penalties),
                      }))}
                      margin={{ left: 0, right: 18 }}
                    >
                      <CartesianGrid vertical={false} stroke="#edf0f5" />
                      <XAxis
                        dataKey="month"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10 }}
                      />
                      <Tooltip formatter={(v) => formatMoney(v, currency)} />
                      <Bar
                        dataKey="bonuses"
                        fill={colors[1]}
                        radius={[3, 3, 0, 0]}
                      />
                      <Bar
                        dataKey="penalties"
                        fill="#f3b36b"
                        radius={[3, 3, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState
                    compact
                    icon={Gift}
                    title="No approved adjustments"
                    description="Bonus and penalty trends appear as approvals are recorded."
                  />
                )}
              </SectionCard>
            )}
            {can("loans.read") && (
              <SectionCard
                title="Loan repayments"
                subtitle="Actual repayments over time"
              >
                {data?.loan_repayments?.length ? (
                  <ResponsiveContainer width="100%" height={160}>
                    <BarChart
                      data={data.loan_repayments.map((r: Row) => ({
                        ...r,
                        amount: Number(r.amount),
                      }))}
                      margin={{ left: 0, right: 18 }}
                    >
                      <CartesianGrid vertical={false} stroke="#edf0f5" />
                      <XAxis
                        dataKey="month"
                        axisLine={false}
                        tickLine={false}
                        tick={{ fontSize: 10 }}
                      />
                      <Tooltip formatter={(v) => formatMoney(v, currency)} />
                      <Bar
                        dataKey="amount"
                        fill={colors[0]}
                        radius={[4, 4, 0, 0]}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                ) : (
                  <EmptyState
                    compact
                    icon={HandCoins}
                    title="No repayments recorded"
                    description="Track repayments here when employee loans are paid."
                  />
                )}
              </SectionCard>
            )}
          </div>
          <div className="dashboard-primary">
            <SectionCard
              title="Recent employees"
              subtitle="The latest additions to your team"
              action={
                <Link className="subtle-link" to="/employees">
                  View directory <ArrowRight size={14} />
                </Link>
              }
            >
              {data?.recent_employees?.length ? (
                <div className="dashboard-list">
                  {data.recent_employees.slice(0, 5).map((e: Row) => (
                    <div className="dashboard-list-row" key={e.employee_id}>
                      <PersonCell row={e} subtitle={e.position} />
                      <span className="hide-small">
                        {formatDate(e.hire_date)}
                      </span>
                      <Status value={e.employment_status} />
                    </div>
                  ))}
                </div>
              ) : (
                <EmptyState
                  compact
                  icon={Users}
                  title="Ready for your first employee"
                  description="Your newest team members will appear here."
                  action={
                    can("employees.write") && (
                      <Button asChild variant="outline" size="sm">
                        <Link to="/employees">
                          <Plus size={15} />
                          Add employee
                        </Link>
                      </Button>
                    )
                  }
                />
              )}
            </SectionCard>
            <SectionCard
              title="Pending approvals"
              subtitle="Items that need a decision"
              action={
                <span className="count-badge">
                  {data?.pending_approvals?.length || 0}
                </span>
              }
            >
              {data?.pending_approvals?.length ? (
                <div className="dashboard-list">
                  {data.pending_approvals
                    .slice(0, 5)
                    .map((r: Row, i: number) => (
                      <Link
                        className="approval-item"
                        key={i}
                        to={approvalPath(r)}
                      >
                        <span className="activity-icon">
                          <Clock3 size={16} />
                        </span>
                        <div>
                          <strong>
                            {r.title ||
                              titleCase(
                                r.type || r.module || "Payroll approval",
                              )}
                          </strong>
                          <small>
                            {r.employee_name ||
                              r.payroll_month ||
                              r.description ||
                              "Awaiting your review"}
                          </small>
                        </div>
                        <ChevronRight size={15} />
                      </Link>
                    ))}
                </div>
              ) : (
                <EmptyState
                  compact
                  icon={CheckCircle2}
                  title="You’re all caught up"
                  description="Requests awaiting approval will appear here."
                />
              )}
            </SectionCard>
          </div>
          <div className="dashboard-secondary">
            <ActivityCard
              title="Recent activity"
              rows={data?.recent_activity || []}
              icon={Clock3}
              empty="No activity recorded yet"
            />
            <ActivityCard
              title="Upcoming end dates"
              rows={data?.upcoming_end_dates || []}
              icon={CalendarDays}
              empty="No upcoming employment end dates"
            />
            {can("loans.read") && (
              <ActivityCard
                title="Upcoming installments"
                rows={data?.upcoming_installments || []}
                icon={HandCoins}
                empty="No upcoming loan installments"
                currency={currency}
              />
            )}
          </div>
          {data?.recent_adjustments?.length > 0 && (
            <ActivityCard
              title="Recent adjustments"
              rows={data.recent_adjustments}
              icon={Banknote}
              empty="No recent adjustments"
              currency={currency}
            />
          )}
          <div className="dashboard-footer">
            <span>
              <ShieldCheck size={14} />
              Access is tailored to your permissions
            </span>
            <span>EasyManage · People & payroll</span>
          </div>
        </>
      )}
    </>
  );
}
function ClipboardIcon({ size = 20 }: { size?: number }) {
  return <Receipt size={size} />;
}
function approvalPath(r: Row) {
  if (
    typeof r.href === "string" &&
    r.href.startsWith("/") &&
    !r.href.startsWith("//")
  )
    return r.href;
  const t = String(r.type || r.module || "payroll");
  return (
    "/" +
    ({
      bonus: "bonuses",
      penalty: "penalties",
      loan: "loans",
      leave: "attendance",
    }[t] || t)
  );
}
function ActivityCard({
  title,
  rows,
  icon: Icon,
  empty,
  currency = "USD",
}: {
  title: string;
  rows: Row[];
  icon: typeof Clock3;
  empty: string;
  currency?: string;
}) {
  return (
    <SectionCard title={title}>
      {rows.length ? (
        <div className="activity-list">
          {rows.slice(0, 5).map((r, i) => (
            <ActivityItem key={i} row={r} icon={Icon} currency={currency} />
          ))}
        </div>
      ) : (
        <EmptyState
          compact
          title={empty}
          description="Updates will appear here when available."
          icon={Icon}
        />
      )}
    </SectionCard>
  );
}

function ActivityItem({
  row: r,
  icon: Icon,
  currency,
}: {
  row: Row;
  icon: typeof Clock3;
  currency: string;
}) {
  const { can } = useAuth();
  const employee = useRecord(
    `employees/${r.employee_id}`,
    !!r.installment_id &&
      !!r.employee_id &&
      !r.employee_name &&
      can("employees.read"),
  );
  const name =
    r.employee_name ||
    (employee.data?.data ? personName(employee.data.data) : "");
  const label = r.installment_id
    ? "Loan installment"
    : r.employee_name ||
      r.title ||
      (r.type ? titleCase(r.type) + " adjustment" : undefined) ||
      [r.first_name, r.last_name].filter(Boolean).join(" ") ||
      formatActivity(r.action, r.module);
  const description = r.installment_id
    ? `${name ? name + " · " : ""}Due ${formatDate(r.due_date)}`
    : r.description ||
      r.reason ||
      r.summary ||
      formatDate(
        r.employment_end_date ||
          r.effective_date ||
          r.timestamp ||
          r.created_at,
      );
  return (
    <div className="activity-row">
      <span className="activity-icon">
        <Icon size={16} />
      </span>
      <div>
        <strong>{label}</strong>
        <small>{description}</small>
      </div>
      {(r.installment_amount || r.amount) && (
        <span className="money">
          {formatMoney(r.installment_amount || r.amount, currency)}
        </span>
      )}
    </div>
  );
}
