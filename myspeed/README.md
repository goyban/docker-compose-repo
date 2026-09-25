# MySpeed

Speed test *history*. It runs a test on a cron schedule, keeps the results for as
long as you tell it to, and draws the graph — so you can answer "is it slow right
now, or has it been slow every evening for a fortnight?"

Pairs with [librespeed](../librespeed/) rather than competing with it: that one
is an on-demand test you open when you want a number, this one is the unattended
recorder. MySpeed can even use LibreSpeed as its measurement backend — it offers
**Ookla, LibreSpeed and Cloudflare** as test providers, so the instance next door
can be the thing it measures against.

## Quick start

```bash
cp .env.example .env     # optional -- every value has a default
docker compose up -d
```

Open `http://<host>:5216`. Everything — schedule, retention, provider, alerts —
is configured in the web UI, not in this file.

## Ports

| Port | Proto | Purpose |
|------|-------|---------|
| 5216 | http | Web UI and API |

## Why it looks like this

**A bind mount instead of upstream's named volume.** The official install is
`docker run -v myspeed:/myspeed/data`, a Docker-managed volume. Here it is
`${DATA_PATH:-./data}`, so the history database sits next to the compose file
where you can see it and a backup job can find it without knowing Docker's
layout. Same reasoning as [jellyfin](../jellyfin/README.md)'s `/config`.

**MySpeed itself takes no environment configuration** — no `PUID`, no `TZ`, no
options. State and settings both live in the SQLite database in that one
directory, which makes the stack trivially portable and the backup story simple:
copy the directory. The variables in `.env.example` are therefore Compose-level
only: the image tag, the host port, and where that directory lives.

## Gotchas

- **`latest` is a build from May 2024.** The project is alive — the repository
  was pushed to in September 2026 — but the last tagged release is `v1.0.9` and
  Docker Hub's `latest` still points at that same image:

  | Tag | Pushed | Size | Digest |
  |-----|--------|------|--------|
  | `development` | 2026-08-02 | 102 MB | `sha256:043c2f00…` |
  | `latest` | 2024-05-21 | 59 MB | `sha256:3a3e774b…` |
  | `1.0.9` | 2024-05-21 | 59 MB | `sha256:3a3e774b…` |

  So `latest` here does not mean recent — it means "the newest *release*", and
  there hasn't been one since May 2024. It will start moving again if upstream
  tags one. Until then, "update to the newest version" means
  `MYSPEED_TAG=development`, which is a choice to make knowingly rather than a
  `docker compose pull` away.
- **Scheduled tests run on container time.** The whole feature is cron
  expressions, and the image documents no `TZ` variable — so "run at 03:00" is
  03:00 **UTC** unless you tell the container otherwise. The two clock mounts are
  in `compose.yaml`, commented out; uncomment them to follow the host instead.
  They are off by default because turning them on shifts every existing schedule
  by your UTC offset. Same class of trap as the cron container in
  [firefly](../firefly/README.md).
- **A speed test measures the path from *this box*.** If MySpeed runs on the NAS,
  the graph is the NAS's connectivity — which is usually what you want, but it is
  not your laptop's Wi-Fi. And a low-power host can cap the result on CPU before
  the link saturates; see [librespeed](../librespeed/README.md) for the same
  caveat.
- **Back up the data directory.** Months of measurements and every setting are in
  there, and nothing regenerates.

## What else it does

Worth knowing about before you go looking for another tool:

- **Health checks with alerting** — email, Signal, WhatsApp or Telegram when a
  test fails or the line goes down.
- **Prometheus and Grafana export**, if you would rather graph this beside
  everything else.
- **Multiple servers on one instance**, so a single dashboard can watch more than
  one site.
- **Configurable retention**, from a few days to forever.

## Exposing it

- [Reverse proxy with Caddy](../docs/reverse-proxy.md) — fine; the UI is just a
  dashboard, and the tests run server-side regardless of how you reach it.
- [Cloudflare Tunnel](../cloudflare-tunnel/) — fine for the dashboard, unlike
  [librespeed](../librespeed/README.md): the measurements do not travel through
  the tunnel, only the page does.
- [Single sign-on with Authentik](../docs/authentik-sso.md) — forward auth suits
  it: browser-only, no accounts of its own. MySpeed has no authentication
  built in, so anyone who reaches the port can change the schedule and read the
  history.

## Links

- Upstream: <https://github.com/gnmyt/MySpeed>
- Website and docs: <https://myspeed.dev> · <https://docs.myspeed.dev/setup/linux>
- Image: <https://hub.docker.com/r/germannewsmaker/myspeed>
