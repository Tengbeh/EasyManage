# EasyManage server

Express/TypeScript REST API with PostgreSQL/Prisma, verified Google OAuth, server sessions, CSRF, tenant-scoped transactions, centralized permissions, Decimal payroll, private documents and authorized exports.

See the [root setup guide](../README.md), [database/migration guide](../docs/DATABASE.md) and [Phase 4 API/policies](../docs/PHASE4.md).

From this directory: `npm ci`, configure `.env`, `npm run prisma:generate`, `npm run db:migrate`, `npm run db:bootstrap -- --name 'Company' --admin-email admin@example.com`, then `npm run dev`. Production uses `npm run build` and `npm start`, after reviewed migrations and HTTPS/private persistent storage configuration.

`npm test` executes the core regression suite. `RUN_DATABASE_TESTS=1 NODE_ENV=test npm test` additionally executes real PostgreSQL tests using an isolated migrated database. Fixtures live under `test/` and are never imported by `src/index.ts`. A test provider does not establish real Google OAuth acceptance.

Historical Sheets maintenance commands remain solely for migration compatibility. They are not application startup commands. Do not use old demo seed scripts against production or as a replacement for PostgreSQL initialization.
