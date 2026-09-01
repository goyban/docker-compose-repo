# Single sign-on with Authentik

TODO: fill in as you go. Outline below so the shape is decided in advance.

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

TODO: provider + application setup in Authentik, then the four values every
app asks for:

- Issuer / discovery URL
- Client ID
- Client secret → `.env`, never committed
- Redirect URI

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

TODO: how you map Authentik groups to per-app roles, and the admin/user
split.

## Gotchas

TODO: collect these as you hit them. Known ones worth writing down:

- Locking yourself out of an app whose only admin is now behind SSO — keep a
  local fallback admin until the flow is proven.
- Redirect URI mismatches, which usually surface as a generic error.

## Related

- [Reverse proxy with Caddy](reverse-proxy.md)
- [Cloudflare Tunnel](cloudflare-tunnel.md)
