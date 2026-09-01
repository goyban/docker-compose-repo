# Single sign-on with Authentik

One login for everything self-hosted here, and one place to revoke it. The
services themselves stay unaware — nothing in any `compose.yaml` in this repo
mentions Authentik.

## Two ways to protect a service

1. **Native OIDC** — the app speaks OIDC itself (Gitea, Nextcloud,
   Audiobookshelf, Immich). Better experience: real accounts, real logout,
   group mapping.
2. **Forward auth** — the proxy asks Authentik before passing the request
   through. Works for anything, including apps with no auth at all, but the
   app has no idea who the user is.

Prefer native OIDC where the app supports it; use forward auth as the
fallback.

## Native OIDC — the shape

Use this wherever the app supports it. You get real accounts, real logout, and
clients that aren't browsers keep working.

### In Authentik

**Applications → Create**, provider type **OAuth2/OpenID Connect**. Three things
to note as you go:

- the application **slug** — it appears in half the URLs below
- the **client ID** and **client secret**
- pick a **signing key**, or the app can't validate the token it gets back

Then add the **redirect URIs**, which is where this usually goes wrong — see the
gotchas.

### The four values every app asks for

| Value | Where it comes from |
|-------|--------------------|
| Issuer / discovery URL | `https://authentik.example.com/application/o/<slug>/` |
| Client ID | Authentik, on the provider |
| Client secret | Authentik → the service's `.env`, never committed |
| Redirect URI | The app tells you — don't guess |

Most apps take the issuer URL and discover the rest themselves; Audiobookshelf
calls this **Auto-populate**. When one wants the endpoints spelled out
individually:

| Endpoint | Path |
|----------|------|
| OpenID configuration | `/application/o/<slug>/.well-known/openid-configuration` |
| Authorization | `/application/o/authorize/` |
| Token | `/application/o/token/` |
| User info | `/application/o/userinfo/` |
| End session | `/application/o/<slug>/end-session/` |
| JWKS | `/application/o/<slug>/jwks/` |

Note which paths carry the slug and which don't: authorize, token and userinfo
are shared across every application, while discovery, JWKS and logout are
per-application. Putting the slug where it doesn't belong gives a 404 that looks
like the provider is broken.

