# EasyManage

A full-stack employee and payroll management MVP with React/Vite/TypeScript and Express/TypeScript. Google OAuth authenticates authorized users; a private Google Spreadsheet stores business records. The frontend never receives Google secrets and never uses localStorage or static JSON as a business database.

**Connection status:** Google OAuth credentials and a private spreadsheet must be configured by the deploying company. An unconfigured deployment serves the login/setup screens and denies business access. The automated test suite uses isolated test doubles; passing those tests does not establish a live Google connection.

Workspace deployment: [Open EasyManage](https://easymanage-2y6bf83.solid.site). Google setup is pending.

## What is included

- Permission-aware responsive navigation and dashboard with backend-derived metrics and charts.
- Employee directory, profiles, departments, employment status, dated salary adjustments and history.
- Bonus and penalty approval workflows, loans, schedules and payment reconciliation.
- Backend decimal-safe monthly payroll preview, draft, submission, approval, finalization and separate payment recording; saved snapshots and duplicate-period protection.
- Manual attendance and leave approvals, reports with CSV/Excel/PDF exports, notifications and audit logs.
- Administrator user management, role defaults and explicit permission grants, and company settings.
- Google Sheets repository, automatic schema initialization, secure administrator bootstrap and optional development demo seed.
- CSRF protection, secure server-side sessions, verified Google identity, centralized permissions, request validation, rate limiting, serialized writes and idempotency records.

The application records payroll; it does not transfer funds to employees. Company tax/deduction settings must be configured. Read [architecture and financial policy](docs/ARCHITECTURE.md) before using real payroll.

## Project layout

```
easy-manage/
  client/                 React application, reusable UI and feature pages
  server/                 Express APIs, repositories, validators and payroll engine
    src/services/         Pure decimal-safe payroll calculator
    test/                 Backend integration and security tests
    tests/                Payroll engine tests
  docs/                   Google connection, architecture, deployment and QA notes
  deploy/                 systemd service example
  CONTRACT.md             API conventions and data schema
```

## Local development

Requirements: Node.js 22.12+ and npm, a Google Cloud project, an OAuth web client and a private Google Spreadsheet shared with a backend service account.

```bash
npm run install:all
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Fill `server/.env` using [the Google setup guide](docs/GOOGLE_SETUP.md). Keep development and production spreadsheets separate. Frontend environment values are public configuration only. Do not put secrets in `VITE_` variables.

In one terminal:

```bash
npm run dev:server
```

In another:

```bash
npm run dev:client
```

Use the frontend development URL printed by Vite. Configure `CLIENT_URL` to that exact origin and the OAuth callback to the backend callback URL. The development proxy sends `/api` traffic to the backend. Production serves the built client and APIs from one HTTPS origin.

## Google connection and initial administrator

Follow [GOOGLE_SETUP.md](docs/GOOGLE_SETUP.md) for Cloud project creation, API enablement, consent screen, OAuth web credentials, service identity and private spreadsheet sharing. Backend variables include:

| Variable | Purpose |
| --- | --- |
| `GOOGLE_CLIENT_ID` | OAuth web application client ID |
| `GOOGLE_CLIENT_SECRET` | Server-only OAuth secret |
| `GOOGLE_CALLBACK_URL` | Exact registered callback URL |
| `GOOGLE_SHEETS_SPREADSHEET_ID` | Private company spreadsheet |
| `GOOGLE_SERVICE_ACCOUNT_EMAIL` | Service identity with spreadsheet Editor access |
| `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY` | Server-only PEM private key; escaped newlines accepted |
| `GOOGLE_APPLICATION_CREDENTIALS` | Optional private key-file alternative |
| `SESSION_SECRET` | Stable random secret, at least 32 characters |
| `CLIENT_URL` | Exact application origin |
| `SERVER_PORT` | Backend listener, normally 3001 |
| `NODE_ENV` | `development` or `production` |
| `SESSION_DIR` | Persistent private server session directory |
| `WRITER_LOCK_DIR` | Shared host-wide writer lock directory |
| `TRUST_PROXY` | Known reverse proxy hop count; do not trust arbitrary clients |
| `BOOTSTRAP_ADMIN_EMAIL` | Explicit initial administrator Google email |

See `server/.env.example` for defaults and supported aliases. The administrator bootstrap must target a company-controlled email; an arbitrary visitor cannot self-register.

Initialize the spreadsheet while the application writer is stopped:

```bash
cd server
npm run init-sheets
npm run bootstrap-admin -- admin@your-company.com "First Administrator"
```

Pass the administrator email as shown above, or set `BOOTSTRAP_ADMIN_EMAIL` in the server environment and omit the email argument. Sign in with that Google account, then add authorized users in User Management. Unauthorized Google accounts are rejected. The server creates all required worksheets and appends supported schema additions without duplicating initialized records.

## Development demo data

The optional seed is intended only for a separate development spreadsheet. It creates fictional departments, employees and accounting examples with demo labels. It is not used by the production application as a fallback. Consult the seed command's guard message and set the documented explicit demo acknowledgement before running:

```bash
cd server
NODE_ENV=development SEED_DEMO_CONFIRM=WRITE_FICTIONAL_DATA_TO_DEVELOPMENT_SHEETS npm run seed-demo
```

Never use this command with a production spreadsheet. To start a real company, initialize a new empty production spreadsheet and bootstrap the administrator without demo data.

## Payroll workflow

1. Configure currency, allowances, tax/deduction policy and review threshold.
2. Create employees with their employment dates and initial salary. Make subsequent salary changes through the dated adjustment action.
3. Record and approve the month's bonuses, penalties and loans.
4. Choose the payroll month and generate a preview. Review the calculation and any deduction warnings.
5. Generate a draft, make any authorized draft adjustments, and submit it for approval.
6. An authorized approver reviews and approves it. Finalize to lock its saved snapshots and reserve loan allocations.
7. Record payment separately after actual payment. Generation/finalization never implies money has been paid.

Monthly salary is prorated by eligible calendar days in the configured payroll cycle. Weekly/daily/custom conversion and rounding rules are documented in [ARCHITECTURE.md](docs/ARCHITECTURE.md). Approved source IDs are tracked to avoid repeat inclusion. Finalized snapshots remain unchanged when employee records are later updated.

## Validation

```bash
npm test
npm run build
```

Tests cover the financial engine and protected backend workflows. See [QA.md](docs/QA.md) for the verified results, test limitations, and live Google acceptance checks still needed for a newly configured deployment. Browser checks use a localhost-only test fixture and are separate from production authentication.

## Production

Build using `npm run build`; start with `npm start`. Deploy one writer process per spreadsheet and preserve its private session directory and secret. Follow [DEPLOYMENT.md](docs/DEPLOYMENT.md) for HTTPS, systemd, backups, upgrades, and verification.

Do not point multiple app instances at one spreadsheet or manually reorder/edit its data while the writer is active. The MVP uses cached worksheet reads with backend pagination, not indexed queries. For larger installations, replace the repository with a transactional database and add distributed coordination.

## Troubleshooting

The login screen indicates missing Google configuration; `/api/health` exposes configuration presence only. Initialization and an authorized sign-in verify real connectivity. Connection errors, schema mismatch, expired sessions and rejected actions have explicit messages. [Google setup](docs/GOOGLE_SETUP.md#troubleshooting) lists common causes and remedies. Keep raw credentials and confidential payroll records out of logs, source archives and issue reports.
