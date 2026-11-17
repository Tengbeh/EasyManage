# EasyManage backend

Express/TypeScript API for the EasyManage frontend. Business records live only in the configured Google spreadsheet. Without credentials, health reports `setup_required`, Google sign-in returns 503, and no business-data fallback is used. Local persistent files contain sessions only; kernel lock files contain no company records.

## Setup

Use Node 22+ and Linux `flock` (the `util-linux` package). Install dependencies with `npm ci`, copy `.env.example` to `.env`, and fill the requested environment values. Set a random session secret of at least 32 characters. Use HTTPS and `NODE_ENV=production` for production.

Create a Google Cloud OAuth web client and register the exact `GOOGLE_CALLBACK_URL`. Enable the Google Sheets API in that project. Create a service account, put its private key in a protected credentials file referenced by `GOOGLE_APPLICATION_CREDENTIALS` (preferred) or the two service-account environment variables, and share the intended spreadsheet with the service-account email as an editor. Google user sign-in and service-account spreadsheet access are separate credentials.

Stop the running server before running maintenance scripts, then:

```sh
npm run init-sheets
npm run bootstrap-admin -- admin@example.com 'Administrator Name'
npm run build
npm start
```

The bootstrap script only authorizes an email when Users is empty; it does not bypass Google sign-in. Alternatively, `BOOTSTRAP_ADMIN_EMAIL` creates the first administrator on that exact verified account's first successful sign-in while Users is empty. Additional users are explicitly authorized through administrator user management. Email changes on Google-linked users are blocked; create a new user and deactivate the old one.

`SERVER_HOST` defaults to loopback. Put the process behind the trusted reverse proxy and set `TRUST_PROXY` to its exact hop count; set `CLIENT_URL` to the public HTTPS origin. The server serves an existing client build from `../client/dist` or `CLIENT_DIST_PATH`. OAuth redirect, secure cookie, CSRF origin check and frontend requests must share the public origin. For local Vite development, proxy `/api` to the backend and set the client origin/callback to Vite's origin.

Requested environment names take precedence over legacy aliases: `CLIENT_URL`/`APP_ORIGIN`, `SERVER_PORT`/`PORT`, `GOOGLE_CALLBACK_URL`/`GOOGLE_REDIRECT_URI`, `GOOGLE_SHEETS_SPREADSHEET_ID`/`GOOGLE_SPREADSHEET_ID`, and `GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY`/`GOOGLE_PRIVATE_KEY`.

## API and security

Authenticated responses use `{data: ...}`; collections add `{meta:{total,page,pageSize}}`. Errors use `{error:{code,message,details?}}`. `GET /api/health` is public. Both `/api/me` and `/api/auth/me` return the authenticated user, effective permission keys, CSRF token, and connection state. OAuth uses verified Google ID tokens with audience/issuer validation, verified email, state, nonce, PKCE, single-use state and session regeneration. Browser callback failures redirect to `/login?error=CODE`.

Session cookies are HttpOnly, SameSite=Lax, secure in production, and expire after eight idle hours. Session JSON is written atomically to mode-0600 files in a mode-0700 directory and pruned hourly. No access/refresh tokens or business rows are stored in sessions. Active status and permissions are checked against Users on every API request (a 15-second read cache is invalidated after writes).

Every business mutation requires `x-csrf-token` and an `Idempotency-Key` of 16–128 letters, digits, underscores, or hyphens. Generate one key per logical submission, keep it through network retries, and use a new key only after changing the submitted operation. A reused key with different user/method/path/body returns 409. Logout requires CSRF but no idempotency ledger. Preview requires CSRF and makes no writes.

Role defaults live in `src/permissions.ts`; Users.permissions contains explicit additive grants. Payroll approval is separate from generation/finalization/payment. Accountant defaults include salary management and payroll generation but exclude payroll approval. Only an administrator can assign user roles/grants; self-access changes and removal of the final active administrator are blocked. Responses redact salary and banking fields without their read permissions. Banking edits, including clearing a field, require write permission. Finance reports, dashboards, notifications, and HR reports are permission scoped.

## Storage and recovery

`src/schema.ts` preserves every requested original worksheet column and appends the extras required for salary history, leave, notification read state, repayment records and idempotency. `init-sheets` creates missing worksheets/headers and expands columns without clearing records. Existing extra headers are retained. Invalid/duplicate headers, missing row IDs and duplicate IDs stop reads so an unsafe upsert cannot overwrite an ambiguous record.

A serialized mutation obtains fresh source data, validates the operation, and commits its business changes, audit entry and compressed idempotency response in one Google `spreadsheets.batchUpdate`. All values use literal `stringValue` cells, preventing spreadsheet formulas from executing. UUIDs identify records; row positions are resolved freshly immediately before a write. Caches contain only transient read results and expire after 15 seconds. CSV exports neutralize formula prefixes, and XLSX values are strings.

