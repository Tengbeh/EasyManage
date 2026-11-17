import { Link, Navigate, useSearchParams } from "react-router-dom";
import {
  ArrowLeft,
  ArrowRight,
  BookOpen,
  Check,
  CheckCircle2,
  ChevronRight,
  ClipboardCheck,
  Cloud,
  CircleHelp,
  Database,
  ExternalLink,
  FileSpreadsheet,
  KeyRound,
  Layers3,
  Link2,
  LoaderCircle,
  LockKeyhole,
  Mail,
  RefreshCw,
  Settings2,
  ShieldCheck,
  Users,
  Wallet,
} from "lucide-react";
import { useAuth } from "@/lib/auth";
import { useRecord } from "@/lib/api";
import { Brand, ErrorState, Status } from "@/components/shared";
import { Button } from "@/components/ui/button";

export function Login() {
  const { session } = useAuth();
  const health = useRecord("health");
  const [params] = useSearchParams();
  if (session) return <Navigate to="/" replace />;
  const configured =
    health.data?.data?.googleConfigured && health.data?.data?.sheetsConfigured;
  const error = params.get("error");
  return (
    <div className="login-page">
      <div className="login-story">
        <Brand />
        <div className="login-story-content">
          <div className="login-eyebrow">
            <span />
            PEOPLE OPERATIONS, SIMPLIFIED
          </div>
          <h1>
            Your people.
            <br />
            Your payroll.
            <br />
            <span>One workspace.</span>
          </h1>
          <p>
            Keep employee information, compensation, and everyday operations
            connected.
          </p>
          <div
            className="login-illustration"
            aria-label="Employee information connects to payroll and reporting"
          >
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="illustration-center">
              <img src="/favicon.svg" alt="EasyManage" />
              <span>EasyManage</span>
            </div>
            <div className="illustration-card people">
              <span>
                <Users size={21} />
              </span>
              <div>
                <strong>Your people</strong>
                <small>Employee directory</small>
              </div>
              <span className="mini-check">
                <Check size={12} />
              </span>
            </div>
            <div className="illustration-card payroll">
              <span>
                <Wallet size={21} />
              </span>
              <div>
                <strong>Your payroll</strong>
                <small>Review to payment</small>
              </div>
            </div>
            <div className="illustration-card reports">
              <span>
                <FileSpreadsheet size={21} />
              </span>
              <div>
                <strong>Your insights</strong>
                <small>Reports & activity</small>
              </div>
            </div>
            <div className="illustration-dot dot-one" />
            <div className="illustration-dot dot-two" />
          </div>
        </div>
        <div className="login-story-footer">
          <ShieldCheck size={16} />
          <span>Role-based access. Clear approvals. Complete history.</span>
        </div>
      </div>
      <main className="login-main">
        <div className="login-top">
          <span>Employee management system</span>
          <Link to="/setup">
            <CircleHelp size={15} />
            Setup guide
          </Link>
        </div>
        <div className="login-form">
          <div className="login-mark">
            <Layers3 size={26} />
          </div>
          <div className="eyebrow">WELCOME TO EASYMANAGE</div>
          <h2>
            A better place to
            <br />
            manage your team.
          </h2>
          <p>Sign in with your work Google account to access your workspace.</p>
          {error && (
            <div className="form-error" role="alert">
              {oauthError(error)}
            </div>
          )}
          <Button
            className="google-button"
            variant="outline"
            disabled={!configured || health.isPending}
            onClick={() => {
              window.location.href = "/api/auth/google";
            }}
          >
            {health.isPending ? (
              <LoaderCircle size={20} className="animate-spin" />
            ) : (
              <GoogleIcon />
            )}
            Continue with Google
            <ArrowRight size={18} />
          </Button>
          <div className="signin-note">
            <LockKeyhole size={13} />
            <span>Only authorized workspace members can sign in.</span>
          </div>
          {health.isError ? (
            <div className="login-setup">
              <div className="flex gap-3">
                <Cloud size={20} />
                <div>
                  <strong>Unable to check your connection</strong>
                  <p>{health.error.message}</p>
                </div>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => health.refetch()}
              >
                <RefreshCw size={14} />
                Try again
              </Button>
            </div>
          ) : !health.isPending && !configured ? (
            <div className="login-setup">
              <div className="flex gap-3">
                <Settings2 size={20} />
                <div>
                  <strong>Your workspace needs a connection</strong>
                  <p>
                    Connect Google sign-in and Google Sheets to activate your
                    workspace.
                  </p>
                </div>
              </div>
              <Link to="/setup">
                Complete workspace setup <ArrowRight size={15} />
              </Link>
            </div>
          ) : (
            <div className="login-secure">
              <ShieldCheck size={20} />
              <div>
                <strong>Secure access to your workspace</strong>
                <p>
                  Your access is determined by your assigned role and
                  permissions.
                </p>
              </div>
            </div>
          )}
          <div className="login-features">
            <span>
              <Users size={15} />
              People
            </span>
            <span>
              <Wallet size={15} />
              Payroll
            </span>
            <span>
              <ClipboardCheck size={15} />
              Approvals
            </span>
          </div>
        </div>
        <footer className="login-footer">
          <span>© {new Date().getFullYear()} EasyManage</span>
          <span>People & payroll, connected.</span>
        </footer>
      </main>
    </div>
  );
}
function oauthError(code: string) {
  const messages: Record<string, string> = {
    USER_NOT_AUTHORIZED:
      "Your Google account has not been granted workspace access. Ask your administrator to add it in Users & access.",
    access_denied:
      "Google sign-in was cancelled or access was denied. You can try again.",
    INVALID_OAUTH_STATE:
      "Your sign-in session expired or could not be verified. Start a new sign-in below.",
    INVALID_GOOGLE_NONCE:
      "Your Google sign-in could not be verified. Start a new sign-in below.",
    GOOGLE_TOKEN_VERIFICATION_FAILED:
      "Google could not verify this sign-in. Please try again.",
    SHEETS_CONNECTION_FAILED:
      "The company spreadsheet could not be reached. Ask your administrator to check the Google Sheets connection.",
  };
  return (
    messages[code] ||
    "Sign-in could not be completed. Please try again or contact your administrator."
  );
}
function GoogleIcon() {
  return (
    <svg width="20" height="20" viewBox="0 0 24 24" aria-hidden="true">
      <path
        fill="#4285F4"
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92a5.06 5.06 0 0 1-2.2 3.32v2.77h3.57c2.08-1.92 3.27-4.75 3.27-8.1Z"
      />
      <path
        fill="#34A853"
        d="M12 23c2.97 0 5.46-.98 7.28-2.65l-3.57-2.77c-.98.66-2.24 1.06-3.71 1.06-2.87 0-5.3-1.94-6.17-4.54H2.15v2.84A11 11 0 0 0 12 23Z"
      />
      <path
        fill="#FBBC05"
        d="M5.83 14.1a6.6 6.6 0 0 1 0-4.2V7.06H2.15a11 11 0 0 0 0 9.88l3.68-2.84Z"
      />
      <path
        fill="#EA4335"
        d="M12 5.36c1.62 0 3.06.56 4.21 1.64l3.15-3.15A10.56 10.56 0 0 0 12 1a11 11 0 0 0-9.85 6.06L5.83 9.9A6.59 6.59 0 0 1 12 5.36Z"
      />
    </svg>
  );
}
export function Setup() {
  const health = useRecord("health");
  const { session } = useAuth();
  const origin = window.location.origin;
  return (
    <div className="setup-page">
      <header className="setup-header">
        <Brand />
        <Button asChild variant="outline">
          <Link to={session ? "/" : "/login"}>
            <ArrowLeft size={15} />
            {session ? "Back to workspace" : "Back to sign in"}
          </Link>
        </Button>
      </header>
      <main className="setup-main">
        <div className="setup-intro">
          <span className="setup-icon">
            <Link2 size={26} />
          </span>
          <div className="eyebrow">WORKSPACE SETUP</div>
          <h1>Connect your workspace.</h1>
          <p>
            EasyManage uses Google sign-in for access and Google Sheets for your
            company’s records. An administrator needs to complete these
            connections.
          </p>
        </div>
        <div className="setup-status card">
          <div>
            <span className="metric-icon blue">
              <KeyRound size={20} />
            </span>
            <div>
              <strong>Google sign-in</strong>
              <small>Authorized workspace access</small>
            </div>
            <Status
              value={
                health.isPending
                  ? "checking"
                  : health.isError
                    ? "unknown"
                    : health.data?.data?.googleConfigured
                      ? "configured"
                      : "unconfigured"
              }
            />
          </div>
          <div>
            <span className="metric-icon teal">
              <Database size={20} />
            </span>
            <div>
              <strong>Google Sheets</strong>
              <small>Persistent company records</small>
            </div>
            <Status
              value={
                health.isPending
                  ? "checking"
                  : health.isError
                    ? "unknown"
                    : health.data?.data?.sheetsConfigured
                      ? "configured"
                      : "unconfigured"
              }
            />
          </div>
        </div>
        {health.isError && (
          <ErrorState error={health.error} retry={() => health.refetch()} />
        )}
        <div className="setup-steps">
          <SetupStep
            number="01"
            title="Create your Google Cloud connection"
            icon={Cloud}
          >
            <p>
              In a Google Cloud project, enable the Google Sheets API. Configure
              the OAuth consent screen for your organization and create an OAuth
              web application client.
            </p>
            <a
              className="text-link"
              href="https://console.cloud.google.com/apis/dashboard"
              target="_blank"
              rel="noreferrer"
            >
              Open Google Cloud Console <ExternalLink size={14} />
            </a>
          </SetupStep>
          <SetupStep
            number="02"
            title="Configure Google sign-in"
            icon={KeyRound}
          >
            <p>Add this exact redirect URI to the OAuth web client:</p>
            <code className="setup-code">
              {origin}/api/auth/google/callback
            </code>
            <p>
              Add the client credentials to the server environment and authorize
              your initial administrator email. Credentials belong in the
              private server configuration.
            </p>
          </SetupStep>
          <SetupStep
            number="03"
            title="Connect your company spreadsheet"
            icon={FileSpreadsheet}
          >
            <p>
              Create a Google service account and a private JSON key. Create a
              Google spreadsheet, then share it with the service account email
              as an Editor.
            </p>
            <p>
              Configure the spreadsheet ID and service account credentials on
              the server. EasyManage initializes the required worksheets and
              stores all business records there.
            </p>
          </SetupStep>
          <SetupStep
            number="04"
            title="Verify and invite your team"
            icon={Users}
          >
            <p>
              Restart the configured application, check the connection status
              below, and sign in with your administrator Google account. Add
              authorized users in Users & access and review your company’s
              payroll settings.
            </p>
            <p>
              The deployment’s <code>docs/GOOGLE_SETUP.md</code> and{" "}
              <code>.env.example</code> contain the exact environment variables
              and deployment instructions.
            </p>
          </SetupStep>
        </div>
        <div className="setup-bottom card">
          <div>
            <CheckCircle2 size={23} />
            <div>
              <strong>Ready to check your connection?</strong>
              <p>Status reflects the server’s configured integrations.</p>
            </div>
          </div>
          <Button onClick={() => health.refetch()} disabled={health.isFetching}>
            <RefreshCw
              size={16}
              className={health.isFetching ? "animate-spin" : ""}
            />
            Check status
          </Button>
        </div>
      </main>
      <footer className="setup-footer">
        EasyManage · Workspace connection guide
      </footer>
    </div>
  );
}
function SetupStep({
  number,
  title,
  icon: Icon,
  children,
}: {
  number: string;
  title: string;
  icon: typeof Cloud;
  children: React.ReactNode;
}) {
  return (
    <section className="setup-step">
      <span className="step-number">{number}</span>
      <div>
        <h2>
          <Icon size={19} />
          {title}
        </h2>
        {children}
      </div>
    </section>
  );
}
