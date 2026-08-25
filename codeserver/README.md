# code-server

VS Code in a browser. Useful for editing on the NAS from a laptop, a tablet, or
any machine you don't want to set a toolchain up on.

## Quick start

```bash
cp .env.example .env
$EDITOR .env            # PASSWORD is required
docker compose up -d
```

Open `http://<host>:8443`. The password from `.env` is the only credential.

## Ports

| Port | Proto | Purpose |
|------|-------|---------|
| 8443 | http | Editor UI (plain HTTP — put TLS in front of it) |

## Read this before exposing it

code-server is not a document editor with a terminal bolted on. It **is** a
shell, with a file browser, running as `PUID`/`PGID`, with network access to
everything the container can reach. Treat exposing it exactly as you'd treat
exposing SSH.

Three consequences worth being deliberate about:

**`PASSWORD` is required here** (`${PASSWORD:?…}`), which is a deviation from
upstream's example. Their compose marks it `#optional`, and it is — but the
docs also say: *"If PASSWORD or HASHED_PASSWORD is not provided, there will be
no auth."* Optional-and-silently-open is the wrong default for something that
hands out a shell, so this stack refuses to start without one.

**`SUDO_PASSWORD` is how you install anything.** The image is deliberately
minimal — no python, no pip, no compilers — so `sudo apt install python3-pip`
is the normal first move, and that needs sudo enabled. It grants root *in the
container*, which is a real boundary but not your host. Leave it empty if you
only ever edit; the init script tests for a non-empty value, so empty means
disabled rather than an enabled blank password.

**Whatever you mount is executable, not just editable.** The commented
`PROJECTS_PATH` line is genuinely convenient and genuinely a decision — mount
your code, not your whole home directory. Never mount `/var/run/docker.sock`
here; that converts a container password into root on the host.

## Why it looks like this

**LinuxServer image**, so the usual `PUID`/`PGID`/`TZ` contract applies and
files you create are owned by you rather than root. Same reasoning as
[jellyfin](../jellyfin/) — one dialect across the stacks.

**`HASHED_PASSWORD` is offered but commented.** `.env` is git-ignored, so a
plaintext password there is not exposed, but the hash means the credential
isn't sitting in a readable file at all. Generate one with
`echo -n "yourpassword" | npx argon2-cli -e`. It overrides `PASSWORD` when set.

**`PROXY_DOMAIN` is commented out.** It only matters if you want forwarded
ports served as subdomains — port 3000 as `3000.code.example.com` — which needs
a wildcard DNS record and a wildcard certificate. Without it, forwarded ports
still work through the editor's own proxy path.

**`DEFAULT_WORKSPACE` is set** so the editor opens somewhere useful instead of
an empty file picker on every visit.

## What survives a rebuild, and what doesn't

`/config` is the app user's home directory — `abc:x:911:1001::/config` — and
it's the only persisted path. That single fact decides how you should install
things:

| Installed with | Lands in | Survives `docker compose up` after a pull? |
|---|---|---|
| `sudo apt install …` | `/usr/…` | **No** — gone with the old container |
| `pip install --user …` | `/config/.local` | Yes |
| VS Code extensions | `/config` | Yes |
| Anything in your workspace | `/config/workspace` | Yes |

So `sudo apt install python3-pip` has to be repeated after every image update,
while the packages you then `pip install --user` stay put. Prefer `--user`
installs, and keep a note of the apt packages you need so you can replay them.

If a toolchain matters enough that re-running apt annoys you, build a small
image `FROM lscr.io/linuxserver/code-server` with the packages baked in.

## Gotchas

- **Extensions live in `/config`.** They're part of what to back up, and
  they're why the config directory grows.
- **The VS Code Marketplace isn't available.** code-server uses Open VSX, so a
  few Microsoft-licensed extensions are missing. Most have equivalents.
- **Port forwarding is per-session.** Ports you open inside the editor are
  reachable through it, not published on the host.
- **A container password is a weaker boundary than it looks.** Anyone who logs
  in can reach every service on your Docker network directly by name.

## Exposing it

- [Reverse proxy with Caddy](../docs/reverse-proxy.md) — the minimum. Never
  serve this over plain HTTP off your LAN; the password crosses the wire.
- [Single sign-on with Authentik](../docs/authentik-sso.md) — a good fit here.
  Forward auth in front of code-server means an attacker needs to get past
  Authentik before reaching a login form that leads to a shell.
- [Cloudflare Tunnel](../cloudflare-tunnel/) — works, and avoids opening a port.
  Pair it with Cloudflare Access rather than relying on the password alone.

## Links

- Image docs: <https://docs.linuxserver.io/images/docker-code-server/>
- Upstream: <https://github.com/coder/code-server>
