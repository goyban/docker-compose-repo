# Overleaf

Self-hosted LaTeX editor — the Community Edition of overleaf.com. Real-time
collaborative editing, compiles server-side, keeps a full TeX Live install so
you don't maintain one locally.

## Quick start

```bash
cp .env.example .env
echo "OVERLEAF_INVITE_TOKEN_SECRET=$(openssl rand -base64 32)" >> .env
$EDITOR .env            # set OVERLEAF_SITE_URL
docker compose up -d
```

First boot takes a minute or two. Then create the first admin account — there
is no signup form until a user exists:

```bash
docker compose exec sharelatex bash -c \
  'cd /overleaf/services/web && node modules/server-ce-scripts/scripts/create-user.mjs --admin --email=you@example.com'
```

It prints an activation URL. Open it, set a password, done.

## Ports

| Port | Proto | Purpose |
|------|-------|---------|
| 8020 | http | Web UI (container listens on 80) |

Mongo and Redis are reachable only on the internal compose network.

## Why it looks like this

**Four containers, not one.** The app, MongoDB, Redis, and a one-shot replica-set
initializer. Overleaf is a small distributed system pretending to be an app.

**Mongo runs as a replica set** (`--replSet overleaf`) even though there's one
node. Overleaf uses transactions and change streams, which Mongo only provides
in replica-set mode. Something has to call `rs.initiate()` exactly once, which
is what [`init/mongodb-init-replica-set.js`](init/mongodb-init-replica-set.js)
does — Mongo runs anything in `/docker-entrypoint-initdb.d/` on first start
against an empty data directory. Skip this and Overleaf hangs at boot with
errors that don't mention replica sets.

`extra_hosts: mongo:127.0.0.1` is part of the same trick: the init script
registers the member as `mongo:27017`, so during initialization the container
has to resolve its own service name.

**No `SANDBOXED_COMPILES`.** Upstream's sample `docker-compose.yml` ships these
*enabled*:

```yaml
SANDBOXED_COMPILES: "true"
DOCKER_RUNNER: "true"
SANDBOXED_COMPILES_SIBLING_CONTAINERS: "true"
```

Directly above them, its own comment says sandboxed compiles are Server Pro
only and "must be commented out to avoid compile issues" on Community Edition.
Copy that file as-is and your documents don't compile. They're absent here on
purpose.

**The image is pinned to `6.2.2`.** Upstream's sample is unpinned. This is a
database-backed service with schema migrations between majors — an unattended
`docker compose pull` picking up a new major is not something you want to
discover on a Sunday.

**`container_name: overleaf-mongo` / `overleaf-redis`**, while the *service*
names stay `mongo` and `redis`. The service names are load-bearing —
`OVERLEAF_MONGO_URL: mongodb://mongo/sharelatex` resolves them — but upstream's
`container_name: mongo` would claim a very generic name on the host and collide
with the next stack that wants it.

**`stop_grace_period: 60s`** so in-flight compiles finish instead of being
killed mid-run.

## Behind your own domain

Set the public URL — this is the setting people miss:

```bash
# .env
OVERLEAF_SITE_URL=https://overleaf.example.com
```

Then uncomment `OVERLEAF_SECURE_COOKIE` in `compose.yaml`.

Caddy, which handles WebSockets automatically (Overleaf needs them for
collaborative editing and the compile log):

```caddy
overleaf.example.com {
    reverse_proxy 192.168.1.50:8020
}
```

That's the whole config — Caddy gets the certificate itself. See
[reverse proxy](../docs/reverse-proxy.md).

A [Cloudflare Tunnel](../cloudflare-tunnel/) also works and passes WebSockets,
but mind the ~100 MB upload cap if you bring in large figures or datasets.

**Order matters:** change `OVERLEAF_SITE_URL` *before* creating accounts, or the
activation links you've already sent point at the wrong host.

## Running it on OpenMediaVault

Two things differ from a plain `docker compose up`, and both cost me an evening.

**Copy `init/mongodb-init-replica-set.js` across before the first start.** OMV's
compose plugin deploys the compose file and the env file, not the rest of the
directory. If that script isn't on disk when Mongo first starts, Docker creates
it as an empty *directory* — bind mounts do that for missing paths — Mongo skips
it, and the replica set is never initialized.

The symptom points nowhere near the cause: Mongo reports **healthy** while the
app restart-loops with `500_check_db_access.sh failed with status 1`. Mongo's
healthcheck only runs `db.stats().ok`, which succeeds fine without a replica set.

If you've already started it, fix it in place — the entrypoint won't re-run once
the data directory has data:

```bash
docker exec overleaf-mongo mongosh --quiet --eval \
  'rs.initiate({_id:"overleaf",members:[{_id:0,host:"mongo:27017"}]})'
docker restart overleaf
```

**Use `docker exec`, not `docker compose`, for one-off commands.** OMV names the
env file `<stack>.env`, and Compose only auto-loads a file called `.env`. So a
manual compose command fails on the required variables even though the running
stack is perfectly configured:

```
required variable OVERLEAF_INVITE_TOKEN_SECRET is missing a value
```

The container already has the environment, so talk to it directly:

```bash
docker exec overleaf bash -c \
  'cd /overleaf/services/web && node modules/server-ce-scripts/scripts/create-user.mjs --admin --email=you@example.com'
```

