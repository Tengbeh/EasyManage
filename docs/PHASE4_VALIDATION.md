# Phase 4 verification record

Verified 17 November 2026 on Node 22.23.5 and PostgreSQL 17 using an isolated database. No production data was reset or replaced with test records.

- Initial Prisma migration deployed successfully to an empty isolated database; generated client and both TypeScript/production builds passed.
- Backend suite: **57 passed, 0 failed, 0 skipped**, including real PostgreSQL foreign keys, exact decimals, cross-company references, transaction rollback, independent-client locking, import fidelity and existing OAuth/payroll/export regressions.
- Frontend Vitest suite: **13 passed**, covering clock/break state, leave validation/uploads/retry keys, policies, corrections and configured-cycle boundaries.
- Browser checks exercised all nine workforce tabs against PostgreSQL, employee clock-in/break/clock-out, actual leave submission, HR approval, schedule editing and leave-policy editing. No unexpected API errors or browser exceptions were observed.
- Dashboard checked at desktop and 390px mobile width without horizontal overflow; the automated accessibility scan reported zero violations on that screen. This is not a claim of exhaustive accessibility certification.
- Read-only Google Sheets import rehearsal preserved existing user/audit records and verified all imported table values in staging. A repeated dry run reported no conflicts or additional inserts. The spreadsheet remained unchanged.
- Both production dependency audits reported **zero vulnerabilities**. The client development dependency graph has five high-severity paths to one currently unpatched picomatch advisory; exposure and containment are documented in [client security notes](../client/SECURITY_NOTES.md). These tools are excluded from the deployed backend runtime and static client output.
- Secret-pattern review found only documented placeholder examples. Private environment files, generated Prisma output, dependencies, build output, uploaded documents and session files are excluded from Git.

Targeted regression cases cover fixed scheduled breaks after an open clock record, correction date mismatches, stale approved attendance inputs before payroll finalization, paid versus unpaid leave deductions, salary history before its first change and future-dated termination access. Finalized payroll snapshots remain unchanged.

The browser fixture uses a test-only verified Google provider on localhost. Actual Google consent and account interaction are separate live acceptance checks; fixture success does not assert a new interactive Google sign-in occurred.

The live cutover applied the same migration to a separate production database, imported and verified all seven existing records, and retained the original spreadsheet and prior deployment. The runtime database role has data privileges without schema ownership. Public HTTPS checks returned a ready PostgreSQL health response, rejected unauthenticated employee access with 401, and redirected Google authentication to the registered callback with Secure/HttpOnly/SameSite cookies.
