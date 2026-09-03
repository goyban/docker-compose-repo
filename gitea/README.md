# Gitea

Self-hosted Git with a web UI, issues and pull requests. A few hundred MB of Go
that starts in a second, where the alternative is a JVM and a shopping list of
services.

This is the stack the rest of this repo is developed against — the compose files
you're reading live in a Gitea instance, and GitHub is the mirror.

## Quick start

```bash
cp .env.example .env
$EDITOR .env            # PUID/PGID must match the owner of ./gitea
docker compose up -d
```

Open `http://<host>:3000`. You get Gitea's **install wizard**, not a login page —
it writes `app.ini` from what you enter and that's the moment the instance is
configured. Two things to settle there rather than later:

1. **Server and Third-Party Service Settings → Base URL.** Set it to the URL
   people will actually use. Wrong here means every clone URL it hands out is
   wrong.
2. **Create the admin account** at the bottom of the wizard. If you skip it,
   *the first user to register becomes the administrator* — which is fine on a
   LAN and not fine on anything reachable.

## Ports

| Port | Proto | Purpose |
|------|-------|---------|
| 3000 | http | Web UI and the HTTP(S) clone endpoint |
| 222 | ssh | SSH clone endpoint (container listens on 22) |

## Why it looks like this

**It started as upstream's example** —
[Install with Docker](https://docs.gitea.com/installation/install-with-docker/)
— with four changes to bring it in line with the rest of this repo, listed at
the end of this section. Everything else is upstream's, and what follows is what
those choices actually mean.

**SQLite by default.** There's no database container here, and none is needed:
with no `GITEA__database__DB_TYPE` set, Gitea uses SQLite inside `/data`. For one
person or a small team that is genuinely the right answer — one less container,
one less backup, and the performance ceiling is far above what a personal
instance reaches. Upstream documents MySQL and PostgreSQL variants using
`GITEA__database__DB_TYPE=mysql` / `postgres`; switch if you outgrow it, and do
it before there's data to migrate.

**`USER_UID` / `USER_GID` exist because of the bind mount.** `./gitea:/data` is a
host directory, so the `git` user inside the container has to match whoever owns
it. Upstream notes that named volumes avoid the problem entirely — Docker manages
ownership — at the cost of your data being somewhere less obvious.

**SSH is on 222, not 22**, because 22 on the host belongs to the host's own sshd.
This is the source of the most common Gitea confusion: see the gotchas.

**Environment variables map to `app.ini` sections** with the pattern
`GITEA__section__KEY`. So `GITEA__server__ROOT_URL` sets `ROOT_URL` under
`[server]`. Useful to know, because the wizard only exposes a fraction of what
Gitea can be told.

### What was changed from upstream's example

Four things, all for the same reason — this file is published, and a fresh clone
has to work:

- **`${PUID:-1000}` / `${PGID:-1000}` instead of bare `${PUID}`.** Compose
  interpolates an unset variable to an *empty string* and starts the container
  anyway, so upstream's version hands Gitea `USER_UID=` on any clone without a
  `.env`. Defaults are the convention here for exactly this reason.
- **`restart: unless-stopped` instead of `always`**, so a deliberate stop
  survives a reboot.
- **`${DATA_PATH:-./data}` instead of `./gitea`**, which also stops the data
  landing at the slightly comic `gitea/gitea/`.
- **Pinned to `1.27.3` instead of `:latest`**, because Gitea runs schema
  migrations between releases.

Two settings are also present but commented out —
`GITEA__server__SSH_PORT` and `GITEA__server__ROOT_URL` — because both are
things you will need the moment you publish this beyond localhost. See the
gotchas.

## Gotchas

- **SSH clone URLs advertise the wrong port by default.** Gitea knows it listens
  on 22 *inside* the container; it has no idea you published it on 222. So it
  offers `git@host:user/repo.git`, which sends the client to port 22 — the host's
  sshd — and the failure looks like a key problem rather than a port problem.
  Uncomment `GITEA__server__SSH_PORT` in `compose.yaml` (it tracks `SSH_PORT`,
  so the two can't drift), or set the SSH port in the wizard.
- **Behind a reverse proxy, `ROOT_URL` is the setting that matters.** Get it
  wrong and the UI works fine while every clone URL, webhook and OAuth redirect
  points somewhere else. See [reverse proxy](../docs/reverse-proxy.md), which
  already lists Gitea as a service needing this.
- **The install wizard runs once.** After it writes `app.ini`, that file wins —
  changing an environment variable afterwards does *not* change a setting the
  wizard already recorded. Edit `gitea/gitea/conf/app.ini` (or delete it and
  reinstall) if you need to change course.
- **First registered user becomes admin** if you didn't create an admin in the
  wizard. Disable registration once your accounts exist:
  `GITEA__service__DISABLE_REGISTRATION=true`.
- **Back up `./gitea`.** It holds every repository, the SQLite database, and
  `conf/app.ini`. There is nothing else to back up, and nothing in it
  regenerates.
- **Mirror pushes need credentials that outlive your session.** If you push from
  here to GitHub, that's an access token or deploy key stored in Gitea, not your
  laptop's agent.

## Exposing it

Publishes plain HTTP; TLS belongs at the proxy.

- [Reverse proxy with Caddy](../docs/reverse-proxy.md) — **needs `ROOT_URL`**,
  see above. HTTP clone and the web UI both go through it.
- [Cloudflare Tunnel](../cloudflare-tunnel/) — works for the web UI and HTTP
  clone, but **SSH clone won't pass** and the ~100 MB body cap will meet you at
  the first large push. Fine for browsing, awkward as your only route.
- [Single sign-on with Authentik](../docs/authentik-sso.md) — Gitea speaks OIDC
  natively, so use that rather than forward auth, which would break `git` over
  HTTP as surely as it breaks any other non-browser client.

## Links

- Install with Docker: <https://docs.gitea.com/installation/install-with-docker/>
- Configuration cheat sheet: <https://docs.gitea.com/administration/config-cheat-sheet>
- Image: <https://hub.docker.com/r/gitea/gitea>
