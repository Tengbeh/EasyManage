# Connect EasyManage to Google

EasyManage requires credentials belonging to the company running it. The application does not ship with a Google account, OAuth client, or spreadsheet. Until configured, sign-in and business APIs remain unavailable. There is no substitute database or demo authentication.

## 1. Create the project and enable Sheets

In [Google Cloud Console](https://console.cloud.google.com/), select or create a dedicated company project. Enable **Google Sheets API** under APIs & Services → Library. Keep development and production in separate projects or at least separate spreadsheets and OAuth clients.

## 2. Configure Google sign-in

Open Google Auth Platform (or APIs & Services → OAuth consent screen). Set the application name to **EasyManage**, configure your support email, and choose Internal for a suitable Workspace organization or External for other Google accounts. For an external app in Testing, add the actual administrator and test users. Request only `openid`, `email`, and `profile` for sign-in. Do not request spreadsheet access from every employee: the backend service account handles that separately.

Create an OAuth client of type **Web application**. Register the exact callback URL:

```
https://YOUR-APP-HOST/api/auth/google/callback
```

For this workspace deployment:

```
https://easymanage-2y6bf83.solid.site/api/auth/google/callback
```

For local development use a separate client or add:

```
http://localhost:3001/api/auth/google/callback
```

Set the client ID and secret on the server. If your consent-screen configuration requires domain verification that is unavailable for the preview domain, deploy to a company-controlled verified domain before completing OAuth configuration. Keep scheme, host, port and path exact; `redirect_uri_mismatch` usually means these differ.

## 3. Create the spreadsheet service identity

Under IAM & Admin → Service Accounts, create a service account dedicated to EasyManage. It does not need the project Owner or Editor role. Create a JSON key if your organization permits keys. Keep the key outside source control with restricted file permissions. Copy its `client_email` and `private_key` into server configuration. The private key must retain its PEM header/footer and newlines (the server accepts escaped `\n`). Never place it in a `VITE_` variable or send it to the browser.

Create a private Google Spreadsheet and share it as **Editor** with the service account's exact email address. Do not enable “anyone with the link.” The spreadsheet ID is the part between `/d/` and `/edit` in its URL. The service account accesses this explicitly shared spreadsheet, not your personal Drive files.

## 4. Set backend environment

Copy `server/.env.example` to `server/.env`; fill the Google values, `CLIENT_URL`, and a cryptographically random `SESSION_SECRET` of at least 32 bytes. Use the real HTTPS origin for production. Example values (not credentials):

```dotenv
GOOGLE_CLIENT_ID=your-client.apps.googleusercontent.com
GOOGLE_CLIENT_SECRET=your-client-secret
GOOGLE_CALLBACK_URL=https://YOUR-APP-HOST/api/auth/google/callback
GOOGLE_SHEETS_SPREADSHEET_ID=your-private-spreadsheet-id
GOOGLE_SERVICE_ACCOUNT_EMAIL=easymanage@your-project.iam.gserviceaccount.com
GOOGLE_SERVICE_ACCOUNT_PRIVATE_KEY="-----BEGIN PRIVATE KEY-----\nYOUR-KEY\n-----END PRIVATE KEY-----\n"
SESSION_SECRET=generate-a-long-random-secret
CLIENT_URL=https://YOUR-APP-HOST
SERVER_PORT=3001
NODE_ENV=production
```

Generate a secret with `openssl rand -hex 32`. `chmod 600 server/.env`. Follow the shipped `.env.example` for all supported options; it is the configuration source of truth. Restart the service after changes.

## 5. Initialize and bootstrap

From `server/`, run `npm run init-sheets` to create missing tabs, validate existing headers, and initialize company settings. Initialization preserves existing records and refuses incompatible schemas. Run the secure administrator bootstrap command documented in the root README to add a specific, company-controlled Google email to `Users`. Bootstrap is a local operator action; it is not a public “first person becomes administrator” endpoint.

The first administrator signs in with Google and adds authorized users through User Management. Users who are not on the active authorized list are rejected even if Google successfully authenticates them.

For a development spreadsheet only, the optional demo seed script creates clearly labeled fictional records. Do not seed a production spreadsheet. See root README for command and guard requirements.

## 6. Verify connection and identity

1. Start the server and frontend or deploy the production build.
2. Visit `/api/health`: configuration flags indicate presence of configuration, not proof that credentials work.
3. Run initialization successfully to verify actual Sheets permissions and schema.
4. Sign in as the bootstrapped administrator; confirm the authenticated account and role.
5. Attempt sign-in with a non-authorized account; confirm rejection.
6. Add a temporary employee, confirm it appears in the private spreadsheet, then archive it. Confirm an audit entry appears.
7. Test HR and Accountant accounts separately. Test payroll on a development sheet before live use.

## Troubleshooting

- **API disabled / accessNotConfigured:** enable Google Sheets API in the service account's project.
- **403 permission denied:** share the spreadsheet with the service account as Editor; verify the account and spreadsheet ID.
- **404 spreadsheet not found:** incorrect ID or missing sharing permission can both appear as not found.
- **Invalid JWT signature:** wrong/revoked private key, malformed newlines, or mismatched account email.
- **Google access blocked:** check consent-screen test users, organization restrictions and verified domain configuration.
- **Signed in but unauthorized:** add that exact verified email as active in Users using the bootstrap process or an administrator.
- **Session disappears:** ensure HTTPS, exact client origin, stable session secret, writable persistent session directory and correct reverse proxy trust.
- **Schema mismatch:** back up the spreadsheet before changing headers. Do not reorder rows or columns while the app is running. Follow the recorded schema rather than deleting data to make validation pass.
- **Quota limit:** avoid spreadsheet-wide refresh loops. The repository caches reads and retries transient read failures with backoff. Keep one writer instance per spreadsheet.

References: [OAuth web server flow](https://developers.google.com/identity/protocols/oauth2/web-server), [server-side ID token verification](https://developers.google.com/identity/gsi/web/guides/verify-google-id-token), [Sheets batch updates](https://developers.google.com/workspace/sheets/api/reference/rest/v4/spreadsheets/batchUpdate).
