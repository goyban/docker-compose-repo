# gluetun + qBittorrent + pyload-ng

A VPN container with two download clients living inside its network stack. The
point is the **kill switch**: qBittorrent and pyload-ng have no network of their
own, so if the tunnel drops they lose connectivity entirely rather than falling
back to your real address.

Also exposes gluetun's HTTP and SOCKS5 proxies, so other machines and browser
extensions (SwitchyOmega and friends) can route through the same tunnel without
running a VPN client themselves.

Configured for **TorGuard WireGuard** via gluetun's `custom` provider.

## Quick start

```bash
cp .env.example .env
$EDITOR .env                  # TEMPDISK is the one you must set

# Get a WireGuard config from TorGuard's config generator, save it as
# wg0.conf NEXT TO THIS FILE. It is git-ignored. Do not put it in init/.
cp ~/Downloads/torguard-wg.conf ./wg0.conf

docker compose up -d
docker compose logs -f gluetun     # watch for the public IP line
```

Verify the tunnel is actually carrying traffic before you seed anything:

```bash
docker compose exec gluetun wget -qO- https://ipinfo.io/ip   # should be TorGuard's
curl -x http://localhost:9998 https://ipinfo.io/ip           # same, via the HTTP proxy
```

## Ports

Every port is published on the **gluetun** service, because the other two
containers have no network namespace of their own.

| Host | Container | Purpose |
|------|-----------|---------|
| 9880 | 9880 | qBittorrent web UI |
| 8880 | 8000 | pyload-ng web UI |
| 9980 | 1080 | SOCKS5 proxy |
| 9998 | 8888 | HTTP proxy |

In `compose.personal.yaml` two of these differ: pyload is published `8880:8880`
against a container that listens on 8000, and the SOCKS5 server isn't running at
all. See the gotchas.

## Two compose files

**[`compose.yaml`](compose.yaml)** is the maintained one and what
`docker compose up` uses.

**[`compose.personal.yaml`](compose.personal.yaml)** is the older variant still
running on my own box. It works and its HTTP proxy is in daily use, so it's kept
as-is rather than tidied — but it has the quirks listed under gotchas below.
Compose won't load it unless you name it:

```bash
docker compose -f compose.personal.yaml up -d
```

What the maintained file changes:

| Change | Why |
|--------|-----|
| `SOCKS5_ENABLED` / `SOCKS5_LISTENING_ADDRESS` | `SOCKSPROXY*` are not gluetun variables; the SOCKS5 server never starts |
| `HTTPPROXY_LISTENING_ADDRESS` | `HTTPPROXY_PORT` works but logs a deprecation warning |
| `8880:8000` | pyload-ng listens on 8000; its port isn't settable by env var |
| `HTTPPROXY_USER` / `SOCKS5_USER` + passwords | opt-in proxy authentication, off unless set in `.env` |
| `qmcgaw/gluetun:v3.41.3` | pinned; this container holds the tunnel |
| `${PUID:-1000}`, `${TEMPDISK:?…}` | defaults where sensible, loud failure where a value can't be guessed |
| `condition: service_healthy` | gluetun ships a healthcheck; wait for the tunnel instead of racing it |
| `lscr.io/linuxserver/qbittorrent` | matches pyload-ng's registry; same image |

Same design, same ports, same volumes.

## Other VPN providers

Nothing here is TorGuard-specific except `wg0.conf`. gluetun natively supports
around twenty providers, and for most of them you delete the file mount and set
two or three variables instead:

```yaml
      - VPN_SERVICE_PROVIDER=mullvad
      - VPN_TYPE=wireguard
      - WIREGUARD_PRIVATE_KEY=${WIREGUARD_PRIVATE_KEY}
      - WIREGUARD_ADDRESSES=${WIREGUARD_ADDRESSES}
      - SERVER_CITIES=Amsterdam
```

**Native WireGuard** — the easy path: AirVPN, FastestVPN, IVPN, Mullvad,
NordVPN, ProtonVPN, Surfshark, Windscribe.

**Native OpenVPN** — every supported provider, usually just `OPENVPN_USER` and
`OPENVPN_PASSWORD`: the list above plus Cyberghost, ExpressVPN, Giganews,
HideMyAss, IPVanish, Privado, Private Internet Access, PrivateVPN, PureVPN,
SlickVPN, TorGuard, VPNSecure, VPN Unlimited, VyprVPN.

**WireGuard via the custom provider** — Cyberghost, Private Internet Access,
PrivateVPN, PureVPN, TorGuard, VPN Unlimited and VyprVPN have no native
WireGuard support in gluetun, so they take the `wg0.conf` route this stack uses.

That last line is why this stack looks the way it does: **TorGuard *is* a
built-in provider (`VPN_SERVICE_PROVIDER=torguard`), but only for OpenVPN.**
Wanting TorGuard *and* WireGuard is precisely the case gluetun's own
documentation sends to the custom provider. It isn't a workaround — it's the
documented path.

