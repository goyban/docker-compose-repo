<!--
DAILY CHECKLIST — copy this directory, then:
  1. Paste your real compose file into compose.yaml
  2. Replace host paths with ${DATA_PATH} etc. and list them in .env.example
  3. Fill "Why it looks like this" — this is the part worth reading
  4. Add a row to the service table in the root README.md
  5. Commit: "add <service>"
Delete this comment when you're done.
-->

# <Service>

One line: what it is and why you run it.

## Quick start

```bash
cp .env.example .env
$EDITOR .env
docker compose up -d
```

Then open `http://<host>:<port>`.

## Port

| Port | Protocol | Purpose |
|------|----------|---------|
| xxxx | http     | Web UI  |

## Why it looks like this

<!--
The differentiator. Not "what the options do" — the docs already say that.
Why *these* choices, on a real machine, after living with it.

Prompts, delete what doesn't apply:
  - Why this image? (linuxserver vs. official vs. a fork — what made you switch?)
  - Why these mounts? What actually needs to persist, and what surprised you?
  - PUID/PGID — what breaks when they're wrong?
  - Anything here because something failed once? Those are the best notes.
  - Anything you tried first that didn't work?
  - Resource limits, hardware access (GPU, /dev/dri), device passthrough
  - Why this restart policy
-->

## Gotchas

<!-- Things that cost you time. Empty is fine on day one — add as you hit them. -->

## Exposing it

Publishes a plain HTTP port; nothing here is proxy-aware.

- [Reverse proxy with Caddy](../docs/reverse-proxy.md)
- [Cloudflare Tunnel](../docs/cloudflare-tunnel.md)
- [Single sign-on with Authentik](../docs/authentik-sso.md)

<!-- If this service DOES need proxy-specific config (Nextcloud, Gitea), say so here. -->

## Links

- Upstream docs:
- Image:
