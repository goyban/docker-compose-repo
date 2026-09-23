# LibreSpeed

A speed test you host yourself. One container, no Flash, no Java, no account —
open the page and it measures the link between the browser and *your* server.

That last part is the whole point and the whole catch: this does not tell you
how fast your internet is. It tells you how fast the path to this box is, which
is the more useful number when you are debugging your own LAN, your VPN, or a
neighbour's Wi-Fi — and a meaningless one if you point it through a CDN.

## Quick start

```bash
docker compose up -d
```

Open `http://<host>:3011`. There is nothing to configure and no `.env` needed
for the default read-only setup — see [`.env.example`](.env.example) for what
becomes relevant once you turn telemetry on.

## Ports

| Host | Container | Purpose |
|------|-----------|---------|
| 3011 | 8080 | Web UI and the test endpoints |

The container port follows `WEBPORT`, which defaults to 8080.

## Why it looks like this

**`MODE: standalone`** means one container is both the page and the test
endpoint. The alternatives matter only at scale: `backend` is a bare test point,
`frontend` serves a UI that talks to a list of remote backends, and `dual` is
both. For a single box, standalone is the whole story.

**No volumes, because telemetry is off.** With `TELEMETRY` unset the container
stores nothing and is entirely disposable — `docker compose down` costs you
nothing. The moment you enable it, that stops being true; see the gotchas.

**Most of the environment block is commented out on purpose.** It is upstream's
menu of options kept close to hand, which is more useful in a file you revisit
once a year than a link to documentation.

## Gotchas

- **Turning on telemetry needs a volume that isn't there.** `TELEMETRY: "true"`
  stores results in sqlite by default, inside the container, at `/database`.
  With no volume mounted the results survive restarts but vanish the moment the
  container is recreated — which is to say, on the next `docker compose pull`.
  Add `- ./data:/database` before enabling it.
- **Telemetry also wants `PASSWORD`**, which protects the stats page at
  `/results/stats.php`. Without it, anyone who finds the URL can read every
  result you've recorded, including client IPs.
- **`EMAIL` is deprecated — the current name is `GDPR_EMAIL`.** It is the
  address shown in the privacy policy for deletion requests, and upstream
  considers it required for a production install with telemetry on. The
  commented block in `compose.yaml` still uses the old name.
- **Results log client IP addresses by default.** `REDACT_IP_ADDRESSES: "true"`
  turns that off. Worth thinking about before you hand the URL to guests.
- **`DISTANCE` does nothing without `IPINFO_APIKEY`**, and that key is a
  credential — it belongs in `.env` and a `${IPINFO_APIKEY}` reference, never in
  the committed compose file.
- **A slow result may be your server, not your network.** The test works by
  generating and swallowing garbage data, so on a low-power host the CPU can cap
  the number before the link does. If you see a suspiciously round ceiling,
  check `docker stats` while a test runs — the same trap as
  [copyparty on an N100](../copyparty/README.md).
- **`:latest` is unpinned.** Note the Docker tags drop the `v` that the git tags
  carry: the release is `v6.3.0`, the image tag is **`6.3.0`** (also `6.3`, `6`,
  and `-alpine` variants of each). Pinning `v6.3.0` fails with a manifest error
  that looks like a network problem.
- **`restart: always` rather than `unless-stopped`**, so a deliberate stop does
  not survive a reboot. The rest of this repo uses the latter.

## Exposing it

- [Reverse proxy with Caddy](../docs/reverse-proxy.md) — works, but understand
  what you are then measuring: the path to the proxy, shaped by whatever the
  proxy does. For a LAN test, reach it directly by IP and skip the proxy.
- [Cloudflare Tunnel](../cloudflare-tunnel/) — **no.** This is a tool whose job
  is to move as many gigabytes as it can for as long as you let it. Putting it
  behind a tunnel produces a number that measures Cloudflare, while pushing
  bulk transfer through a service not meant to carry it.
- [Single sign-on with Authentik](../docs/authentik-sso.md) — forward auth fits
  fine; it is a browser-only app with no accounts of its own. Sensible if this
  faces the internet, though a public speed test is also a free bandwidth sink
  for whoever finds it.

## Links

- Upstream: <https://github.com/librespeed/speedtest>
- Docker options: <https://github.com/librespeed/speedtest/blob/master/doc_docker.md>
- Image: <https://github.com/librespeed/speedtest/pkgs/container/speedtest>