Switching provider changes nothing else: the kill switch, the shared network
namespace and both proxies work the same way regardless of who terminates the
tunnel. Check your provider's page in
[the gluetun wiki](https://github.com/qdm12/gluetun-wiki) for its exact
variables.

## Why it looks like this

**`network_mode: "service:gluetun"` is the whole design.** qBittorrent and
pyload-ng don't get their own network stack — they share gluetun's. That's what
makes the kill switch absolute: there is no route out except the tunnel, so a
misconfiguration fails closed rather than leaking. The cost is that those
containers **cannot declare their own `ports:`**; Docker refuses it. Every port
they need is published on gluetun instead, which is why the list above looks
like it belongs to the wrong service.

**gluetun's firewall is on by default.** Confirmed in its startup summary
(`Firewall settings: Enabled: yes`) — you don't have to configure a kill switch,
you have to avoid breaking the one that's already there.

**`VPN_SERVICE_PROVIDER=custom` plus a mounted `wg0.conf`.** TorGuard isn't one
of gluetun's built-in providers, so rather than translating their config into
`WIREGUARD_PRIVATE_KEY` / `VPN_ENDPOINT_IP` environment variables, the whole
config file is mounted at `/gluetun/wireguard/wg0.conf` and gluetun parses it.
Verified working: gluetun reads the endpoint, interface address and keys
straight out of that file. It also keeps the private key out of `docker inspect`
and out of your shell history, which the environment-variable approach does not.

**`:latest` on all three images**, which is upstream's habit rather than a
decision. Worth pinning gluetun in particular — it's the one holding the tunnel.

## Security: the proxies are unauthenticated by default

Both proxies ship with no credentials, so **anyone who can reach ports 9998 or
9980 can route traffic through your VPN account**. On a trusted LAN that may be
exactly what you want — it's what makes them useful from a browser extension on
another machine. It is not something to expose beyond that, and not something to
forget you did.

`compose.yaml` has the variables wired already; set both in `.env` and
authentication switches on for both proxies at once:

```bash
PROXY_USER=someone
PROXY_PASSWORD=a-long-random-string
```

Leave them unset and behaviour is unchanged. gluetun needs the user *and*
password together — one alone does nothing.

Never port-forward these from your router. An open proxy on the public internet
is found within hours, and everything that follows is attributed to your VPN
account.

## Gotchas

- **`SOCKSPROXY` is not a gluetun variable.** Neither is `SOCKSPROXY_PORT`.
  gluetun ignores both silently — no warning — so the SOCKS5 server never
  starts and its published port maps to nothing. Its own settings summary is
  the proof: `SOCKS5 proxy server settings: Enabled: no`. The real names are
  `SOCKS5_ENABLED=on` and `SOCKS5_LISTENING_ADDRESS=:1080`. Fixed in
  `compose.yaml`; still present in `compose.personal.yaml`, whose HTTP proxy
  works fine and whose SOCKS port does not.
- **`HTTPPROXY_PORT` is deprecated but does work.** gluetun logs `WARN You are
  using the old environment variable HTTPPROXY_PORT, please consider changing
  it to HTTPPROXY_LISTENING_ADDRESS`, then brings the proxy up on 8888 anyway.
- **pyload-ng listens on 8000.** The LinuxServer image's web UI port is 8000
  and is *not* settable by environment variable — only inside pyload's own
  config in `./pyloadconfig`. So a `8880:8880` mapping reaches nothing unless
  you already changed it there; `compose.yaml` publishes `8880:8000` instead.
  (Click'n'Load on 9666 isn't published at all.)
- **`wg0.conf` must exist before the first `up`.** It's a bind mount of a
  *file*; if the path is missing, Docker creates a **directory** there, gluetun
  finds no config, and the error doesn't mention the mount. Same failure mode as
  [overleaf's init script](../overleaf/README.md#running-it-on-openmediavault).
- **Never put `wg0.conf` in `init/`.** This repo's `.gitignore` un-ignores
  `*/init/**` so that runtime config fragments get committed — which for a
  WireGuard config means publishing your private key. `wg*.conf` and `*.ovpn`
  are now explicitly ignored everywhere as a guard, but the habit is the real
  protection.
- **Restarting gluetun cuts the other two off.** They share its namespace, so
  when it goes away their network does too, and `depends_on` doesn't bring them
  back. Restart the whole stack, not one service.
- **`TORRENTING_PORT=6881` is not published**, so incoming peer connections
  don't arrive and you're limited to outgoing ones. Fixing that properly needs
  port forwarding from TorGuard, then publishing the matching port on gluetun.
- **In `compose.personal.yaml` the variables have no defaults.** `${PUID}`,
  `${PGID}`, `${TZ}` and `${TEMPDISK}` are bare, so Compose interpolates empty
  strings and starts the containers anyway. `compose.yaml` uses
  `${PUID:-1000}` and `${TEMPDISK:?…}`, which aborts with a readable message
  instead.
- **Check for leaks after any change**, not just at setup. `docker compose exec
  gluetun wget -qO- https://ipinfo.io/ip` is the ten-second version.

## Exposing it

**Don't.** This stack has no business being reachable from the internet: two
admin UIs with weak-by-default auth and two unauthenticated open proxies.

If you need the UIs remotely, reach them over your own VPN or a
[Cloudflare Tunnel](../cloudflare-tunnel/) with
[Authentik forward auth](../docs/authentik-sso.md#forward-auth--putting-an-app-with-no-sso-behind-authentik)
in front — and leave the proxy ports off it entirely.

## Links

- gluetun (now at the passteque org): <https://github.com/passteque/gluetun>
- gluetun wiki: <https://github.com/qdm12/gluetun-wiki>
- TorGuard WireGuard + gluetun guide:
  <https://www.torguard.net/support/articles/TorGuard-Software-Features/torguard-wireguard-gluetun-docker-setup.php>
- qBittorrent image: <https://docs.linuxserver.io/images/docker-qbittorrent/>
- pyload-ng image: <https://docs.linuxserver.io/images/docker-pyload-ng/>
