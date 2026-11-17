# Deployment

Use Node 22.12 or newer. Build the frontend and server on an adequately sized Linux host. Deploy one writer instance per private spreadsheet. The provided systemd service is suitable for a single server; serverless instances or multiple replicas need a replacement distributed coordination/session design.

## Build

```bash
npm run install:all
npm run build
npm test
```

The frontend production output is `client/dist`; the server output is `server/dist`. Configure the environment before starting. Use a stable `SESSION_SECRET`, stable writable session directory, and HTTPS app origin. See [Google setup](GOOGLE_SETUP.md).

## Linux service

Create a dedicated unprivileged user, copy the repository to `/workspace/easy-manage`, and create the runtime directory:

```bash
useradd --system --home /var/lib/easymanage --shell /usr/sbin/nologin easymanage
install -d -o easymanage -g easymanage -m 700 /var/lib/easymanage
```

Configure `SESSION_DIR=/var/lib/easymanage/sessions` and `WRITER_LOCK_DIR=/var/lib/easymanage/writers` in the same writable runtime directory. Make the environment readable only by root and the application account, for example owner `root:easymanage`, mode `0640`. If using a service-account JSON file, keep it outside the checkout and grant only the application account read access.

Copy `deploy/easymanage.service` to `/etc/systemd/system/easymanage.service`. Adjust paths for your Node installation and repository. Then:

```bash
systemctl daemon-reload
systemctl enable --now easymanage
systemctl status easymanage
journalctl -u easymanage --no-pager -n 50
```

The production app should bind to loopback behind a TLS proxy. Set the exact production origin, OAuth callback, secure-cookie mode, and trust only the known reverse proxy. Expose HTTPS externally, not the backend listener. The workspace deployment uses a Solid HTTPS endpoint forwarding to port 3001 on a dedicated 4 GB machine.

## Verification

Check `/api/health`, Google authorization, allowlist rejection, session persistence through restart, and a real Sheets write on a development spreadsheet. Test reports and payroll with a known expected total. Confirm private APIs return 401 without a session and mutations fail without the correct CSRF token. Verify both desktop and mobile layouts.

## Backups and upgrades

Keep private spreadsheet backups and a copy of application configuration in an approved secret store. Do not include service-account keys or environment files in source archives. Stop the writer before a schema upgrade or manual repair. Run `init-sheets` to apply supported additive columns. Deploy code and build output together, restart the service, then run the smoke checks. Preserve the session secret and session directory through ordinary upgrades.

## Operational limits

Do not run multiple writers against the same spreadsheet. Google Sheets has API quotas and no database isolation across independent clients. Restrict editor access and avoid manual row changes while EasyManage is active. Large employee/payroll histories should move to a database behind the repository abstraction. Financial write uncertainty requires checking the idempotency ledger, not repeatedly submitting with fresh keys.