If you'd rather have compose work by hand too, symlink it once — OMV keeps
passing its own `--env-file` and won't notice:

```bash
ln -s overleaf.env .env
```

## Gotchas

- **`OVERLEAF_SECURE_COOKIE` is tested with `!= null`.** Setting it to `"false"`
  turns secure cookies **on**. The only way to disable it is to leave it unset —
  and with it wrongly on over plain HTTP, login silently fails to stick.
- **Mongo 8.0 needs AVX.** Mongo 5.0+ won't start on CPUs without it, and the
  failure is an immediate exit with nothing useful logged. Check first:
  `grep -o avx2 /proc/cpuinfo | head -1`
- **`start_period` on Mongo's healthcheck is load-bearing.** Without it, slow
  checks during startup count against `retries` straight away — five of them
  (~50s) mark Mongo unhealthy, and the app's `condition: service_healthy`
  refuses to start it. Mongo then recovers on its next check, so by morning
  everything looks fine except the app, which is simply down. This bites on
  backup scripts that stop and start containers: Mongo comes back while the
  disks are still busy, `mongosh` is a Node process and answers slowly, and the
  stack loses a race nobody knew it was running. Upstream's sample has no
  `start_period` either.
- **A healthy Mongo does not mean the replica set is up.** The healthcheck runs
  `db.stats().ok`, which passes without one — so `depends_on: service_healthy`
  is satisfied and the app starts anyway, then fails its own DB check.
- **The replica-set script only runs on an empty data directory.** If Mongo has
  data but no replica set, initialize by hand:
  `docker compose exec mongo mongosh --eval 'rs.initiate({_id:"overleaf",members:[{_id:0,host:"mongo:27017"}]})'`
- **No signup page until the first user exists.** Use the `create-user.mjs`
  script above; the web UI won't offer to make one.
- **Missing LaTeX packages** — see the section below. The short version is
  `tlmgr --usermode install <pkg>`, not plain `tlmgr install`.
- **Back up `DATA_PATH`.** `data/mongo` holds every project. `data/overleaf`
  holds uploaded files and compile output.
- **Upgrading across majors** may need migrations, and Mongo itself can't jump
  several versions at once. Read the release notes rather than pulling blind.

## Installing LaTeX packages so they stay installed

The image ships a reduced TeX Live, so a document can fail on a package that
exists upstream — `booktabs` is a common first casualty. The obvious fix works
and then quietly undoes itself:

```bash
docker exec overleaf tlmgr install booktabs      # works now, gone after an upgrade
```

TeX Live lives at `/usr/local/texlive/2026/`, **inside the image**. A
`docker restart` keeps those files; recreating the container after
`docker compose pull` does not. A document that compiled last month stops
compiling and nothing tells you why.

The fix is user-mode installs plus a `TEXMFHOME` that both users agree on.
That second half matters more than it looks: **tlmgr runs as root, but the
compiles run as `www-data`**, and by default those two resolve `TEXMFHOME`
differently:

```
root      /root/texmf        <- where a plain `tlmgr --usermode install` lands
www-data  /var/www/texmf     <- where LaTeX actually looks
```

So the install succeeds, reports no error, and the package still isn't found —
and `/root` isn't even readable by `www-data`, so no amount of mounting that
path helps. This stack therefore sets:

```yaml
TEXMFHOME: /var/lib/overleaf/texmf
```

which is inside the persisted volume, so both users agree and the packages
survive image updates. Then:

```bash
docker exec overleaf tlmgr --usermode init-usertree   # once
docker exec overleaf tlmgr --usermode install booktabs
```

Verify as the user that actually compiles, not as root:

```bash
docker exec -u www-data overleaf kpsewhich booktabs.sty
#  /var/lib/overleaf/texmf/...   correct, persisted
#  /usr/local/texlive/...        inside the image, lost on update
#  nothing                       installed somewhere the compiler can't see
```

**Caveats.** User mode handles ordinary style packages cleanly. Packages that
install fonts or need map-file updates may also want `updmap-user`, and a few
that expect to modify the main tree won't work this way — install those with a
custom image instead:

```dockerfile
FROM sharelatex/sharelatex:6.2.2
RUN tlmgr install <packages>
```

That's the more reproducible option in general, since the package list ends up
in version control. The trade is rebuilding on every upstream release. If you
stay with user mode, keep a list of what you've installed — the volume survives,
but a list is what lets you rebuild from nothing.

## Health checks

The image ships its own:

```bash
docker compose exec sharelatex bash -c 'cd /overleaf/services/web && node modules/server-ce-scripts/scripts/check-mongodb.mjs'
docker compose exec sharelatex bash -c 'cd /overleaf/services/web && node modules/server-ce-scripts/scripts/check-redis.mjs'
docker compose exec mongo mongosh --quiet --eval 'rs.status().members.map(m => m.name + " " + m.stateStr)'
```

## Links

- Upstream repo: <https://github.com/overleaf/overleaf>
- Their sample compose: <https://github.com/overleaf/overleaf/blob/main/docker-compose.yml>
- The Toolkit (upstream's recommended installer): <https://github.com/overleaf/toolkit>
- Image: <https://hub.docker.com/r/sharelatex/sharelatex>
