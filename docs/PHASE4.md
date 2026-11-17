# Phase 4: attendance, leave and workforce

## Integration boundary

The inspected Phase 1–3 repository used Google Sheets, not PostgreSQL. Phase 4 therefore introduces a non-destructive PostgreSQL/Prisma foundation before extending workforce functionality. It retains the existing frontend, APIs, Decimal payroll engine, verified OAuth and historical snapshots. A repository interface separates business logic from persistence. All writes, authorization-sensitive validation, idempotency records and audit entries are committed in a company-scoped transaction; success is sent only after commit.

Existing `/api/attendance` and `/api/leave` reads remain available for history. Their old direct write paths reject changes with `WORKFORCE_WORKFLOW_REQUIRED`; clients use the workforce endpoints so the earlier manual APIs cannot bypass approvals.

## Attendance policies

A schedule specifies its IANA timezone, workdays, local start/end, grace minutes, break policy, half-day threshold and explicit overtime/unpaid-absence/attendance-bonus permissions. Defaults disable payroll effects. An active default is selected by department, then company; a dated individual shift assignment takes priority. Non-default schedules support additional shifts. Holidays can apply to the whole company or one department.

Self clock operations accept no client timestamp. The server chooses the local attendance date and stores UTC timestamps. Overnight shifts can start on the previous local date. Duration uses actual elapsed time across daylight saving changes. Work minutes equal elapsed minutes minus tracked or configured breaks; manual corrections explicitly specify break duration. Late minutes exclude the configured grace period. Early minutes measure the difference between actual and scheduled departure. Overtime equals positive net minutes beyond the configured threshold, only where enabled. Working records below the half-day threshold are classified half-day.

Duplicate/open shifts, invalid break transitions, future manual times and backwards or excessively long intervals are rejected. Manual changes require a reason. Corrections have a separate request and decision history. Pending corrections block attendance finalization; approval records the revised values and requires subsequent finalization for new payroll inputs. Existing payroll snapshots remain unchanged.

Dashboard missing-day absence values are derived from eligible employees, elapsed schedules, holidays and approved leave. HR can reconcile a date to persist missing records. Reconciliation alone does not create payroll deductions. Attendance percentage is present/late/half-day records divided by those records plus absences; leave, holidays and rest days are excluded.

## Leave policy and balances

Leave types configure paid/unpaid classification, annual entitlement, upfront or monthly accrual, carry cap and optional expiry month, supporting documents and ordered approval roles. Entitlements default to zero and must be configured for company policy and jurisdiction. Explicit employee/year entitlements override the type's annual allowance.

Monthly accrual earns one twelfth per eligible calendar month including the hire month; upfront awards the configured annual entitlement. Carry-forward is capped unused prior-year accrued entitlement. When carry expires, only carry already consumed by approved leave before expiry remains counted. Approved usage and pending reservations reduce available balance. Requested days count scheduled working dates, excluding applicable holidays; the submitted working dates and policy are snapshotted. Requests spanning years reserve each year's balance. No negative balance is silently authorized.

Drafts can be edited, then submitted. Pending requests reserve balance, prevent overlap and progress through configured approval roles. Administrators may fulfill an assigned role, but separate approval levels require different people. A requester or linked employee cannot approve their own request unless the policy explicitly permits administrator self-approval. Cancellation releases reservations and updates generated attendance; finalized attendance must first go through correction review. Approving leave will not overwrite clocked, finalized or pending-correction attendance.

Supporting uploads are private PDF/PNG/JPEG, at most 5 MB, with MIME/magic validation. PDFs with recognized script/embedded-file/launch actions are rejected. Downloads require an authenticated authorized user and are sent as attachments with nosniff and a restrictive content policy. Storage keys are random and never exposed as public URLs. Runtime file storage is a private persistent single-host volume and must be included in backups; Phase 5 extends this foundation to general versioned documents.

## Payroll inputs

