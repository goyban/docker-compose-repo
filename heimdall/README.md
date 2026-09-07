# Heimdall

A start page for everything else in this repo. Tiles that link to your services,
and for some of them an "enhanced" tile that polls the app's API and shows
something useful on the face of it — disk free, active downloads, unread count.

Actively maintained, despite its age: v2.8.3 landed in September 2026.

## Quick start

```bash
cp .env.example .env
$EDITOR .env            # PUID/PGID/TZ have no defaults in compose.yaml
docker compose up -d
```

Open `http://<host>:4080`. There is no login and no setup wizard — you get an
empty dashboard, and everything is configured by clicking around. Read the
security note below before you put anything on it.

## Ports

| Host | Container | Purpose |
|------|-----------|---------|
| 4080 | 80 | Web UI |
| 4043 | 443 | Heimdall's own HTTPS listener — see gotchas |

## Why it looks like this

**The LinuxServer image**, same reasoning as [jellyfin](../jellyfin/README.md):
`PUID`/`PGID`/`TZ`, `/config`, s6, one rebuild cadence. For a service this small
the win is that it behaves like everything else on the box.

**`./data` mounted at `/config`.** The names disagree because the repo's
convention is `data/` on the host and the image's convention is `/config` in the
container. Whatever it's called, it is the entire service: the SQLite database,
uploaded icons, the nginx config, and the API keys of every enhanced tile.

**Nothing else.** No database container, no cache, no environment variables
beyond the LinuxServer three. This is one of the genuinely simple stacks — which
is why the interesting content below is about what Heimdall *doesn't* tell you.

## Gotchas

- **Heimdall blocks requests to your own LAN by default.** This is the one that
  wastes an afternoon. Enhanced tiles — the ones that show live data — make a
  server-side request to the app's API, and the image ships
  `ALLOW_INTERNAL_REQUESTS=false`, which refuses lookups to private or reserved
  IP addresses. Every service in your house is on a private address, so every
  enhanced tile fails, and the tile just sits there looking broken. Add
  `ALLOW_INTERNAL_REQUESTS=true` to the environment block. It is not in
  `compose.yaml` today.
- **There is no authentication out of the box.** Anyone who reaches port 4080
  gets a map of your entire infrastructure, with working links. Heimdall can
  password-protect itself, or you can put basic auth in front via the image's
  nginx:
  ```bash
  docker exec -it heimdall htpasswd -c /config/nginx/.htpasswd <username>
  ```
  then uncomment the basic auth lines in `/config/nginx/site-confs/default.conf`
  and restart. Better still, put [Authentik forward
  auth](../docs/authentik-sso.md#forward-auth--putting-an-app-with-no-sso-behind-authentik)
  in front — a dashboard is the textbook case for it, since it has no accounts
  worth integrating and every client is a browser.
- **Enhanced tiles store API keys in the data directory.** That's a Sonarr key,
  a Nextcloud token, whatever you connected. `data/` is git-ignored by this
  repo's deny-by-default rule — verified — but it means the directory is a
  credential store, not just cosmetics. Back it up accordingly, and don't paste
  it into a gist when asking for help.
- **Port 4043 is Heimdall's own TLS**, with a self-signed certificate. In this
  repo TLS terminates at the proxy, so the mapping is redundant — drop the line
  unless you're reaching it directly and are willing to click through the
  warning.
- **`${PUID}`, `${PGID}` and `${TZ}` are bare.** No `:-1000` defaults, so a
  clone with no `.env` gets empty strings and starts anyway — confirmed:
  Compose emits `The "PUID" variable is not set. Defaulting to a blank string.`
  and carries on. The rest of this repo writes `${PUID:-1000}`.
- **`:latest`.** Heimdall ships real releases (`2.8.3`, `v2.8.3-ls363`); pin one
  if you'd rather not be surprised.
- **Back up `data/`.** Rebuilding a dashboard by hand is an hour you won't enjoy,
  and the icons you uploaded aren't anywhere else.

## Exposing it

- [Reverse proxy with Caddy](../docs/reverse-proxy.md) — the normal route; use
  port 4080 and ignore 4043.
- [Single sign-on with Authentik](../docs/authentik-sso.md) — **strongly
  recommended if this leaves the LAN.** Forward auth is the right fit: no
  accounts to map, browser-only clients, and it stops the dashboard being a
  directory of your network for anyone who finds it.
- [Cloudflare Tunnel](../cloudflare-tunnel/) — fine, it's a small HTML page.

## Links

- Upstream: <https://github.com/linuxserver/Heimdall>
- Image: <https://docs.linuxserver.io/images/docker-heimdall/>
