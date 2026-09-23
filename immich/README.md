# Immich

Self-hosted photo and video library. Phone backup that runs on your own disk,
with the parts that make Google Photos worth using — face and object search,
places, memories, shared albums — done locally by a machine-learning container.

The heaviest stack in this repo: four containers, a Postgres with vector
extensions, and a model cache. Budget a few GB of RAM and expect the first
import to work the CPU hard.

## Quick start

```bash
cp .env.example .env
$EDITOR .env            # UPLOAD_LOCATION, DB_DATA_LOCATION, DB_PASSWORD
docker compose up -d
```

Open `http://<host>:2283` and register. **The first account created is the
admin** — there is no separate bootstrap step, so do this before the port is
reachable by anyone else.

## Ports

| Port | Proto | Purpose |
|------|-------|---------|
| 2283 | http | Web UI, mobile app API, everything |

Postgres and Valkey are reachable only on the stack's internal network.

## Why it looks like this

**This file is upstream's, verbatim, and should stay that way.** Immich ships a
`docker-compose.yml` with each release, pins two of its images *by digest*, and
changes the file between versions — the mount path, the Postgres extension
build, added `shm_size`. Local edits turn every update into a three-way merge.
The repo convention of `${VAR:-default}` is deliberately **not** applied here for
the same reason: keeping it byte-identical to upstream means you can re-fetch and
`diff` to see exactly what a release changed.

```bash
curl -fLo /tmp/immich-new.yml \
  https://github.com/immich-app/immich/releases/latest/download/docker-compose.yml
diff -u compose.yaml /tmp/immich-new.yml
```

Pinned at **v3.2.2** (released 2026-09-15).

**Four containers.** `immich-server` is the API and web UI. `immich-machine-learning`
runs the CLIP and face-detection models — it is separate because it is the part
you might want on a GPU, and because its model cache is a named volume rather
than something you back up. `database` is Postgres with **VectorChord**, which
is what makes similarity search possible; a stock Postgres image will not work.
`redis` is Valkey, the Redis fork, used as the job queue.

**`env_file: .env` is a hard dependency.** Unlike every other stack here, where
`.env` is optional because the compose file carries defaults, Compose will refuse
to start this one if the file does not exist.

**Images are digest-pinned** for Valkey and Postgres
(`@sha256:…`), so those two are byte-identical to what upstream tested against
this release. The Immich images themselves float on `${IMMICH_VERSION:-release}`
— which is why pinning `IMMICH_VERSION` in `.env` matters.

## Gotchas

- **Pin `IMMICH_VERSION` to a major.** Unset, it resolves to `release`, so a
  routine `docker compose pull` can carry you across a major version while your
  compose file stays behind. Upstream's own `example.env` now sets
  `IMMICH_VERSION=v3` for exactly this reason.
- **The container media path changed, and it is easy to miss.** Older compose
  files mount `${UPLOAD_LOCATION}:/usr/src/app/upload`; since **v1.140.0** it is
  `${UPLOAD_LOCATION}:/data`, because `IMMICH_MEDIA_LOCATION` now defaults to
  `/data`. Run a new image against an old compose file and the server looks for
  your library at an unmounted path — it appears empty, and anything written
  goes into the container and is lost when it is recreated. If you are adopting
  this file over an older one, that mount line is the one to check first.
- **`DB_DATA_LOCATION` must be local storage.** Not NFS, not SMB, not a
  network share of any kind. Postgres on a network filesystem corrupts, and
  upstream says so in the example env.
- **Upgrading Postgres extensions is a real migration.** The image here is
  `14-vectorchord0.4.3-pgvectors0.2.0`; moving from an older VectorChord build
  makes Immich alter the database on first boot, which "can take seconds to
  minutes". Back up `DB_DATA_LOCATION` before any version jump, and read
  [the upgrade notes](https://docs.immich.app/install/upgrading/).
- **`shm_size: 128mb` on the database is load-bearing**, not decoration.
  Postgres uses shared memory for larger queries and Docker's 64 MB default is
  not enough here. Upstream's upgrade guide lists adding it as a required step.
- **`DB_STORAGE_TYPE: 'HDD'` is commented out** in the database environment.
  Uncomment it if the Postgres data directory sits on a spinning disk — it tunes
  the planner's assumptions about random reads. Leave it alone on SSD or NVMe.
- **Back up `UPLOAD_LOCATION` and `DB_DATA_LOCATION` together.** The files are
  the photos; the database holds every album, face cluster, share and edit.
  Either alone is most of a disaster.
- **The first import is expensive.** Machine learning runs over the whole
  library once. On a low-power box expect it to saturate the CPU for hours —
  the same caveat as [copyparty](../copyparty/README.md) on an N100, and worth
  scheduling rather than discovering.

## Exposing it

The mobile apps talk to the same port as the browser, so whatever you put in
front has to work for both.

- [Reverse proxy with Caddy](../docs/reverse-proxy.md) — the normal route.
  Raise the upload body limit or large videos fail on the way in.
- [Cloudflare Tunnel](../cloudflare-tunnel/) — **the ~100 MB body cap is exactly
  the wrong limit for this.** A phone's 4K video will exceed it. Read
  [the limits](../docs/cloudflare-tunnel.md) first.
- [Single sign-on with Authentik](../docs/authentik-sso.md) — Immich speaks OIDC
  natively, so use that rather than forward auth, which would break every mobile
  client. Keep a local admin account until the flow is proven.

## Links

- Install guide: <https://docs.immich.app/install/docker-compose>
- Release compose file: <https://github.com/immich-app/immich/releases/latest/download/docker-compose.yml>
- Environment variables: <https://docs.immich.app/install/environment-variables>
- Upgrading: <https://docs.immich.app/install/upgrading/>
- Hardware-accelerated ML: <https://docs.immich.app/features/ml-hardware-acceleration>
- Compose builder: <https://immich.app/docker-compose-builder>