Sources must be finalized attendance belonging to the selected employee and configured payroll cycle. Overtime/unpaid-absence proposals derive salary rates and minutes on the server. Monthly hourly rate uses applicable basic salary divided by scheduled cycle hours; weekly uses scheduled week hours; daily uses the scheduled day. The dated salary history determines the salary effective on each attendance date. Overtime applies the snapshotted multiplier; unpaid absence uses finalized absent/half-day missing scheduled minutes or approved unpaid leave with its snapshotted paid=false policy. Paid leave cannot become an absence deduction. Attendance bonuses require an explicitly enabled source policy and an authorized amount.

Amounts use Decimal arithmetic and round half-up to two currency decimals. Pending/approved inputs prevent repeated use of a source for the same type, including across payroll months. At approval, a source fingerprint rejects changes made since preview. Payroll generation, approval and finalization revalidate approved input fingerprints against attendance, policy and dated salary sources; a changed source blocks unsettled payroll. Approval creates one linked approved bonus or penalty and an audit/decision record atomically. Finalized payroll stores the input calculation and policy breakdown alongside all existing financial snapshots. An authorized reviewer can revoke an approved input before payroll finalization. Revocation rejects its linked bonus/penalty and any open payroll run, clearing approvals so the run must be revised and approved again. Finalized/paid payroll periods reject revocation and preserve their snapshots. Payment status still changes separately from payroll generation/finalization.

## API

All paths below start with `/api/workforce`. Mutations require a valid session, CSRF header and stable `Idempotency-Key`. Lists support pagination and relevant date/employee/department/status filters. Staff permissions and own-employee checks are enforced on the backend.

| Resource                                                | Methods and behavior                                                              |
| ------------------------------------------------------- | --------------------------------------------------------------------------------- |
| `/me`, `/dashboard`                                     | GET own employee/schedule/balances or scoped workforce metrics                    |
| `/clock-in`, `/clock-out`, `/break-start`, `/break-end` | POST server-authoritative transitions                                             |
| `/schedules`, `/assignments`, `/holidays`               | GET, POST, PUT `/:id`; HR policy configuration                                    |
| `/attendance`                                           | GET, POST manual record; GET `/:id` with corrections and decisions                |
| `/attendance/reconcile`                                 | POST `{date}` for missing daily records                                           |
| `/attendance/:id/approve`, `/finalize`                  | POST review workflow                                                              |
| `/corrections`                                          | GET, POST; POST `/:id/approve` or `/reject`                                       |
| `/leave-types`, `/entitlements`                         | GET, POST, PUT `/:id`                                                             |
| `/leave-balances`, `/leave-calendar`                    | GET annual balance or overlapping calendar requests                               |
| `/leave`                                                | GET, POST; PUT `/:id` draft; POST `/:id/submit`, `/approve`, `/reject`, `/cancel` |
| `/leave-attachments`                                    | POST multipart file; GET `/:id/download` with ownership checks                    |
| `/payroll-inputs`                                       | GET, POST proposal; POST `/:id/approve`, `/reject` or `/revoke`                   |
| `/reports/:kind`                                        | GET JSON/CSV/XLSX/PDF attendance, absence, lateness, overtime, leave-utilization  |

Attendance exports use selected dates and approved leave utilization counts snapshotted working dates in the selected date range. Salary/bank information is not included in workforce exports. Existing HR/accounting reports remain permission-protected.

## Verification

Automated checks cover the existing finance/OAuth/CSRF flows, typed PostgreSQL constraints, cross-company/employee references, multi-client locking, rollback, migration fidelity, DST/overnight durations, own-only access, clock/break transitions, staged leave approval, reservations, private files, attendance payroll calculations and snapshot preservation. Frontend tests cover form validation and control states; browser acceptance exercises the production client against isolated PostgreSQL with a test-only OAuth provider. Live Google OAuth needs real account interaction and is not replaced by that fixture.

No Phase 4 completion tag should be created until the final suite, builds, browser checks and pushed commit are verified.
