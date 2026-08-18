# Cloudflare Tunnel

A tunnel exposes a service to the internet **without opening a port** on your
router and without a VPS. `cloudflared` makes an outbound connection to
Cloudflare, and Cloudflare routes traffic back down it.

## When to use it (and when not to)

This is the part most guides skip. A tunnel is **not** a drop-in replacement
for a reverse proxy on a VPS.

| Use a tunnel for | Use Caddy on a VPS for |
|---|---|
| Admin UIs, dashboards | Jellyfin, Plex — any video streaming |
| Gitea, small web apps | Nextcloud, Immich — large uploads |
| Anything low-bandwidth | Anything you want unmetered |

Two hard limits drive that split:

- **Upload size.** The free plan caps request bodies at roughly 100 MB. File
  sync and photo backup break on this, often silently or with a confusing
  413.
- **Terms of service.** Cloudflare's terms restrict serving large amounts of
  non-HTML content — video in particular — through the proxy. Streaming a
  media library through a tunnel is the single most common way people get
  their account flagged.

For those services, expose them through a reverse proxy you control.

## Setup

TODO: your preferred flow — dashboard-created tunnel vs. `cloudflared tunnel
create`. The dashboard route is easier to show on video; the CLI route is
easier to keep in version control.

```yaml
services:
  cloudflared:
    image: cloudflare/cloudflared:latest
    container_name: cloudflared
    restart: unless-stopped
    command: tunnel --no-autoupdate run
    environment:
      - TUNNEL_TOKEN=${CLOUDFLARE_TUNNEL_TOKEN}
```

The tunnel token is a **real secret** — it grants the ability to route
traffic into your network. It belongs in `.env`, never in a committed file.

## Routing to a service

Public hostname → service, configured per tunnel:

```
app.example.com  →  http://<host-or-container>:<port>
```

TODO: note whether you attach `cloudflared` to each service's compose network
or run one shared tunnel that reaches services by host IP. The second is
simpler to maintain; the first is better isolated.

## Auth

Cloudflare Access can sit in front of a tunnel and handle authentication
before traffic ever reaches the service — useful for apps with weak or no
built-in auth.

TODO: whether you use Access, or terminate auth at Authentik instead. Note
that running both is usually redundant.

## Related

- [Reverse proxy with Caddy](reverse-proxy.md)
- [Single sign-on with Authentik](authentik-sso.md)
