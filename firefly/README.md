# Firefly III

Personal finance manager: accounts, budgets, bills and recurring transactions,
with a double-entry ledger underneath. Self-hosted, so your bank data stays on
your disk instead of in someone's analytics pipeline.

Two web UIs come with this stack — Firefly itself, and a separate **Data
Importer** that pulls transactions in from CSV files, Nordigen/GoCardless or
Spectre.

## Quick start

Firefly needs **three** env files, not one. Only `.env` has an example in this
repo — the other two are three lines each and are printed below.

```bash
# 1. Firefly's own configuration. Start from upstream's full file:
wget https://raw.githubusercontent.com/firefly-iii/firefly-iii/main/.env.example -O .env
$EDITOR .env            # see .env.example here for what to change

# 2. Generate the two secrets. Both must be EXACTLY 32 characters:
openssl rand -base64 24 | cut -c1-32   # -> APP_KEY
openssl rand -base64 24 | cut -c1-32   # -> STATIC_CRON_TOKEN

# 3. The database credentials:
cat > .db.env <<'EOF'
MYSQL_RANDOM_ROOT_PASSWORD=yes
MYSQL_USER=firefly
MYSQL_PASSWORD=change_me
MYSQL_DATABASE=firefly
EOF

# 4. The importer (delete the service from compose.yaml if you don't want it):
cat > .importer.env <<'EOF'
FIREFLY_III_URL=http://app:8080
VANITY_URL=http://localhost:8564
TRUSTED_PROXIES=**
EOF

# 5. Wire up the cron token — see "The cron job" below. This step is manual.

docker compose up -d
```

`MYSQL_PASSWORD` in `.db.env` and `DB_PASSWORD` in `.env` are the same password
written twice. They must match.

Open `http://<host>:8564`, register, and the first account created becomes the
admin. There's no separate admin bootstrap step.

## Ports

| Port | Proto | Purpose |
|------|-------|---------|
| 8564 | http | Firefly III web UI and API (container listens on 8080) |
| 8566 | http | Data Importer web UI (container listens on 8080) |

MariaDB is reachable only on the internal `firefly_iii` network.

## The cron job

**This is the part everyone skips, and the failure is silent.** Firefly does not
schedule anything itself — the `app` container serves HTTP and nothing else.
Recurring transactions, auto-budgets and periodic housekeeping only happen when
something calls the cron endpoint:

```
GET http://app:8080/api/v1/cron/<STATIC_CRON_TOKEN>
```

That is what the fourth container is for. It's a bare `alpine` running `crond`
with one entry, hitting that URL at 03:00 daily.

Skip this and nothing announces itself. The app works, the UI is responsive, and
your recurring transactions simply never appear. You notice weeks later when a
month is missing its rent entry.

### Activating it

The token is a bearer credential in a URL path, and it must be **exactly 32
characters**. Anything else is rejected.

In the compose file here, the cron service has **no `env_file:`**, so the token
is not an environment variable it can read — it's baked into the crontab line as
the literal string `REPLACEME`:

```yaml
command: sh -c "echo \"0 3 * * * wget -qO- http://app:8080/api/v1/cron/REPLACEME\" | crontab - && crond -f -L /dev/stdout"
```

So activation is two edits that must agree:

1. Set `STATIC_CRON_TOKEN=<your 32 chars>` in `.env` (the **app** validates
   against this).
2. Replace `REPLACEME` in `compose.yaml` with **the same 32 characters** (the
   **cron container** sends this).

Get them out of sync and the request 404s every night, forever, with no sign in
the Firefly UI.

### Upstream's newer version is better — consider switching

Current upstream avoids the hardcoded token entirely by giving the cron
container the same `.env` and letting the shell expand it (`$$` escapes the `$`
so Compose passes it through rather than interpolating it):

```yaml
  cron:
    image: alpine
    restart: always
    container_name: firefly_iii_cron
    env_file: .env
    command: ["sh", "-c", "apk add tzdata && \
      (ln -s /usr/share/zoneinfo/$$TZ /etc/localtime || true) && \
      echo \"0 3 * * * wget -qO- http://app:8080/api/v1/cron/$$STATIC_CRON_TOKEN;echo\" \
      | crontab - && \
      crond -f -L /dev/stdout"]
    networks:
      - firefly_iii
    depends_on:
      - app
```

Two real improvements: the token lives in exactly one place, and `apk add
tzdata` plus the `localtime` symlink make "03:00" mean 03:00 **your** time. The
version in this repo has no tzdata, so its 03:00 is 03:00 UTC — which for me is
an hour that shifts twice a year.

### Checking it actually works

Don't wait until 03:00 to find out. Call the endpoint by hand:

```bash
# from the host, through the published port
curl "http://localhost:8564/api/v1/cron/<your-token>"

# or from inside the cron container, which proves DNS and the network too
docker exec firefly_iii_cron wget -qO- "http://app:8080/api/v1/cron/<your-token>"
```

