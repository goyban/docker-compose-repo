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
| [audiobookshelf](audiobookshelf/) | 13378 | Audiobooks and podcasts, with per-user progress sync |
| [cloudflare-tunnel](cloudflare-tunnel/) | — | Outbound connector. Exposes other services without opening a port |
| [codeserver](codeserver/) | 8443 | VS Code in a browser. Effectively a remote shell — read its README before exposing |
| [copyparty](copyparty/) | 3923 | File server built for big/resumable transfers, WebDAV, media index |
| [filebrowser](filebrowser/) | 3672 | Web file manager for one directory tree (FileBrowser Quantum fork) |
| [firefly](firefly/) | 8564 | Personal finance / double-entry ledger. Also 8566 for the data importer |
| [gitea](gitea/) | 3000 | Self-hosted Git with issues and PRs. Also 222 for SSH clone |
| [gluetun](gluetun/) | 9880 | VPN kill switch with qBittorrent + pyload-ng inside it, plus HTTP/SOCKS proxies |
| [heimdall](heimdall/) | 4080 | Dashboard / start page for the other services |
| [httpserver](httpserver/) | 8083 | Bare nginx file share. Plain HTTP on purpose — works with very old clients |
| [immich](immich/) | 2283 | Photo and video library with local ML search. Four containers, Postgres + VectorChord |
| [librespeed](librespeed/) | 3011 | Self-hosted speed test. Measures the path to your box, not your ISP |
| [jellyfin](jellyfin/) | 8096 | Media streaming. Also 7359/udp for auto-discovery |
| [myspeed](myspeed/) | 5216 | Scheduled speed tests with history graphs. Records what librespeed measures on demand |
| [openwebui](openwebui/) | 3033 | LLM chat UI. One `OWUI_TAG` switches between CPU, CUDA and bundled-Ollama |
| [overleaf](overleaf/) | 8020 | LaTeX editor. Four containers: app, Mongo (replica set), Redis, init |

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
