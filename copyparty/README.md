# copyparty

File server with an unusual amount packed in: resumable uploads, dedup, a media
index with thumbnails, share links, and WebDAV/FTP/SFTP/TFTP on the side. One
Python process, no database server.

Overlaps with [filebrowser](../filebrowser/) — that one is a tidy file manager,
this one is a transfer workhorse. Uploading 40 GB over a flaky connection is
where the difference shows.

## Quick start

```bash
cp .env.example .env
echo "CP_PASSWORD=$(openssl rand -base64 18)" >> .env
$EDITOR .env            # set SHARE_PATH
docker compose up -d
```

Open `http://<host>:3923` and log in as `admin` with that password.

## Ports

| Port | Proto | Purpose |
|------|-------|---------|
| 3923 | http | Web UI, WebDAV, and the API |

## Why it looks like this

**No anonymous access.** Upstream's example config grants `rw: *` — read *and
write* to anybody who can reach the port. That's a sensible LAN dropbox and a
poor default for anything else, so this config gives access to one named
account and nothing to the public. Verified: anonymous gets `403`, the account
gets `200`.

**The password is not in the config file.** copyparty's `[accounts]` section
takes `user: password` in plaintext, which is fine on your own disk but not in
a git repo. Accounts are passed as a command-line argument instead, so
`CP_PASSWORD` stays in `.env`:

```yaml
command: ["-a", "${CP_USER:-admin}:${CP_PASSWORD:?...}"]
```

The username there must match the `accs:` block in
[`init/copyparty.conf`](init/copyparty.conf), or the account exists with no
permissions and every page looks empty.

**`XDG_CONFIG_HOME=/data`.** `/cfg` is mounted read-only, so without this
copyparty can't write its config directory and falls back to `/tmp` — logging a
warning most people scroll past. The consequence is that **the filekeys behind
every share link regenerate on each restart**, quietly breaking links you've
handed out.

**`hist: /data/hist`.** By default the index and thumbnail cache go into a
`.hist` directory *inside the folder you're sharing*. Redirecting it keeps your
media directory as you left it.

**The `ac` image.** Variants differ by what's bundled — `min` is the bare
server, `ac` adds ffmpeg for thumbnails and media tags, others add more. `ac` is
what the config's `e2ts` needs.

## Gotchas

- **Inline comments need two spaces before the `#`.** With one, the `#` and
  everything after becomes part of the value. copyparty warns at startup rather
  than failing, so it's easy to miss.
- **Share links bypass authentication by design.** That's the point of them,
  but a leaked link is public access to that file.
- **`e2dsa` indexes on first start.** For a large share, expect the first boot
  to churn; uploads are blocked while it runs and it says so in the log.
- **Back up `DATA_PATH`.** It holds the index and the filekeys that make share
  links stable.
- **Version-check is opt-in.** Uncomment `vc-url` and `vc-exit` in the config
  and copyparty refuses to start on a version with a known advisory — worth it
  if you expose this.

## Exposing it

- [Reverse proxy with Caddy](../docs/reverse-proxy.md) — needed; the built-in
  TLS uses a self-signed certificate.
- [Single sign-on with Authentik](../docs/authentik-sso.md) — copyparty has its
  own accounts, so forward auth means two logins. Worth it anyway if this faces
  the internet.
- [Cloudflare Tunnel](../cloudflare-tunnel/) — **think first.** Large uploads
  are the reason to run copyparty, and the tunnel's ~100 MB body cap is exactly
  what breaks.

## Links

- Upstream: <https://github.com/9001/copyparty>
- The compose example this started from:
  <https://github.com/9001/copyparty/blob/hovudstraum/docs/examples/docker/basic-docker-compose/docker-compose.yml>
- Image: <https://hub.docker.com/r/copyparty/ac>
