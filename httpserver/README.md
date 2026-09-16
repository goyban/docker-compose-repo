# httpserver

A directory of files over plain HTTP, and nothing else. No accounts, no
database, no JavaScript — nginx with `autoindex on` pointed at a scratch
directory. Read-only: it is for handing files out, not taking them in.

The point is **reach**, not features. This is the share that works from a
Windows 98 machine, a games console browser, a printer's built-in fetcher, or
`wget` on a router. [copyparty](../copyparty/) and [filebrowser](../filebrowser/)
are nicer for humans on modern machines; neither will talk to a client from 1999.

## Quick start

```bash
cp .env.example .env
$EDITOR .env            # TEMPDISK -- the parent of the Temp/ you want served
mkdir -p "$TEMPDISK/Temp"
docker compose up -d
```

Open `http://<host>:8083`.

## Ports

| Port | Proto | Purpose |
|------|-------|---------|
| 8083 | http | Directory listing and downloads |

No HTTPS, deliberately. See below.

## Why it looks like this

**Plain HTTP is the feature, not an oversight.** Windows 98 cannot do TLS 1.2,
SNI, or any cipher suite a modern server will negotiate. The moment this goes
behind an HTTPS-terminating proxy it stops working for exactly the clients it
exists for. Verified: an `HTTP/1.0` request with **no `Host:` header** — which
is what ancient clients send — returns `200 OK`, because the single server block
is the default server.

**The generated listing is deliberately primitive.** nginx's `autoindex` emits
`<html><head><title>` then `<h1>`, `<hr>`, `<pre>` and `<a href>`. No CSS, no
JavaScript, not even a table. That renders in IE5, Netscape 4, Lynx, and
everything since. Responses carry `Content-Length`, `Last-Modified` and
`Accept-Ranges: bytes`, so resume works — which matters more on a flaky old
machine than a modern one.

**`include mime.types` is there despite the minimalism**, because it makes weak
clients behave *better* and costs nothing. Mounting a config over
`/etc/nginx/nginx.conf` replaces the whole file, including nginx's default
`types` block, leaving only a tiny built-in table. Measured, before and after:

| File | Without the include | With it |
|------|--------------------|---------|
| `photo.jpg` | `image/jpeg` | `image/jpeg` |
| `page.html` | `text/html` | `text/html` |
| `photo.png` | **`text/plain`** | `image/png` |
| `archive.zip` | **`text/plain`** | `application/zip` |
| `setup.exe` | **`text/plain`** | `application/octet-stream` |
| `manual.pdf` | **`text/plain`** | `application/pdf` |
| `song.mp3` | **`text/plain`** | `audio/mpeg` |

Only html, gif and jpeg survive without it. A modern browser usually shrugs and
downloads anyway; **IE5 on Windows 98 tries to *display* a `text/plain`
response**, so a 700 MB zip becomes a screen of garbage instead of a Save
dialog. The directive is parsed once at startup — no per-request cost, and the
file already ships in the image.

**No upload path.** nginx can accept WebDAV `PUT`, and an earlier version of
this config did — but `autoindex` has no upload form, so a browser can never use
it. Writes would only work from a DAV client: `curl -T`, or Windows Explorer's
*Map network drive*. A real upload button needs a CGI or an app behind nginx,
which is the complexity this stack exists to avoid. Use
[copyparty](../copyparty/) or [filebrowser](../filebrowser/) when you need
people to send files *to* you.

**The config lives in `init/`** because this repo's `.gitignore` ignores
everything inside a service directory except a short list, and `init/**` is on
it. A config in any other subdirectory is silently *not committed*, and then the
bind mount has nothing to mount — Docker creates a **directory** at that path and
nginx won't start. Same failure mode as
[overleaf's init script](../overleaf/README.md#running-it-on-openmediavault).

## Gotchas

- **`PUID` and `PGID` do nothing.** This is the official nginx image, not
  LinuxServer; there is no PUID/PGID handling anywhere in its entrypoint. They
  are accepted and read by nobody — the same trap documented in
  [audiobookshelf](../audiobookshelf/README.md). `TZ` affects log timestamps at
  most. It costs nothing here because the share is read-only: the workers run as
  uid 101 and only ever need read access.
- **`${TEMPDISK}` has no default.** Unset, Compose interpolates an empty string
  and nginx serves `/Temp` from the host root rather than failing. The repo's
  `${VAR:?message}` pattern exists for exactly this.
- **Keep filenames ASCII for old clients.** `autoindex` emits filenames as raw
  bytes; Windows 98 is CP1252, so accented names mangle.
- **`:latest` is unpinned.** If server weight matters, `nginx:alpine-slim` is
  **8 MB** compressed against **63 MB** for `nginx:latest`, with identical
  behaviour for static serving.
- **Anyone who reaches the port sees everything.** `autoindex` publishes a
  browsable listing of the whole share with no authentication. Nothing is
  writable, so the risk is disclosure rather than tampering — but it is the
  whole directory, and that is the intended trade for a temporary share on a
  trusted network.

## Exposing it

**Think twice.** If you put this behind a proxy for remote access, you lose the
old clients that justify it existing.

- [Reverse proxy with Caddy](../docs/reverse-proxy.md) — fine for modern
  clients; it will terminate TLS and break Windows 98.
- [Authentik forward auth](../docs/authentik-sso.md#forward-auth--putting-an-app-with-no-sso-behind-authentik)
  — the way to make it safe remotely, but it needs a browser that can complete
  the login, which rules out the same ancient clients.

Running two hostnames — one bare HTTP on the LAN, one proxied for outside — is
the honest way to have both.

## Links

- nginx `autoindex`: <https://nginx.org/en/docs/http/ngx_http_autoindex_module.html>
- Image: <https://hub.docker.com/_/nginx>