Run exactly one backend/maintenance writer on one host for each spreadsheet. An OS kernel `flock` rejects overlapping server and CLI processes on the same host. All writers must use the same `WRITER_LOCK_DIR`. The API has no cross-host compare-and-swap primitive: multiple hosts, multiple independent integrations, direct user edits, row sorting, formula changes, or sheet restructuring during writes are unsupported. Restrict spreadsheet editing to the service account and designated maintenance administrators. Stop the writer before manual repairs or schema changes; use filter views for inspection. Review OAuth/service-account access and protect the private spreadsheet accordingly.

The Google client never retries write requests. A network timeout or Google 5xx can mean the batch committed; the writer then returns `WRITE_OUTCOME_UNKNOWN` and refuses new writes. Retry the original HTTP request with the **same** key: a completed ledger entry returns the original result. If no ledger entry exists, do not generate a new key or blindly restart. An administrator must inspect Idempotency, Audit_Logs and the involved business IDs after the remote request has settled, establish whether the batch applied, repair only if necessary, and then restart the single writer. Reads remain available. A Google 4xx batch rejection applies none of the batch changes. This policy favors explicit reconciliation over duplicate payroll or repayments.

Large audit values store a content hash and summary instead of exceeding Sheets' cell limit; complete payroll snapshots remain on Payroll. Idempotency responses are gzip/base64 encoded in Sheets and limited to 45,000 characters per response cell. Exceeding that supported batch size returns a validation error before a write. The Sheets API quotas and maximum spreadsheet size bound this MVP; test company-scale workloads before expansion.

## Domain behavior

Resources: employees, departments, bonuses, penalties, loans, attendance, leave, users, settings, audit logs and notifications. General lists support search, pagination, sorting and applicable employee/department/status/date filters. Employee profiles include separate salary-history and sanitized employment-history endpoints. Terminated employees require an end date. A past employment end date derives terminated status on directory/dashboard reads; future end dates remain active until the date has passed. Salary changes retain a hire-date baseline and dated rates, and cannot alter finalized periods.

Bonuses, penalties, loans and leave start pending. Approved adjustments/loans/leave cannot be silently edited. Penalties require a documented reason. Attendance is unique per employee/date; check-out must follow check-in on the same date. Leave dates are inclusive; overlapping pending/approved leave is rejected. Loan approval generates an anchored weekly/monthly schedule with an exact final remainder. Manual payments reject overpayment and payroll-reserved installments.

Payroll transitions: `draft → pending_approval → approved → finalized → paid`, or approval rejection to `rejected`. `POST /api/payroll/:id/revise` explicitly recalculates an unfinalized run into a new draft revision and invalidates prior approval. Only one run per month exists. Draft/rejected allowance/tax/other-deduction adjustments preserve their reason. Source changes block submission/approval/finalization until revision. Warnings above the configured deduction threshold require `{reviewed:true}` from an approver. Finalization reserves loan installments and consumes approved bonus/penalty IDs; marking paid records actual loan repayments atomically. Generation never implies payment. Finalized and paid runs cannot be revised.

The pure payroll engine uses calendar-day proration across the configured payroll cycle, dated salary history, currency-safe decimals and explicit frequency conversions. A cycle ends in the selected month; when its start day exceeds its end day, it begins in the previous month (January 26–February 25 belongs to February). Days clamp to the actual month length, including leap years. Each snapshot retains period_start and period_end. Custom frequencies require `configured_deductions.frequency_days.custom`. Tax/deduction percentages are company configuration, not a jurisdictional tax engine. Finalized reports use immutable payroll snapshots and remain available after employee edits.

Reports export JSON, CSV, XLSX and PDF for every type in the root contract. JSON is paginated; exports contain the entire filtered result. Report names, content types and download filenames are consistent. Dashboard metrics and charts derive from permitted records; notifications cover pending approvals, new employees, employment endings, finalized payroll, payroll reminders and upcoming/overdue installments with per-user read state.

## Development data and verification

```sh
NODE_ENV=development SEED_DEMO_CONFIRM=WRITE_FICTIONAL_DATA_TO_DEVELOPMENT_SHEETS npm run seed-demo
npm test
npm run build
```

The seed script writes ten fictional employees, three departments, salary baselines, two bonuses, two penalties, two loans (one with six installments), and an unpaid draft payroll to a **real configured development spreadsheet**. It refuses production and existing business data. Tests alone inject in-memory repositories and a Google identity stub. `test/browser-fixture.ts` is a localhost-only coordinator QA harness requiring `NODE_ENV=test`; it is excluded from the production build and must never be routed through a public endpoint.

Automated checks cover OAuth, permissions, CSRF/origin, session revocation, idempotency/audit batches, salary history, attendance/leave rules, loan repayment/payroll workflows, stale source protection, deduction review, exports and missing configuration. Adapter/engine tests exercise literal atomic Sheets writes, row-ID resolution, caches, uncertain writes and decimal/proration edge cases. Real Google OAuth and Sheets connectivity require the owner's configured credentials for live acceptance testing.