A correct token returns JSON describing what ran. A wrong one returns a 404 —
that 404 is the whole failure mode, so seeing it here is the point of the test.

The cron container logs to stdout (`crond -f -L /dev/stdout`), so after a
scheduled run:

```bash
docker logs firefly_iii_cron
```

There's also `docker exec firefly_iii_core php artisan firefly-iii:cron` if you'd
rather drive it from the app side and skip the token entirely.

## Why it looks like this

**Four containers, and each one earns its place.** `app` is PHP serving HTTP.
`db` is MariaDB — Firefly is a double-entry ledger and wants a real relational
database, not SQLite. `cron` exists because `app` has no scheduler (see above).
`importer` is genuinely optional: it's a separate application with its own
release cycle that talks to Firefly over the API like any other client. Delete
the service if you only ever enter transactions by hand.

**The importer must be pointed at `http://app:8080`.** Not `localhost`, not the
public URL. The compose file carries upstream's warning at the top: other URLs
give `500 | Server Error`. It's container-to-container traffic on the compose
network, so it uses the service name and the *internal* port.

**`VANITY_URL` is the other half of that.** The importer talks to `app:8080`,
but the links it renders in your browser have to be clickable from outside — so
that variable holds the public URL. Two URLs for one service, one for machines
and one for humans.

**This stack still follows upstream's layout, not this repo's conventions.**
Worth stating plainly rather than pretending otherwise, because the differences
are visible:

- Data goes to `./firefly_iii_upload` and `./firefly_iii_db` beside the compose
  file, instead of `${DATA_PATH}`.
- `restart: always` rather than `unless-stopped` — so a deliberate stop does not
  survive a reboot.
- `.env` is the *application's* config file, so the usual "`.env` holds a few
  Compose variables" pattern doesn't apply here at all.

Adapting it is a fine idea; just do it deliberately.

## Gotchas

- **`APP_KEY` and `STATIC_CRON_TOKEN` must be exactly 32 characters.** Not a
  minimum — exactly. `openssl rand -base64 24 | cut -c1-32` gives you one.
  A wrong-length `APP_KEY` fails at boot; a wrong-length cron token fails
  silently at 03:00.
- **The top-level `volumes:` block is dead code.** It declares
  `firefly_iii_upload` and `firefly_iii_db`, but both services use *relative
  bind mounts* (`./firefly_iii_upload`) instead. The named volumes are created
  and never written to. Harmless, but if you go looking for your database in
  `docker volume ls` you'll find an empty volume and conclude the wrong thing —
  the data is in the directory next to `compose.yaml`.
- **MariaDB creates its bind directory as root.** Expect `./firefly_iii_db` to
  be root-owned; that's normal and it needs to stay that way.
- **`DB_PASSWORD` (`.env`) and `MYSQL_PASSWORD` (`.db.env`) are the same secret
  in two files.** Changing one and not the other gives you an app that starts
  cleanly and then errors on every page.
- **Changing `MYSQL_PASSWORD` after the first start does nothing.** The database
  is initialized once, from the empty data directory. After that the credentials
  live in MariaDB, and the env var is ignored — change it in the database, or
  wipe `./firefly_iii_db` and start over.
- **`:latest` on both images.** Firefly does schema migrations between releases;
  an unattended pull across a major is not how you want to meet them. Pin a tag
  once you're settled.
- **Back up `./firefly_iii_db`.** That's the ledger. `firefly_iii_upload` holds
  attachments and matters less, but isn't regenerable either.
- **The importer holds a Personal Access Token, not a password.** Upstream is
  emphatic that the "command line token" is the wrong one. You can use a client
  ID instead and leave the token empty.

## Exposing it

Publishes plain HTTP; set `APP_URL` and `TRUSTED_PROXIES=**` and it behaves
behind a proxy.

- [Reverse proxy with Caddy](../docs/reverse-proxy.md) — the default choice.
- [Cloudflare Tunnel](../cloudflare-tunnel/) — fine for this one. It's a text
  app; nothing here bumps the ~100 MB body cap unless you attach large files.
- [Single sign-on with Authentik](../docs/authentik-sso.md) — **think first.**
  This is your bank data, and Firefly's own login is the only thing in front of
  it today. Keep a working local admin until any SSO flow is proven.

## Links

- Upstream docs: <https://docs.firefly-iii.org/>
- Docker install guide: <https://docs.firefly-iii.org/how-to/firefly-iii/installation/docker/>
- Their sample compose: <https://github.com/firefly-iii/docker/blob/main/docker-compose.yml>
- Full `.env.example`: <https://github.com/firefly-iii/firefly-iii/blob/main/.env.example>
- Data Importer: <https://docs.firefly-iii.org/how-to/data-importer/>
- Images: <https://hub.docker.com/r/fireflyiii/core> · <https://hub.docker.com/r/fireflyiii/data-importer>
