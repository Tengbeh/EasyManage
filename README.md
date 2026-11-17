# EasyManage

**Manage Your People. Simplify Your Payroll.**

EasyManage is a React/TypeScript employee and payroll application with an Express API, verified Google OAuth, server sessions, and **PostgreSQL through Prisma**. Frontend and backend remain separate in `client/` and `server/`. Database access and financial calculations run exclusively on the server.

The existing employee, salary history, bonus, penalty, loan, payroll, exports, administration and audit features are preserved. Phase 4 adds workforce schedules, server-authoritative attendance, breaks, corrections, approvals, configurable leave balances and private supporting documents. Attendance affects payroll only through explicitly approved policy-backed inputs. Finalized payroll retains its original snapshots.

## Run locally

Use Node 22.23 or newer within the Node 22 LTS series and PostgreSQL 17. Use a dedicated development database.

```sh
npm run install:all
cp server/.env.example server/.env
cp client/.env.example client/.env
```

Set the private backend environment values described below. To run local PostgreSQL with Docker, set `POSTGRES_PASSWORD` in your shell and start `docker compose -f compose.postgres.yml up -d`. Set `DATABASE_URL` to that database; never commit its password.

```sh
cd server
npm run prisma:generate
npm run db:migrate
npm run db:bootstrap -- --name 'Your company' --currency USD --admin-email admin@example.com --admin-name 'Administrator'
cd ..
npm run dev:server
# In a separate terminal:
npm run dev:client
```

Open `http://localhost:5173`. The Vite development proxy sends `/api` to port 3001. A Google account must match an active authorized application user. There is no open employee signup: administrators invite accounts and link employee users to their employee record.

## Backend configuration

| Variable                                   | Purpose                                                                                     |
| ------------------------------------------ | ------------------------------------------------------------------------------------------- |
| `DATABASE_URL`                             | Private PostgreSQL connection URL; required for application persistence                     |
| `DEFAULT_COMPANY_ID`                       | Bootstrap company UUID; existing deployments use the same ID for migration and runtime      |
| `GOOGLE_CLIENT_ID`, `GOOGLE_CLIENT_SECRET` | OAuth web application credentials, backend only                                             |
| `GOOGLE_CALLBACK_URL`                      | Exact registered callback, such as `http://localhost:3001/api/auth/google/callback` locally |
| `CLIENT_URL`                               | Frontend origin; HTTPS application origin in production                                     |
| `SESSION_SECRET`                           | Cryptographically random secret of at least 32 characters                                   |
| `SESSION_DIR`                              | Private persistent server session directory                                                 |
| `STORAGE_ROOT`                             | Private persistent attachment directory, outside all public/static directories              |
| `SERVER_HOST`, `SERVER_PORT`               | Listener; loopback by default                                                               |
| `TRUST_PROXY`                              | Trusted reverse-proxy hop count; set only for the deployed topology                         |
| `BOOTSTRAP_ADMIN_EMAIL`                    | Optional verified Google email allowed to bootstrap an entirely empty company user list     |
| `NODE_ENV`                                 | `development`, `test`, or `production`                                                      |

`client/.env.example` contains public development configuration only. Never put passwords, OAuth secrets, service account credentials, or session secrets in `VITE_` variables.

Create a Google Cloud OAuth web client, configure the consent screen, and register the exact callback URL. Add authorized test users while the consent app is in testing. In production the callback and `CLIENT_URL` must use HTTPS. Authorized accounts and employee mappings are managed inside EasyManage; an unlisted Google account is rejected even if Google authentication succeeds.

## Existing Google Sheets installations

Sheets is a **legacy import source**, not the runtime database. Do not point a new deployment at the old Sheets backend. Preserve the spreadsheet and use the insert-only importer after taking backups and testing against staging. It preserves original UUIDs, audit/salary history and exact finalized payroll snapshots, refuses divergent records and defaults to a read-only plan.

See [database setup and migration](docs/DATABASE.md). The old Google service account variables in `.env.example` are optional and only needed for that maintenance operation or a separately configured reporting integration. No live spreadsheet is made public.

## Workforce operations

1. HR configures default department/company schedules, individual shift assignments, holidays and leave types. No statutory entitlement or automatic salary deduction is assumed.
2. An administrator links each employee's authorized Google account to the employee record and assigns the employee role.
3. Employees clock in/out, track enabled breaks, submit leave and request corrections. They can only access their own workforce records.
4. HR reviews attendance and corrections. Finalized attendance can enter a payroll proposal; correction approval never rewrites an existing payroll snapshot.
5. Leave follows configured approval roles with distinct approvers. Own approval is denied unless the leave policy explicitly permits an administrator to approve their own leave.
6. Accounting proposes attendance payroll inputs. Approval requires the corresponding bonus or penalty approval permission. Only approved inputs are included in payroll preview and the saved calculation breakdown.

See [Phase 4 policies, API and calculations](docs/PHASE4.md).

## Verification and build

```sh
npm test
npm test --prefix client
# Isolated migrated PostgreSQL database only:
RUN_DATABASE_TESTS=1 NODE_ENV=test npm test --prefix server
npm run build
```

The database tests create distinct test companies and do not reset the database. Test-only Google providers and localhost browser fixtures are never used by the production entry point. Live OAuth acceptance additionally requires the configured account to complete Google's browser flow.

Production serves the client build from Express, or the client can be hosted behind the same HTTPS reverse proxy. Build both applications, apply reviewed migrations using `prisma migrate deploy`, bootstrap/import the company, then start `npm start --prefix server`. Configure a persistent service, private file/session volumes, HTTPS forwarding, database backups and restore rehearsals. `/api/health` reports database and OAuth configuration/connectivity without credentials. Production cookies are HttpOnly, Secure and SameSite=Lax; mutation endpoints enforce CSRF, origin, role/object permissions and idempotency.

Use one trusted proxy for the default `TRUST_PROXY=1` topology. It must overwrite forwarded protocol headers with the verified external HTTPS scheme; arbitrary client headers must not determine secure-cookie handling. The local compose file exposes PostgreSQL only on loopback. Keep database credentials, backups, private uploads and deployment environment files out of version control.

## Delivery stages

Phase 4 is developed, tested and delivered independently before Phase 5 starts. Phase 5 covers the complete employee portal, payslips, general documents, lifecycle and HR automation. Phase 6 covers advanced analytics, multi-company onboarding, subscriptions, optional integrations and operational hardening. Completion is recorded only after the corresponding tested commit is pushed; planned capabilities are not represented as operational integrations.
