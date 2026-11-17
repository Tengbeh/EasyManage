# PostgreSQL foundation and Sheets migration

Phase 4 adds PostgreSQL persistence while preserving snake_case repository records, original UUIDs, salary/audit history, and finalized payroll snapshots. The legacy Sheets installation stays available until a separately verified cutover. These scripts never switch production, delete source worksheets, overwrite divergent target records, drop existing tables, or seed sample business data.

## Supported stack and schema

Use Node 22.12+ and PostgreSQL 17. Prisma CLI, client and driver adapter are pinned together to **7.10.1**; the current Prisma 8 release candidate is intentionally excluded. Do not upgrade one package independently. The ESM `prisma-client` generator writes ignored TypeScript to `server/src/generated/prisma`; the build generates it before compiling. The config is `server/prisma/prisma.config.ts`; all npm commands select it explicitly.

Company and 26 normalized models cover the existing employee/finance/payroll/authorization/history/audit records and Phase 4 schedules, assignments, holidays, attendance corrections, leave types, entitlements, approval decisions, attendance payroll inputs, and private attachment metadata. Money uses `DECIMAL(18,2)`, policy multipliers `DECIMAL(12,6)`, and leave days `DECIMAL(10,2)`. Dates, timestamps, durations, and flags have native types. Policies/detail arrays use JSONB; `extension_data` retains legacy fields that lack a dedicated column. Core financial data is typed, not a generic JSON store.

Every business table has a company-qualified primary key. Foreign keys include company scope and, where applicable, ensure the child belongs to its parent's employee. Unique constraints cover attendance employee/date, payroll month, user/employee email, entitlements and notification read state. Email uniqueness is case-insensitive. Numeric and chronology constraints reject invalid balances/dates. Blank optional legacy values become NULL and decode as an empty string; blank salary allowances continue to inherit company defaults. Historical actor labels such as `development-seed` remain text; actual employee/user mapping/requester/approver references have foreign keys.

## Setup

Keep credentials outside git. Set `DATABASE_URL` and `DEFAULT_COMPANY_ID`; the default initial company UUID is `00000000-0000-4000-8000-000000000001`. The config's placeholder URL supports offline generation only. It is not a fallback database.

The root `compose.postgres.yml` requires a private `POSTGRES_PASSWORD`, binds only to loopback, and persists its volume:

```sh
docker compose -f compose.postgres.yml up -d
cd server
npm ci
npm run prisma:generate
npm run prisma:validate
npm run db:migrate
npm run db:bootstrap -- --name 'Your company' --currency USD
npm run build
```

`db:migrate` applies committed SQL with `prisma migrate deploy`; it never runs reset, db push, or shadow database commands. Bootstrap creates the company if missing and refuses to change existing name/currency. For a new installation without existing Sheets users, add `--admin-email admin@example.com --admin-name 'Admin Name'`; authorization still requires verified Google OAuth. For migration, omit administrator flags and import the original Users records.

Use separate migration/runtime credentials in production. Runtime does not need superuser/database-owner rights. Restrict database networking to approved app/maintenance hosts and require TLS across hosts. The compose file is a local/staging foundation, not a public database service. Set application persistence mode using the root setup guide; these maintenance commands do not change the live application.

## Adapter contract and concurrency

`PostgresRepository` accepts `{connectionString?,companyId?,client?,transactionTimeoutMs?}`. `initialize()` verifies the connection and existing active company; it does not migrate. `list`, `commit`, and `initialize` retain the original contract. `forCompany(authorizedId)` shares the connection pool with immutable company scope. `find(table,id)` returns a row or null. `health()` reveals only connectivity/provider/company and `disconnect()` closes an owned pool.

`query(table,{where,orderBy,skip,take})` returns `{rows,total}`. Typed predicates support equality, `equals`, `in` (at most 1000 values), `gte`, `lte`, and case-insensitive text `contains`. Ordering uses `{field,direction:'asc'|'desc'}` and a deterministic ID tie-breaker; take is 1–1000. Unmodeled JSON query fields and changed company predicates are rejected.

```ts
const scoped = repository.forCompany(authorizedCompanyId);
await scoped.transaction(async (tx) => {
  // Include every read, validation, financial balance check, and idempotency lookup.
  const rows = await tx.list("Employees");
  await tx.commit(changes); // Business records, audit, and response ledger together.
}); // Send success only after COMMIT resolves.
```

Transactions acquire a PostgreSQL advisory lock scoped to company before service reads, coordinating independent server processes. READ COMMITTED ensures a writer waiting for the lock sees the preceding commit. Foreign keys are deferred until COMMIT for atomic circular/dependency batches; unique constraints remain immediate. Nested transactions reuse the bound transaction. Company scope cannot change within one transaction. No automatic mutation retries occur; retain the original Idempotency-Key after uncertain delivery.

Company selection must come from trusted membership/session data, never an arbitrary body/query field. Every adapter query and write scopes company, and conflicting record company IDs are rejected. Direct SQL bypasses application locks, so live maintenance needs a coordinated write pause. The legacy Linux file lock applies only to Sheets; PostgreSQL concurrency uses database locks.

## Insert-only importer

Back up the target database and archive the source spreadsheet securely. Initialize the target schema/company without creating replacement Users. Use a separate staging database first. Pause legacy writes for the final import: Google Sheets batch reads cannot provide a stable snapshot under concurrent edits.

The importer requests read-only Sheets scope, reads original headers without invoking worksheet initialization, and allows absent optional/new workforce sheets. Keep service-account credentials and the legacy spreadsheet ID private. It defaults to a dry run:

```sh
npm run db:import-sheets -- --dry-run --report /private/import-plan.json
npm run db:import-sheets -- --apply --report /private/import-result.json
npm run db:import-sheets -- --dry-run --report /private/import-verification.json
```

`--company-id UUID` selects a trusted maintenance scope. Reports contain counts, IDs, conflict reasons and checksums; report files are mode 0600. Conflicts produce a nonzero status and no writes. Invalid/missing/duplicate IDs, broken tenant/employee references, unique-key conflicts, and differing existing rows must be resolved deliberately. The importer never updates existing rows: identical records are no-ops and extra target records remain untouched.

Apply inserts and readback verification occur in one company-locked transaction. Verification checks row counts, every normalized imported value, and the exact original `Payroll.snapshot_json` text checksum. Any failure rolls back the complete import. UUIDs, history, immutable snapshots, audit entries, and idempotency responses are preserved. Decimal normalization never uses floating-point arithmetic. A longer import transaction timeout supports migration work; if a company exceeds tested transaction capacity, design a resumable migration rather than silently reducing atomicity.

A repeat after successful import should report identical rows and zero inserts. Imported drafts/pending payroll may require explicit revision because the source representation changes from Sheets strings to typed PostgreSQL records; finalized/paid snapshots remain exact. Validate OAuth, permissions, payroll, attendance, leave, dashboards and exports against staging before a production switch. Keep the prior source read-only through acceptance. Switching back to stale Sheets after accepting new PostgreSQL writes would lose transactions and is not a safe rollback plan.

## Verification and operations

`npm run test:database` explicitly enables real database tests and sets NODE_ENV=test. Set DATABASE_URL to an isolated migrated test database. Ordinary `npm test` skips these tests unless enabled. They create random test companies and retain them for inspection; they do not clear another company, reset a database, or touch live Sheets. Coverage includes typed columns, identical UUID tenant isolation, tenant/employee FK rejection, precision/allowance fidelity, transaction rollback, company locks across clients, attendance uniqueness, workforce relationships including circular leave/document references, exact fractional leave balances, and dry-run/repeatable snapshot-preserving imports. Import tests also reject duplicate UUIDs, case-insensitive email collisions, missing parents, and divergent target values without writing any source rows.

Use encrypted scheduled PostgreSQL backups and test restoration into a different database. Custom-format pg_dump/pg_restore supports rehearsals; never restore over live data as a test. Include private attachment storage in coordinated backups. Monitor disk, connection saturation, transaction failures, backup age and restore readiness. Keep dumps, credentials and reports private. Future schema changes must be additive reviewed migrations validated in staging; never edit the checksum of an already applied migration.

References: [Prisma 7 setup](https://www.prisma.io/docs/orm/v7/prisma-client/setup-and-configuration/introduction), [driver adapters](https://www.prisma.io/docs/orm/v7/core-concepts/supported-databases/database-drivers), [migration practices](https://www.prisma.io/docs/orm/v7/more/best-practices).
