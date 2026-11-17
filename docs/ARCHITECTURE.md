# Architecture and operational boundaries

## Components

The Vite client renders React routes, checks returned permissions for navigation, validates forms with Zod, and uses TanStack Query for API state. The Express server verifies Google identity, checks active authorized users, enforces permissions, validates all writes, computes payroll, and owns the Sheets connection. Only the backend knows the service-account credentials. The production server serves the built client from the same origin.

Google Sheets is the sole business-data store. Server-side session files contain session state, not employee/payroll records. An in-memory repository is used only in automated tests. The repository interface (`list`, `commit`, `initialize`) isolates storage from domain services so a transactional database can be introduced later.

## Request and write flow

Authenticated requests revalidate the authorized account and role. Mutations require a CSRF token and an idempotency key. A serialized writer validates the latest source data and commits domain records, audit entries and idempotency records in one Sheets `spreadsheets.batchUpdate` operation. ID-based upserts use row positions only after resolving durable UUID identifiers. Literal string writes prevent formula interpretation in the spreadsheet.

The application deliberately runs **one writer process per spreadsheet**. The process lock protects against accidental concurrent starts on the same host. It does not coordinate independent hosts. Do not horizontally scale this MVP, point several environments at the same sheet, or manually edit sheets while the application is running. Migrate storage to a database or add a distributed lock before multiple writers are needed.

Reads use a short-lived cache and request-scoped reuse. Pagination/filtering happen in the API after a cached worksheet read; Sheets does not provide indexed database queries. This is appropriate for a small company's MVP, not a claim of large-scale database performance. Sensitive writes invalidate caches and reread the relevant records.

Read failures may be retried with bounded timeouts/backoff. A financial write with an uncertain network outcome is not blindly retried as a fresh operation. The client should retry its original idempotency key. If reconciliation is necessary, inspect the ledger and records before restarting the writer. Keep the same private sheet backed up and restrict direct editing.

## Financial model

Amounts use decimal strings and decimal.js, with two decimal places and half-up rounding. This release supports currencies with two decimal minor units; it does not implement per-currency precision rules. Payroll is calculated for a configured cycle ending in the selected payroll month. Default days 1–31 use the calendar month. For a 26–25 cycle, January payroll spans December 26 through January 25. Days are clipped to the actual month length, including leap years. Monthly salary and allowances are prorated by eligible calendar days divided by all days in that cycle. Weekly salary is divided by seven; daily salary is applied to each eligible calendar day. An organization's working-day policy may differ; configure or extend the policy before live payroll. Other frequencies require configured calendar days per cycle.

Salary history records an effective date, previous values, new values, the responsible user, and a reason. Mid-month changes are prorated by effective date. Historical finalized payroll is a snapshot and never recomputed from current salaries. Bonus and penalty source IDs and installment allocation IDs are saved with the snapshot.

Taxes and other deductions are company-configured values, not legal or jurisdiction-specific calculations. Attendance does not generate deductions. Penalties require an explicit reason and approval. Configured deduction thresholds require review. Negative net salary is blocked. Company policy must be reviewed before processing real pay.

Draft, submission, approval, finalization, and payment are separate events. Finalization reserves loan installments; actual payment/reconciliation settles them. Duplicate period generation and duplicate installment allocation are blocked. Corrections are entered as an approved bonus or penalty in a later open period, with the original payroll reference and correction reason in the description, or as a reasoned draft adjustment before that period is submitted. Finalized records cannot be edited or reopened; this release does not implement off-cycle replacement runs.

## Authorization

Administrator, HR and Accountant roles have centrally defined defaults. Additional permissions can be granted by an administrator for sensitive operations such as payroll approval. The backend guards every protected endpoint and filters sensitive fields. Users cannot promote themselves. Revoked users lose access on session validation. The authorized user list is bootstrapped by an operator; there is no public registration endpoint.

## Scope boundaries

This is an HR/payroll administration MVP, not a payment processor. Marking payroll paid is a recorded business action; no bank transfer occurs. Attendance is manual. There is no biometric or GPS capture. Reports export stored records and finalized payroll snapshots. Google account identity and spreadsheet access are separate integrations.

## Primary design and implementation references

The interface follows the user's requested structure and palette, informed by [Speedwapp](https://speedwapp.com/), [Linear](https://linear.app/), [Stripe](https://stripe.com/) and [BambooHR](https://www.bamboohr.com/), without copying their branding or assets. Framework references include [Vite](https://vite.dev/guide/), [shadcn/ui](https://ui.shadcn.com/docs/installation/vite), and [Express security guidance](https://expressjs.com/en/advanced/best-practice-security/).
