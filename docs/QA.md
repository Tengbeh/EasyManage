# Verification record

Verified on 17 November 2026 using Node 22.23.5 and Chromium on a dedicated Linux host.

## Build and automated checks

- Client TypeScript and Vite production build: passed.
- Server TypeScript production build: passed.
- `npm test`: **34 passed, 0 failed**.
- `npm audit --omit=dev` in client and server: **0 reported vulnerabilities** at verification time. This is a point-in-time dependency check, not a security certification.

The suite covers verified OAuth identity/state/nonce handling with an injected provider, unauthorized users, role permissions, CSRF and origin enforcement, revoked sessions, employee validation, salary history, effective termination dates, bonus/penalty approval, attendance/leave rules, installment scheduling/payment reconciliation, payroll states, stale-source rejection, deduction review, and CSV/XLSX/PDF exports. Money tests exercise exact decimal sums, half-up rounding, proration, weekly/daily rates, configurable month-crossing cycles, leap days, zero/blank allowance overrides, and duplicate source exclusion.

Repository tests use the **production SheetsRepository** with a mocked Google transport. They verify initialization, column schemas, literal cell writes, stable IDs, cache behavior, uncertain-write handling, and a complete payroll lifecycle through Sheets cell serialization. They do not prove live Google API connectivity.

## Browser checks

All main navigation screens loaded without JavaScript page errors. The following workflows were exercised against the real Express app with an isolated localhost-only test repository and injected Google identity provider:

- Required-field validation; employee creation and editing; search, filters and empty state.
- Dated salary adjustment, bonus creation/approval, and penalty creation/approval.
- Loan creation/approval, six-installment schedule, and partial manual repayment.
- Attendance creation and leave approval.
- Payroll preview → draft → submission → approval → finalization → separate payment recording.
- PDF, Excel and CSV download from the reports screen.
- Future employment end date, department and authorized user creation, settings save, notification read state, and logout/session invalidation.
- Desktop (1440 px), tablet (768 px), and mobile (390 px); mobile navigation and employee form bounds.

One workflow employee had a monthly salary of 3000.00 on November 1 and 3200.00 from November 2, allowance 100.00, approved bonus 125.25, approved penalty 25.10, 10% configured tax, and 75.00 remaining on the month's loan installment after a 25.00 manual payment. The UI and backend snapshot agreed on basic salary **3193.33**, gross **3418.58**, tax **341.86**, and net **2976.62**. Marking payroll paid reduced that loan's outstanding balance from **575.00** to **500.00**, once.

Accessibility checks used axe-core WCAG 2 A/AA and WCAG 2.1 AA rules on dashboard, employees, employee form, payroll, reports, settings, and public login/setup. Contrast and chart-label findings were corrected; the final scan found **0 violations across all eight checked page/form states**. Automated scanning supplements, but does not replace, a full assistive-technology audit.

The public HTTPS deployment serves the actual production build. Private API access without a session returns 401. With Google configuration absent, the login shows setup instructions and Google sign-in remains unavailable.

## Live acceptance still required

No company Google OAuth credentials, service-account key, spreadsheet ID, or initial administrator email were provided. Consequently, the following remain **unverified and blocked by external configuration**:

1. Real Google sign-in and consent-screen/domain behavior.
2. Real private spreadsheet initialization and read/write permissions.
3. Live authorized/unauthorized Google account sign-in, with administrator, HR and Accountant accounts.
4. Production cookie/session persistence after authenticated restart.
5. A known-value payroll and export using a separate development Google Spreadsheet.

Follow [GOOGLE_SETUP.md](GOOGLE_SETUP.md). Do not interpret mocked integration tests, configuration flags, or fictional screenshots as evidence of a connected live company database.

## Reproduce the browser fixture

The fixture in `server/test/browser-fixture.ts` is excluded from the production TypeScript build, requires `NODE_ENV=test`, and binds only to `127.0.0.1:3101`. It deliberately contains fictional November 2026 records and a test identity provider. Never expose it through a public endpoint.

After installing dependencies and building both packages, run from `server/` in a separate terminal:

```bash
NODE_ENV=test node --import tsx test/browser-fixture.ts
```

On that same machine, use the fixture's `/api/auth/google` path to enter the isolated test session. Restart the fixture to reset records. Production `npm start` never imports this fixture and uses only Google Sheets.