Worked examples in this repo:
[audiobookshelf](../audiobookshelf/README.md#single-sign-on-with-authentik) and
[jellyfin](../jellyfin/README.md#single-sign-on-with-authentik).

## Forward auth — putting an app with no SSO behind Authentik

This is the fallback, and it's what most self-hosted apps need. The app itself
learns nothing and changes nothing: **Caddy asks Authentik whether to allow the
request before it ever reaches the container.** An app with no accounts at all,
or one with its own login you can't replace, ends up behind a real SSO login
page either way.

### In Authentik

1. **Providers → Create → Proxy Provider**, mode **Forward auth (single
   application)**. The external host is the public URL — `https://firefly.domain.com`.
2. **Applications → Create**, and bind it to that provider.
3. **Outposts** — add the application to an outpost. The built-in *embedded
   outpost* is the one already listening on port **9000**, which is what the
   Caddyfile below points at.

Step 3 is the one that gets forgotten. Provider and application exist, the
Caddyfile is right, and every request still fails because the outpost was never
told the application is its responsibility.

### In Caddy

```caddyfile
firefly.domain.com {
    # directive execution order is only as stated if enclosed with route.
    route {
        # always forward outpost path to actual outpost
        reverse_proxy /outpost.goauthentik.io/* http://127.0.0.1:9000

        # forward authentication to outpost
        forward_auth http://127.0.0.1:9000 {
            uri /outpost.goauthentik.io/auth/caddy

            # capitalization of the headers is important, otherwise they will be empty
            copy_headers X-Authentik-Username X-Authentik-Groups X-Authentik-Entitlements X-Authentik-Email X-Authentik-Name X-Authentik-Uid X-Authentik-Jwt X-Authentik-Meta-Jwks X-Authentik-Meta-Outpost X-Authentik-Meta-Provider X-Authentik-Meta-App X-Authentik-Meta-Version

            # optional, in this config trust all private ranges, should probably be set to the outposts IP
            trusted_proxies private_ranges
        }

        # actual site configuration below, for example
        reverse_proxy 10.10.0.2:8564
    }
}
```

Only the last line changes per service: swap the address and port, and the
hostname at the top. Everything between is identical for every app.

### Why each piece is there

**`route { }` is not optional.** Caddy normally executes directives in its own
fixed order, not the order you wrote them. Without `route`, the final
`reverse_proxy` can run before `forward_auth`, and the app is served to
unauthenticated visitors. The config *looks* correct and protects nothing —
which is the worst possible failure mode for this feature, so wrap it and check
in a private window.

**The `/outpost.goauthentik.io/*` line comes first** because the login flow
itself lives on that path. If it fell through to the app, the browser would be
sent to a URL the app doesn't serve and the redirect loop would never resolve.

**`copy_headers` capitalization is load-bearing** — get it wrong and the headers
arrive empty rather than missing, so an app that reads them sees a blank
username instead of an error.

**`127.0.0.1:9000` assumes Caddy and Authentik are on the same host.** If Caddy
runs on a VPS and Authentik on the NAS, this is the line to change — and
`trusted_proxies private_ranges` should then name the outpost's actual address
rather than trusting every private range.

### What you give up

- **The app doesn't know who you are.** It sees an authenticated-by-someone
  request. Apps with their own accounts still show their own login, so you get
  **two logins** — Authentik, then the app. Some apps can read the
  `X-Authentik-*` headers and skip theirs; most can't.
- **Non-browser clients break.** Mobile apps, API clients and anything doing
  `curl` can't complete an interactive login flow. This is why Jellyfin and
  Audiobookshelf use native OIDC instead — see
  [jellyfin](../jellyfin/README.md) and
  [audiobookshelf](../audiobookshelf/README.md). If a service has an API you
  actually call, forward auth in front of it will stop that too.
- **It is all-or-nothing per hostname.** Every path behind that block requires
  login, including webhooks and health checks.

### Where I use it

- **[Firefly III](../firefly/README.md)** — the config above is verbatim what
  runs in front of it. Firefly keeps its own login underneath, so it's two
  logins, and for bank data that's a trade worth making.
- **[copyparty](../copyparty/README.md)** and other apps with their own account
  system, where the second login is the price of not exposing the app's login
  form to the internet.

Prefer native OIDC wherever the app supports it. Reach for this when it doesn't.

## Groups and roles

The mechanism is the same everywhere: Authentik puts your group membership in
the token, and the app decides what that means.

**You usually don't need a custom mapping.** The standard `profile` scope
already includes group membership, so most apps see your groups with nothing
configured. Reach for a custom **scope mapping** (Customization → Property
Mappings) only when an app wants the claim under a different name or in a
different shape.

**Each app consumes it differently**, and that's the part to check per service —
Audiobookshelf has group and permission claim fields under its OpenID settings;
the Jellyfin SSO-Auth plugin has its own role and admin filters. There is no
single setting that makes "the admins group" mean administrator everywhere.

**The split worth setting up:** one group for ordinary access, one for admin,
and grant the app's admin role only to the second. The reason is the failure
mode below — if everyone who can log in is an admin, an SSO misconfiguration
isn't just an outage, it's an escalation.

TODO: the actual group names and per-app role mapping used here, once the same
shape has survived a few services.

## Gotchas

- **Keep a local fallback admin until the flow is proven.** If the only account
  that can administer an app is behind SSO and SSO breaks, you have locked
  yourself out of the thing you need in order to fix it. Prove the login works,
  in a private window, *before* removing the local account.
- **Redirect URI mismatches surface as a generic error** that never names the
  URI. Read the exact URIs off the application's own settings page rather than
  copying them from a guide — Audiobookshelf prints them, and
  [its README](../audiobookshelf/README.md#the-redirect-uris-are-where-this-goes-wrong)
  documents a case where the published guide was wrong for that install.
- **Behind TLS, apps build `http://` redirect URLs.** The proxy terminates TLS,
  the app sees a plain HTTP request, and the callback it generates is insecure —
  so the login fails halfway through. Every app has its own name for the fix;
  Jellyfin's SSO-Auth plugin calls it
  [Scheme Override](../jellyfin/README.md#the-setting-that-cost-me-the-time).
  Firefly's `TRUSTED_PROXIES=**` is the same class of setting.
- **`email_verified` is `False` by default.** Some apps refuse to authenticate a
  user whose email isn't marked verified, and the resulting error rarely says
  so. Fix it in the scope mapping.
- **Forward auth breaks everything that isn't a browser.** Mobile apps and API
  clients can't complete an interactive login. Check what talks to a service
  before putting it behind forward auth — this is the single biggest reason to
  prefer native OIDC.
- **Adding the application to an outpost is a separate step** from creating the
  provider and the application, and forgetting it fails in a way that looks like
  a Caddy problem.
- **The client secret belongs in the service's `.env`**, which is git-ignored.
  Never in `compose.yaml`, which is committed.

## Related

- [Reverse proxy with Caddy](reverse-proxy.md)
- [Cloudflare Tunnel](cloudflare-tunnel.md)
