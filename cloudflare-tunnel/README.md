# Cloudflare Tunnel

The `cloudflared` connector. It dials **out** to Cloudflare and Cloudflare
routes public traffic back down that connection — so a service reaches the
internet with no port forwarded, no static IP and no VPS.

One tunnel serves every service; you don't need a copy of this per app.

## Quick start

```bash
cp .env.example .env
$EDITOR .env            # paste TUNNEL_TOKEN
docker compose up -d
```

Get the token at **Dashboard → Zero Trust → Networks → Tunnels →** *(your
tunnel)* **→ Configure**. The page shows a pre-filled `docker run … --token
<TOKEN>` command — copy only the token part.

Docs: <https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/>

Then add routes in the same dashboard: **Public Hostname → Service**, e.g.
`gitea.example.com → http://host.docker.internal:3000`.

## Ports

**None.** Nothing listens on the host — that's the entire point. If you find
yourself adding a `ports:` block here, something has been misunderstood.

## Why it looks like this

**The token lives in `.env`, and compose refuses to start without it.** It's
written `${TUNNEL_TOKEN:?…}` rather than with a default, because a
blank token gives you a container that starts, retries, and quietly routes
nothing. The token is a genuine credential — it authorises routing traffic
into your network — so it never belongs in a committed file.

**No `PUID`/`PGID`.** Unlike most services here, this isn't a LinuxServer
image and doesn't understand those variables. It writes nothing to disk and
needs no volumes, so there's no ownership to get right. `TZ` is kept only
because it affects log timestamps.

**`extra_hosts: host.docker.internal:host-gateway`.** Routes are configured in
the dashboard, and the connector has to resolve whatever hostname you put
there. This line lets you point at services published on the Docker host
without hardcoding the LAN IP — which would otherwise break the day your
router hands out a different lease.

**`--no-autoupdate`.** The binary can update itself in place, which means the
thing routing your traffic changes without you doing anything. Pinning that
off makes updates a deliberate `docker compose pull`.

**No config file, no volume.** This is the remotely-managed style of tunnel:
routing lives in the Cloudflare dashboard, not on disk. The trade is that your
routing config isn't in this repo — the alternative (`cloudflared tunnel
create` plus a mounted `config.yml`) is version-controllable but more setup.

## Gotchas

- **Don't put video through it.** Cloudflare's terms restrict serving large
  non-HTML content, and streaming a media library is the classic way to get an
  account flagged. Jellyfin belongs behind your own reverse proxy.
- **~100 MB upload cap** on the free plan. Photo backup and file sync break on
  this, sometimes with nothing clearer than a `413`.
- **The token can't be rotated.** If it leaks, delete the tunnel and create a
  new one.
- **A dead tunnel looks like a DNS problem.** If a hostname stops resolving,
  check `docker compose logs cloudflared` before suspecting Cloudflare.

## Related

- [When to use a tunnel, and when not to](../docs/cloudflare-tunnel.md) — the
  longer write-up, including the comparison against a VPS reverse proxy.
- [Reverse proxy with Caddy](../docs/reverse-proxy.md)
- [Single sign-on with Authentik](../docs/authentik-sso.md) — note Cloudflare
  Access can also sit in front of a tunnel; running both is usually redundant.

## Links

- Connector docs: <https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/>
- Image: <https://hub.docker.com/r/cloudflare/cloudflared>
