# Reverse proxy with Caddy

Every service in this repo publishes a plain HTTP port on the host. Nothing
in a service's compose file knows or cares about TLS, domains, or
authentication — that is all handled here, in one place.

This is deliberate: it means you can run any stack in this repo standalone,
and add a proxy later without touching the compose file.

## The basic pattern

Caddy gets a certificate automatically. For most services, one block is the
entire configuration:

```caddyfile
app.example.com {
    reverse_proxy <host>:<port>
}
```

Look up `<port>` in the [service table](../README.md).

TODO: note where your Caddyfile lives and whether Caddy runs on the NAS or
on the VPS.

## Services that need more

Most apps don't care what's in front of them. A few build absolute URLs or
make security decisions based on the request, and those need to be told.

**Nextcloud** is the main one — it needs all of:

- `trusted_domains` — the public hostname, or it refuses the request
- `overwrite.cli.url` — so generated links use the public URL
- `overwriteprotocol=https` — or it builds `http://` links behind TLS and
  breaks mixed content
- `TRUSTED_PROXIES` — the proxy's IP, or every client appears to come from
  the proxy and rate limiting misfires

Milder cases:

- **Gitea** — `ROOT_URL`, or clone URLs point at the wrong host
- **Authentik** — knows its own external URL by configuration
- **Jellyfin** — only if you serve it from a subpath rather than a subdomain

TODO: your `header_up` defaults, and whether you set a shared snippet for
`X-Forwarded-*`.

## Large uploads

TODO: Caddy's defaults are usually fine, but note any `request_body`
`max_size` you set for Nextcloud/Immich, plus the matching app-side limit.

## Related

- [Cloudflare Tunnel](cloudflare-tunnel.md) — when you don't want to open a port
- [Single sign-on with Authentik](authentik-sso.md)
