# Self-hosted Compose Stacks

Docker Compose files for the services I actually run, with notes on **why each
one looks the way it does** — the trade-offs, the things that broke once, the
settings that aren't obvious from the upstream docs.

Every stack is standalone. You need Docker and nothing else: no OMV, no
Kubernetes, no particular distro.

> Maintained by **Goyban** — I make videos about self-hosting, NAS, Linux and
> the terminal. TODO: YouTube link
>
> These stacks run on the setup documented in TODO: link to Homelab repo.

---

## Usage

```bash
git clone TODO:_repo_url && cd <repo>
cd jellyfin
cp .env.example .env
$EDITOR .env            # set paths, ports, timezone
docker compose up -d
```

Each service directory is self-contained: a `compose.yaml`, a `.env.example`,
and a `README.md` explaining the choices.

---

## Services

Every service publishes a plain HTTP port. TLS, domains and authentication are
handled separately — see [Exposing services](#exposing-services).

| Service | Port | Notes |
|---------|------|-------|
| [jellyfin](jellyfin/) | 8096 | Media streaming. Also 7359/udp for auto-discovery |
| [openwebui](openwebui/) | 3033 | LLM chat UI, talks to an external model backend |
| [owui-ollama](owui-ollama/) | 3034 | Open WebUI bundled with Ollama |
| [overleaf](overleaf/) | 8020 | LaTeX editor. Needs Mongo + Redis |

<!-- One row per service. Add as you go — the table is the index people scan. -->

---

## Exposing services

Nothing in a compose file here is proxy-aware, so you can put whatever you like
in front:

- **[Reverse proxy with Caddy](docs/reverse-proxy.md)** — subdomain + automatic
  TLS. The default choice.
- **[Cloudflare Tunnel](docs/cloudflare-tunnel.md)** — no open ports, no VPS.
  Good for light services; **not** for media streaming or large uploads —
  the doc explains why.
- **[Single sign-on with Authentik](docs/authentik-sso.md)** — OIDC where the
  app supports it, forward auth where it doesn't.

---

## Conventions

A few rules that keep the stacks consistent and safe to publish:

- **Data lives outside the repo.** Paths come from `${DATA_PATH}` in `.env`, so
  a clone never fills up with application state and `git status` stays clean.
- **Secrets live in `.env`**, which is git-ignored. Only `.env.example` is
  committed, with placeholders.
- **Shared settings have defaults; host-specific ones fail loudly.** `PUID`,
  `PGID`, `TZ` and ports are written `${PUID:-1000}` in the compose file, so a
  fresh clone runs with no `.env` at all. Three layers can set them, in
  increasing priority: the default in `compose.yaml`, the service's `.env`, then
  anything exported in your shell — so a global `export PUID=…` in `~/.profile`
  keeps working and overrides both. Values that *cannot* have a sensible
  default — a media path, a `render` group GID — use `${VAR:?message}` instead
  and abort with an explanation rather than silently interpolating an empty
  string.
- **The repo ignores by default** — everything inside a service directory is
  ignored except `compose.yaml`, `.env.example` and `README.md`. A new service
  can't leak a database by accident.
- **No `version:` key** — obsolete in Compose v2.
- **LinuxServer.io images where they fit.** `lscr.io/linuxserver/*` images all
  speak the same dialect: `PUID`/`PGID`/`TZ` for ownership and time, `/config`
  for state, s6 as init, a shared base rebuilt on a regular cadence. Learn one
  and you've learned the family — worth more across a dozen stacks than tuning
  each image separately. Where a project ships a strong first-party image
  (Open WebUI, Overleaf), I use that instead.

---

## Adding a service

```bash
cp -r _template <service>
```

Then follow the checklist at the top of `_template/README.md`.

---

## License

MIT — see [`LICENSE`](LICENSE).
