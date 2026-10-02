# Miqass local Docker deployment

The local production stack serves the React application and Express API from one container. MongoDB Atlas and Upstash Redis remain external so the local runtime continues using the existing production data configured in `Miqass.env`.

## Services

- `app`: production frontend and backend on `127.0.0.1:15000`
- `cloudflared`: optional `public` profile that publishes `miqass.app` and `www.miqass.app`

The locally managed tunnel credentials are injected through `.cloudflared/tunnel.env`, which is excluded from Git. The tracked `.cloudflared/config.yml` documents and validates the hostname-to-service rules; Docker uses the equivalent `--url http://app:5000` configuration to avoid Windows bind-mount permission issues.

The Docker deployment uses the dedicated `miqass-local` tunnel (`d8545d1d-baaf-460c-bc04-8663c5ee9e23`). The older remotely managed `Miqass` tunnel is left untouched for rollback and is not used by this stack.

## Start

```powershell
.\scripts\start-local.ps1
```

After local health checks pass, start the public tunnel:

```powershell
.\scripts\start-local.ps1 -Public
```

Cron jobs are disabled by default to prevent duplicate reminders and campaigns while the Render service is still running. Only after Render has been stopped, recreate the local app with cron enabled:

```powershell
.\scripts\start-local.ps1 -Public -EnableCron
```

## Status and stop

```powershell
.\scripts\status-local.ps1
.\scripts\stop-local.ps1
```

## DNS cutover

The DNS cutover is intentionally separate from container startup. Validate the application and tunnel before replacing the existing Vercel records.

Do not cut over DNS until the production MongoDB connection succeeds and `http://127.0.0.1:15000/api/health` returns HTTP 200.

Previous routing for rollback:

- `miqass.app`: Vercel A records `216.198.79.1` and `64.29.17.1`
- `www.miqass.app`: CNAME `59d966b45ec01fe6.vercel-dns-017.com`

The public site depends on this Windows machine, Docker Desktop, the `app` container, and the `cloudflared` container remaining online.
