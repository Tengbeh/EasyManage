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

The production app should bind to loopback behind a TLS proxy. Set the exact production origin, OAuth callback, secure-cookie mode, and trust only the known reverse proxy. Expose HTTPS externally, not the backend listener.

The workspace deployment uses this chain on a dedicated 4 GB machine:

```text
Solid HTTPS endpoint → nginx 127.0.0.1:3000 → Express 127.0.0.1:3001
```

The tunnel does not preserve the external HTTPS protocol in the form Express needs for secure cookies. Install `deploy/nginx-loopback.conf` as an nginx site, change its hostname to the actual application origin, and connect the tunnel to port **3000**. Keep `TRUST_PROXY=1`. This trusted local proxy sets `X-Forwarded-Proto: https` and overwrites forwarded headers; it must remain loopback-only and receive traffic exclusively from the HTTPS tunnel. Do not disable secure cookies to work around missing proxy headers. Query logging is disabled so OAuth authorization codes are not recorded in proxy logs.

This conservative proxy configuration treats traffic as coming from the tunnel's loopback address, so API rate limits are shared across users. Deployments needing per-client IP limits should configure a verified, sanitized client-address chain at their trusted ingress before changing this behavior.

## Verification

Check `/api/health`, Google authorization, allowlist rejection, session persistence through restart, and a real Sheets write on a development spreadsheet. Confirm a fresh `/api/auth/google` request returns a session cookie with `Secure`, `HttpOnly`, and `SameSite=Lax`, and that OAuth state survives the redirect. Test reports and payroll with a known expected total. Confirm private APIs return 401 without a session and mutations fail without the correct CSRF token. Verify both desktop and mobile layouts.

## Backups and upgrades

Keep private spreadsheet backups and a copy of application configuration in an approved secret store. Do not include service-account keys or environment files in source archives. Stop the writer before a schema upgrade or manual repair. Run `init-sheets` to apply supported additive columns. Deploy code and build output together, restart the service, then run the smoke checks. Preserve the session secret and session directory through ordinary upgrades.

## Operational limits

Do not run multiple writers against the same spreadsheet. Google Sheets has API quotas and no database isolation across independent clients. Restrict editor access and avoid manual row changes while EasyManage is active. Large employee/payroll histories should move to a database behind the repository abstraction. Financial write uncertainty requires checking the idempotency ledger, not repeatedly submitting with fresh keys.
