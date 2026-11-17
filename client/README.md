# EasyManage client

React, TypeScript, Vite, Tailwind CSS, shadcn-style Radix components, Lucide, Recharts, React Router, React Hook Form/Zod, and TanStack Query.

```sh
npm ci
cp .env.example .env
npm run dev
```

The development server runs on port 5173 and proxies `/api` to Express on port 3001. Configure those development values in `.env`. Google and Sheets credentials belong only in `server/.env`.

```sh
npm run typecheck
npm run build
```

Production output is `dist/`, served by the backend using same-origin cookie authentication. React routes require the backend's SPA fallback.

There are no seeded business records, demo sessions, or browser storage persistence in this client. The public login and setup pages report the health endpoint's actual configuration flags. Private views require `/api/auth/me`, and all mutations send CSRF and idempotency headers. Form/confirmation retries retain their original key when the request body has not changed.

Shared tables, forms, dialogs, status indicators and empty/error states live in `src/components/shared.tsx`. Writable resource definitions live in `src/lib/resources.ts`. Payroll provides explicit preview, generate, adjustment, submit, approve/reject, revise, finalize, and paid actions. Reports preview the actual API data and export the server's PDF/XLSX/CSV files.
