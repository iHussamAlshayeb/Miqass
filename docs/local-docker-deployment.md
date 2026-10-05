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

Docker is the only runtime (Render has been retired), so cron jobs (reminders, campaigns, review requests) are enabled by default. To start the app without them, for example while testing against production data, pass `-DisableCron`:

```powershell
.\scripts\start-local.ps1 -DisableCron
```

Only one running instance should have cron enabled at a time, otherwise customers receive duplicate messages.

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

## Daily database backups

MongoDB Atlas M0 (free tier) has no backups, so the `backup` service runs `mongodump` every day at 03:00 Riyadh time (00:00 UTC) and on startup when today's backup is missing. Archives are written to `./backups/miqass-YYYY-MM-DD_HHMM.archive.gz` on the host (excluded from Git and from the Docker build context) and the last 7 are kept.

```powershell
docker compose logs --tail 20 backup   # check the last run
dir .\backups                          # list archives
```

Restore the whole database from an archive (overwrites existing collections, use with care):

```powershell
docker compose run --rm --entrypoint mongorestore -v ${PWD}/backups:/backups backup `
  --uri "<MONGO_URI>" --archive=/backups/<file>.archive.gz --gzip --drop
```

To recover a single salon, restore the archive into a temporary database first (`--nsFrom "barbershop_db.*" --nsTo "restore_tmp.*"`) and copy only that salon's documents back.

## Deleting a salon

Deleting from the super admin screen is a soft delete: the salon is hidden and disabled immediately (booking, login, WhatsApp, campaigns) and can be restored from the same screen for 30 days. A daily job permanently removes it and all of its data afterwards. The delete button requires typing the salon slug.
