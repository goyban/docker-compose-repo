# Audiobookshelf

Audiobook and podcast server. Tracks progress per user across devices, which is
the thing a plain file share can't do — pick up on your phone where the car
left off.

## Quick start

```bash
cp .env.example .env
$EDITOR .env            # MEDIA_PATH is required
docker compose up -d
```

Open `http://<host>:13378` and create the admin account. Point the Audiobooks
library at `/audiobooks` and Podcasts at `/podcasts` — those are the paths
*inside* the container.

## Ports

| Port | Proto | Purpose |
|------|-------|---------|
| 13378 | http | Web UI and API (container listens on 80) |

## Why it looks like this

**The official image, not LinuxServer.** Audiobookshelf ships its own and it's
the one upstream actually tests. That's a different call from jellyfin, where I
stay on LinuxServer out of long habit — here there's no reason to add a layer.

**`user:` instead of `PUID`/`PGID`.** This is the part worth knowing, because
copying the pattern from the other services in this repo produces something
that *looks* right and silently isn't. The image's config:

```
User      : ''            <- empty, so root
Entrypoint: ['tini', '--']
Cmd       : ['node', 'index.js']
```

There's no s6 layer and no init script — `tini` execs straight into Node. A
`PUID` environment variable is accepted and then read by nobody. Everything
gets written as root, and you find out when you try to move your library from
the host and can't.

Docker's own `user:` directive is the mechanism that actually works here, so
`PUID`/`PGID` in `.env` feed that instead. Same names as the rest of the repo,
different plumbing underneath.

**`/config` and `/metadata` are separate mounts** because they grow very
differently. `/config` is the SQLite database and settings — small, and the
thing to back up. `/metadata` is cover art, cached data and downloads, and
tracks the size of your library. Splitting them means a backup job can take the
first and skip the second.

**Two media mounts, not one.** Audiobookshelf wants each library rooted
separately, so `${MEDIA_PATH}` points at the parent and the compose file mounts
`Audiobooks/` and `Podcasts/` beneath it. Only `MEDIA_PATH` goes in `.env`.

## Gotchas

- **`PORT` is a container variable here.** The image reads `PORT` to decide
  what it listens on internally. It's used in `compose.yaml` for the *host*
  side of `13378:80` only — if you ever add it to the `environment:` block,
  the container moves off port 80 and the mapping breaks with nothing in the
  logs to explain it.
- **Switching to `user:` on an existing install needs a chown.** If you ran
  this as root first, the files it created are root-owned and the container
  now can't write them. `sudo chown -R 1000:1000 config metadata` once.
- **Back up `/config`.** It holds the database — accounts, libraries, and
  everyone's listening progress. `/metadata` regenerates; `/config` doesn't.
- **Media can be mounted `:ro`** unless you turn on storing metadata alongside
  the media files, which is off by default. Worth doing if you want the library
  protected from the server.

## Exposing it

Publishes a plain HTTP port; nothing here is proxy-aware.

- [Reverse proxy with Caddy](../docs/reverse-proxy.md)
- [Cloudflare Tunnel](../cloudflare-tunnel/) — audio is far lighter than video,
  but it's still media served through the proxy; read
  [the limits](../docs/cloudflare-tunnel.md) before pointing a tunnel at it.
- [Single sign-on with Authentik](../docs/authentik-sso.md) — Audiobookshelf
  speaks OIDC natively, so use that rather than forward auth: the mobile apps
  can't render a forward-auth login page. See the section below.

## Single sign-on with Authentik

Worth doing here, because Audiobookshelf is one of the apps that speaks OIDC
itself — real accounts, real logout, and the mobile apps keep working. Forward
auth would break them.

**It needs a reverse proxy first.** The whole flow is built from absolute HTTPS
URLs, so there has to be a real hostname in front:

```caddy
audiobookshelf.example.com {
    reverse_proxy <ip>:13378
}
```

Then follow
[Authentik's Audiobookshelf guide](https://integrations.goauthentik.io/media/audiobookshelf/):
create an OAuth2/OpenID Connect provider, note the application **slug**, and
put the issuer URL, client ID and client secret into
**Settings → Authentication** on the Audiobookshelf side. **Auto-populate**
fills in the OIDC endpoints for you.

### The redirect URIs are where this goes wrong

[Step 2 of the guide](https://integrations.goauthentik.io/media/audiobookshelf/#create-an-application-and-provider)
gives these three:

```
Strict  Authorization  https://audiobookshelf.company/auth/openid/callback
Strict  Authorization  https://audiobookshelf.company/auth/openid/mobile-redirect
Strict  Post Logout    https://audiobookshelf.company/login
```

Those did not work for me. Mine needed an extra `/audiobookshelf` path segment:

```
https://audiobookshelf.company.com/audiobookshelf/auth/openid/callback
https://audiobookshelf.company.com/audiobookshelf/auth/openid/mobile-redirect
```

**Don't guess at this — Audiobookshelf tells you the answer.** Its
**Settings → Authentication** page has a subfolder section that prints the exact
URIs to authorize:

> Authorize these URLs in your OAuth provider to allow redirection back to the
> web app after login:
>
> `https://<your.server.com>/audiobookshelf/auth/openid/callback`
> `https://<your.server.com>/audiobookshelf/auth/openid/mobile-redirect`

Copy those into Authentik verbatim. A mismatch surfaces as a generic error that
doesn't name the URI, which is why this is worth ten seconds of checking rather
than an evening of guessing.

### Mobile apps need their own redirect URIs

The phone clients don't come back over HTTPS — they hand off to a custom URL
scheme. These go in **Allowed Mobile Redirect URIs**:

```
audiobookshelf://oauth
https://authentik.company.com/auth/openid/mobile-redirect

plappa://oauth        # Plappa, iOS
prologue://oauth      # Prologue, iOS
```

One per app: a client you haven't listed fails at the last step of a login that
otherwise looked fine. Add the scheme for each third-party app you actually use.

## Links

- Upstream docs: <https://www.audiobookshelf.org/docs>
- Image: <https://github.com/advplyr/audiobookshelf/pkgs/container/audiobookshelf>
