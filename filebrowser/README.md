# File Browser

Web file manager for a single directory tree — browse, preview, upload,
download, share links. Handy for reaching a downloads folder from a phone
without exposing SMB or SSH.

This is **[FileBrowser Quantum](https://github.com/gtsteffaniak/filebrowser)**,
the maintained fork. See below for why not the original.

## Quick start

```bash
cp .env.example .env
$EDITOR .env            # BROWSE_PATH is required
docker compose up -d
```

Open `http://<host>:3672` and log in as **`admin` / `admin`** — then change the
password immediately, see below.

## Ports

| Port | Proto | Purpose |
|------|-------|---------|
| 3672 | http | Web UI (container listens on 80) |

## Change the default password first

First start creates an admin account with a default password and says so:

```
[INFO ] Resetting admin user to default username and password.
```

Change it in the UI under user settings, or from the CLI. **The database is
locked while the server runs**, so the container has to be stopped first:

```bash
docker compose stop
docker compose run --rm filebrowser set -u "admin,your-new-password" -a
docker compose start
```

Running that against a live container fails with *"the database is locked,
please close all other instances"*, which is easy to misread as corruption.

## Why not `filebrowser/filebrowser`

The original project was wound down on **2026-09-01**. Its own binary announced
it on every start:

```
NOTICE: File Browser is being wound down.
NOTICE: The project is archived on 2026-09-01, after which there will be no
NOTICE: further releases and no security fixes.
```

At that point its advisory page listed around 30 published issues, including a
high-severity one where recursive copy, rename and delete ignored rules that
should have denied access to descendants. Those are now permanent.

Quantum is the actively developed fork. It keeps the same idea but has its own
configuration format — a YAML file rather than `FB_*` environment variables —
so it is not a drop-in swap of the image name.

## Why it looks like this

**The config is a committed file, not environment variables.** Quantum reads a
YAML config and exits `FATAL` if it can't find one. Without
`FILEBROWSER_CONFIG` it looks for `config.yaml` *inside the data directory*,
which means the file you must write by hand and the database it generates end
up in the same place. Pointing it at `/config/config.yaml` keeps the two
separate: [`init/config.yaml`](init/config.yaml) is version-controlled and
mounted read-only, `DATA_PATH` holds only generated state.

**`minLength: 5` in the config is deliberate.** Raise it and the first start
dies before serving anything:

```
[FATAL] store.Users.Save: password must be at least 8 characters long
```

That's the *default admin* being created — its password is shorter than the
limit you just set. Raise `minLength` only after setting a real password.

**No `PUID`/`PGID`.** The image runs as its own `filebrowser` user (uid/gid
1000) and reads neither those nor `UID`/`GID`. Ownership is set with Docker's
`user:` directive, the same as [audiobookshelf](../audiobookshelf/).

**One source, mounted at `/srv`.** `config.yaml` declares `sources: [/srv]` and
the compose file binds your directory there, so the path inside the container
never changes and the config stays generic.

## Gotchas

- **Anyone who logs in can delete anything they can see.** Mount `BROWSE_PATH`
  with `:ro` if you only want to look and download.
- **Share links bypass login by design.** That's the feature, but it means a
  leaked link is public access to that file.
- **The database is locked while the container runs** — user management needs
  it stopped.
- **Back up `DATA_PATH`.** It holds users and share links; losing it means
  recreating both.
- **A missing config file looks like a broken config file.** The error names
  `Sources` as invalid rather than saying the file is absent.
- **Tags are `1.5.3-stable`, not `v1.5.3`.** The `v` prefix 404s, and `stable`
  and `latest` are moving tags.

## Running it on OpenMediaVault

OMV's compose plugin deploys the compose file and the env file, nothing else.
Two things follow, and both cost me a round trip.

**Put `config.yaml` in `init/`, not the stack root.** The compose mounts
`./init/config.yaml`, so that exact path must exist as a *file* before the
first start. Docker creates a **directory** for a missing bind-mount source,
and filebrowser then reports a validation failure rather than a missing file:

```
could not validate config: Key: 'Settings.Server.Sources'
  Error:Field validation for 'Sources' failed on the 'required' tag
```

That message sends you looking for a mistake in your config when the config
isn't being read at all. Check the host first:

```bash
stat -c '%F %n' init/config.yaml     # must say "regular file"
```

If it says `directory`, `rmdir` it, put the real file there, and **recreate**
the container — a restart isn't enough, the mount is fixed at creation.

**Make `DATA_PATH` writable by `PUID:PGID`.** Docker creates it as root, but
the container runs as your `PUID:PGID` — which on OMV is often `1000:100`
(the `users` group), not `1000:1000`. Otherwise:

```
[FATAL] could not open database: open /data/database.db: permission denied
```

```bash
chown -R 1000:100 data
```

Also: OMV names the env file `filebrowser.env`, so manual `docker compose`
commands fail on `BROWSE_PATH` unless you pass `--env-file filebrowser.env`.
Use plain `docker exec` / `docker logs` for one-offs.

## Exposing it

- [Reverse proxy with Caddy](../docs/reverse-proxy.md) — the minimum.
- [Single sign-on with Authentik](../docs/authentik-sso.md) — worth it here.
  Forward auth means a stranger has to get past Authentik before reaching a
  login form that guards your filesystem.
- [Cloudflare Tunnel](../cloudflare-tunnel/) — mind the ~100 MB upload cap, and
  don't route large media downloads through it.

## Links

- Upstream: <https://github.com/gtsteffaniak/filebrowser>
- Image: `ghcr.io/gtsteffaniak/filebrowser`
- The wound-down original: <https://github.com/filebrowser/filebrowser/security/advisories>
