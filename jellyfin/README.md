# Jellyfin

Media server. Reads films and TV off disk and streams them to whatever is in
the room — no account, no subscription, nothing phoning home.

## Quick start

```bash
cp .env.example .env
$EDITOR .env            # MEDIA_PATH and RENDER_GID are required
docker compose up -d
```

Open `http://<host>:8096` and point your libraries at `/media` — the path
*inside* the container, whatever `MEDIA_PATH` is on the host.

## Ports

| Port | Proto | Purpose | |
|------|-------|---------|---|
| 8096 | http | Web UI and client API | published |
| 7359 | udp | LAN auto-discovery | published |
| 8920 | https | Jellyfin's own TLS listener | off — TLS belongs at the proxy |
| 1900 | udp | DLNA / SSDP | off — uncomment if you use DLNA |

## Why it looks like this

**The LinuxServer image.** I started with it years ago, it has worked every day
since, and I'm not changing a base image to fix nothing. The better reason: I
run several of their images and they all speak the same dialect —
`PUID`/`PGID`/`TZ`, `/config`, s6, one rebuild cadence. Learn one, learn the
family. Jellyfin's official image is also fine; it just doesn't do the
`PUID`/`PGID` dance, so ownership works differently.

**`/config` lives next to the compose file**, breaking this repo's own
"data outside the repo" rule on purpose. It's Jellyfin's database, metadata and
artwork — 988M after three years here. Under a gigabyte, and keeping it beside
the compose file means the whole service is one `tar` from being moved.
`.gitignore` keeps it out of git. Note that transcode scratch files land under
`/config` and *can* spike several GB — move that path in **Dashboard → Playback**
if the disk is small.

**`PUID`/`PGID`/`TZ` carry defaults** (`${PUID:-1000}`) because they're the same
for every service on a box. Compose resolves them from the default, then `.env`,
then the ambient environment — so a global `export PUID=…`, or OpenMediaVault's
compose plugin, wins. That last one is why my own copy has bare `${PUID}`: OMV
supplies those three, so they're never empty *on my machine*. Without OMV they
would be, and Compose interpolates an empty string and starts anyway rather than
failing. Hence the defaults.

Values that can't be guessed use `${VAR:?message}` instead and abort:

```console
$ docker compose up -d
error while interpolating services.jellyfin.group_add.[]: required variable
RENDER_GID is missing a value: find yours with: getent group render | cut -d: -f3
```

**One `/media` mount.** My real server has three libraries on separate disks;
that's my risk appetite, not yours. Add a line per library if you need more.
Upstream's example splits `/data/tvshows` and `/data/movies` — fine on separate
disks, but if they share a filesystem, mounting the common parent is the better
habit: hardlinks only survive within one mount point inside the container.
Mount media `:ro` if you like — Jellyfin never writes to it.

**Hardware transcoding needs `devices` *and* `group_add`.** Passing
`/dev/dri/renderD128` in is half the job; the node is owned by a host group and
the container user has to be in it or the device opens and does nothing. The
catch is that `group_add` wants a numeric GID and it differs per host — mine is
`105`, on the laptop I wrote this on it's `992`. Copying someone's compose file
verbatim is exactly how you get silently broken acceleration.

```bash
getent group render | cut -d: -f3
```

Not on Intel? Delete both keys — CPU transcoding works, it just costs cores.
NVIDIA and AMD variants:
[LinuxServer's hardware acceleration docs](https://docs.linuxserver.io/images/docker-jellyfin/#hardware-acceleration).

**`restart: unless-stopped`, not `always`** — if I stop it deliberately, it
should stay stopped across a reboot.

## Gotchas

- **`:latest` is a choice.** Pin a tag if that makes you nervous. Back up
  `/config` either way — that directory *is* your server.
- **Auto-discovery is LAN-only.** 7359/udp is broadcast; behind a proxy it does
  nothing for you. Set `JELLYFIN_PublishedServerUrl` there instead.
- **On a subpath, set the base URL** under **Dashboard → Networking** first, or
  the UI loads and every asset 404s. A subdomain avoids the question.
- **Verify hardware transcoding actually engaged.** Enabling VAAPI and it
  *working* are different states — force a transcode and check
  **Dashboard → Playback**. A wrong GID falls back to software silently.

## Exposing it

Publishes plain HTTP; nothing here is proxy-aware.

- [Caddy reverse proxy](../docs/reverse-proxy.md) — what I do.
- [Cloudflare Tunnel](../docs/cloudflare-tunnel.md) — **not for this one.**
  Streaming video through a tunnel breaks Cloudflare's terms and performs badly.
- [Authentik SSO](../docs/authentik-sso.md) — works for the web UI, but native
  clients can't handle a forward-auth login page.

## Links

- Jellyfin docs: <https://jellyfin.org/docs/>
- Hardware acceleration: [upstream](https://jellyfin.org/docs/general/administration/hardware-acceleration/) · [this image](https://docs.linuxserver.io/images/docker-jellyfin/#hardware-acceleration)
- Image: <https://docs.linuxserver.io/images/docker-jellyfin/>
