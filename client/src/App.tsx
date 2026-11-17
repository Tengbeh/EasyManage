import { useEffect, useState, type ReactNode } from "react";
import {
  Link,
  NavLink,
  Navigate,
  Outlet,
  Route,
  Routes,
  useLocation,
  useNavigate,
} from "react-router-dom";
import {
  Bell,
  BookOpen,
  Building2,
  CalendarCheck2,
  ChartNoAxesCombined,
  ChevronDown,
  ChevronRight,
  FileText,
  Gift,
  HandCoins,
  LayoutDashboard,
  LogOut,
  Menu,
  Search,
  Settings,
  ShieldCheck,
  Users,
  UserRoundCog,
  Wallet,
  X,
  TriangleAlert,
  Banknote,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useAction, useList, useRecord } from "@/lib/api";
import { initials, personName, titleCase } from "@/lib/utils";
import {
  Avatar,
  Brand,
  EmptyState,
  ErrorState,
  Loading,
} from "@/components/shared";
import { Button } from "@/components/ui/button";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogTitle,
} from "@/components/ui/dialog";
import { Dashboard } from "@/pages/Dashboard";
import { Employees, EmployeeProfile, Salaries } from "@/pages/Employees";
import { ResourcePage } from "@/pages/Resources";
import { Payroll } from "@/pages/Payroll";
import { Reports } from "@/pages/Reports";
import {
  Notifications,
  Settings as SettingsPage,
} from "@/pages/Administration";
import { Login, Setup } from "@/pages/Auth";
const navigation = [
  { label: "Dashboard", path: "/", icon: LayoutDashboard, group: "WORKSPACE" },
  {
    label: "Employees",
    path: "/employees",
    icon: Users,
    permission: "employees.read",
  },
  {
    label: "Departments",
    path: "/departments",
    icon: Building2,
    permission: "employees.read",
  },
  {
    label: "Salaries",
    path: "/salaries",
    icon: Banknote,
    permission: "salaries.read",
    group: "PAYROLL & FINANCE",
  },
  {
    label: "Bonuses",
    path: "/bonuses",
    icon: Gift,
    permission: "bonuses.read",
  },
  {
    label: "Penalties",
    path: "/penalties",
    icon: TriangleAlert,
    permission: "penalties.read",
  },
  { label: "Loans", path: "/loans", icon: HandCoins, permission: "loans.read" },
  {
    label: "Payroll",
    path: "/payroll",
    icon: Wallet,
    permission: "payroll.read",
  },
  {
    label: "Attendance & leave",
    path: "/attendance",
    icon: CalendarCheck2,
    permission: "attendance.read",
    group: "OPERATIONS",
  },
  {
    label: "Reports",
    path: "/reports",
    icon: ChartNoAxesCombined,
    permission: "reports",
  },
  { label: "Notifications", path: "/notifications", icon: Bell },
  {
    label: "Users & access",
    path: "/users",
    icon: UserRoundCog,
    permission: "users.manage",
    group: "ADMINISTRATION",
  },
  { label: "Settings", path: "/settings", icon: Settings },
];
export function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/setup" element={<Setup />} />
      <Route element={<Protected />}>
        <Route element={<Shell />}>
          <Route index element={<Dashboard />} />
          <Route path="employees" element={<Employees />} />
          <Route path="employees/:id" element={<EmployeeProfile />} />
          <Route path="salaries" element={<Salaries />} />
          {[
            "departments",
            "bonuses",
            "penalties",
            "loans",
            "attendance",
            "users",
          ].map((resource) => (
            <Route
              key={resource}
              path={resource}
              element={<ResourcePage key={resource} resource={resource} />}
            />
          ))}
          <Route path="leave" element={<ResourcePage resource="leave" />} />
          <Route path="payroll" element={<Payroll />} />
          <Route path="reports" element={<Reports />} />
          <Route path="notifications" element={<Notifications />} />
          <Route path="settings" element={<SettingsPage />} />
          <Route
            path="*"
            element={
              <EmptyState
                title="Page not found"
                description="This page may have moved or no longer exists."
                action={
                  <Button asChild>
                    <Link to="/">Return to dashboard</Link>
                  </Button>
                }
              />
            }
          />
        </Route>
      </Route>
    </Routes>
  );
}
function Protected() {
  const { session, loading, error, refresh } = useAuth();
  if (loading)
    return (
      <div className="full-loading">
        <Brand />
        <Loading label="Opening your workspace…" />
      </div>
    );
  if (error)
    return (
      <div className="full-loading">
        <Brand />
        <ErrorState error={error} retry={refresh} />
      </div>
    );
  return session ? <Outlet /> : <Navigate to="/login" replace />;
}
function Shell() {
  const { session, can } = useAuth();
  const [mobile, setMobile] = useState(false);
  const [search, setSearch] = useState("");
  const location = useLocation();
  const navigate = useNavigate();
  const settings = useRecord("settings");
  const notifications = useList("notifications", { pageSize: 25 });
  const logout = useAction("");
  const current = navigation.find((n) =>
    n.path === "/"
      ? location.pathname === "/"
      : location.pathname.startsWith(n.path),
  );
  const unread =
    notifications.data?.data.filter((r) => !r.read && !r.is_read && !r.read_at)
      .length || 0;
  useEffect(() => {
    setMobile(false);
    window.scrollTo({ top: 0 });
    document.title = `${current?.label || "Workspace"} · EasyManage`;
  }, [location.pathname, current?.label]);
  const logoutClick = () =>
    logout.mutate(
      { path: "/auth/logout" },
      { onSuccess: () => window.location.assign("/login") },
    );
  const sidebar = (
    <>
      <div className="sidebar-brand">
        <Brand />
      </div>
      <div className="workspace-label">
        <span>
          {initials(settings.data?.data?.company_name || "Workspace")}
        </span>
        <div>
          <strong>
            {settings.data?.data?.company_name || "Your workspace"}
          </strong>
          <small>Company workspace</small>
        </div>
        <ChevronDown size={15} />
      </div>
      <nav className="sidebar-nav" aria-label="Main navigation">
        {navigation
          .filter(
            (n) =>
              !n.permission ||
              (n.permission === "reports"
                ? can("reports.hr") || can("reports.finance")
                : can(n.permission)),
          )
          .map((n) => (
            <div key={n.path}>
              {n.group && <span className="nav-group">{n.group}</span>}
              <NavLink
                to={n.path}
                end={n.path === "/"}
                className={({ isActive }) =>
                  `nav-item ${isActive ? "active" : ""}`
                }
              >
                <n.icon size={18} strokeWidth={1.7} />
                <span>{n.label}</span>
                {n.path === "/notifications" && unread > 0 ? (
                  <span className="nav-count">{unread}</span>
                ) : (
                  <i className="nav-dot" />
                )}
              </NavLink>
            </div>
          ))}
      </nav>
      <div className="sidebar-bottom">
        <Link to="/setup" className="help-link">
          <BookOpen size={17} />
          <span>Setup & connections</span>
          <ChevronRight size={14} />
        </Link>
        <div className="sidebar-profile">
          <Avatar
            name={personName(session?.user)}
            image={session?.user.profile_image}
            size="sm"
          />
          <div>
            <strong>{personName(session?.user)}</strong>
            <small>{titleCase(session?.user.role)}</small>
          </div>
          <button
            aria-label="Sign out"
            title="Sign out"
            onClick={logoutClick}
            disabled={logout.isPending}
          >
            <LogOut size={17} />
          </button>
        </div>
      </div>
    </>
  );
  return (
    <div className="app-shell">
      <a className="skip-link" href="#main-content">
        Skip to content
      </a>
      <aside className="sidebar">{sidebar}</aside>
      <Dialog open={mobile} onOpenChange={setMobile}>
        <DialogContent className="mobile-sidebar">
          <DialogTitle className="sr-only">Workspace navigation</DialogTitle>
          <DialogDescription className="sr-only">
            Navigate EasyManage sections
          </DialogDescription>
          {sidebar}
        </DialogContent>
      </Dialog>
      <div className="main-shell">
        <header className="topbar">
          <div className="topbar-left">
            <Button
              variant="ghost"
              size="icon"
              className="mobile-menu-button"
              aria-label="Open navigation"
              onClick={() => setMobile(true)}
            >
              <Menu size={22} />
            </Button>
            <span className="breadcrumb-root">Workspace</span>
            <ChevronRight className="breadcrumb-chevron" size={14} />
            <strong>{current?.label || "Employee profile"}</strong>
          </div>
          <div className="topbar-right">
            {can("employees.read") && (
              <form
                className="topbar-search"
                onSubmit={(e) => {
                  e.preventDefault();
                  navigate(`/employees?search=${encodeURIComponent(search)}`);
                  setSearch("");
                }}
              >
                <Search size={16} />
                <input
                  aria-label="Search employees"
                  placeholder="Search employees…"
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                />
                <kbd>↵</kbd>
              </form>
            )}
            <Link
              to="/notifications"
              className="topbar-bell"
              aria-label={
                unread ? `${unread} unread notifications` : "Notifications"
              }
            >
              <Bell size={19} />
              {unread > 0 && <i />}
            </Link>
            <div className="topbar-divider" />
            <Link to="/settings" className="topbar-user">
              <Avatar
                name={personName(session?.user)}
                image={session?.user.profile_image}
                size="sm"
              />
              <div>
                <strong>{personName(session?.user)}</strong>
                <small>{titleCase(session?.user.role)}</small>
              </div>
              <ChevronDown size={14} />
            </Link>
          </div>
        </header>
        {session?.connection && !session.connection.connected && (
          <div className="connection-banner">
            <DatabaseIcon />
            <span>Your data connection needs attention.</span>
            <Link to="/setup">
              View connection guide <ChevronRight size={14} />
            </Link>
          </div>
        )}
        <main id="main-content" className="main-content">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
function DatabaseIcon() {
  return <TriangleAlert size={15} />;
}
