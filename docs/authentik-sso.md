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

## Forward auth — the shape

TODO: the Caddy snippet, and which services you apply it to.

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
