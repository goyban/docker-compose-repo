# Open WebUI

Chat interface for local and remote LLMs. One container, one `.env` line to
decide which of three quite different stacks you get.

## Quick start

```bash
cp .env.example .env
$EDITOR .env            # pick OWUI_TAG, point it at your models
docker compose up -d
```

Open `http://<host>:3033`. The first account created becomes the admin.

## Choosing a tag

`OWUI_TAG` in `.env` is the whole configuration. Everything else is detail.

| Tag | What's inside | Choose it when |
|---|---|---|
| **`main`** / `latest` | WebUI only | Models run somewhere else — the Docker host, another machine, a Mac, or a hosted API. **The default, and the right answer most of the time.** |
| **`cuda`** | + CUDA runtime | You're on an NVIDIA host **and** use document RAG or voice input |
| **`ollama`** | + Ollama bundled in | One machine, one container, models managed inside it |
| `dev` | main branch, unreleased | Testing only |
| `v0.11.0` | a frozen release | You want upgrades to be a decision, not a surprise |

`main` and `latest` are the same rolling image — upstream says so explicitly.
Version tags stay frozen.

### What `cuda` actually accelerates

Not your chat. Open WebUI does not run LLMs; Ollama does. The image's own
environment says what the CUDA build is for:

```
SENTENCE_TRANSFORMERS_HOME=/app/backend/data/cache/embedding/models
WHISPER_MODEL_DIR=/app/backend/data/cache/whisper/models
USE_CUDA_DOCKER_VER=cu128
```

Embeddings for document chat, and Whisper speech-to-text. If you don't use
either, `cuda` buys you a much larger image and nothing else. If you do use
them, it's the difference between instant and a visible pause.

**The tag alone doesn't grant GPU access.** You also have to uncomment
`gpus: all` in `compose.yaml` and have the NVIDIA Container Toolkit installed
on the host. Getting one without the other is the usual reason "the GPU isn't
being used".

### On Apple silicon, don't use `ollama`

Docker on macOS runs in a VM with **no GPU passthrough** — Metal is not
reachable from a container. The bundled `ollama` tag will work and will be
miserably slow, because inference falls back to CPU.

The right shape on a Mac is Ollama installed natively, where it uses Metal,
with Open WebUI in Docker pointing at it:

```bash
OWUI_TAG=main
OLLAMA_BASE_URL=http://host.docker.internal:11434
```

Same applies to any machine where the GPU belongs to something other than
Docker.

## Why it looks like this

**One compose file, not three.** The three variants differ by an image tag and
two optional lines. Keeping separate directories per variant meant fixing every
bug three times, and the differences — the interesting part — weren't written
down anywhere.

**`extra_hosts: host.docker.internal:host-gateway`** is always present, even
though only the "Ollama on the host" case needs it. It costs nothing when
unused and is the single most common thing people are missing when the WebUI
can't see their models.

**The Ollama volume is commented out.** It's meaningless except with
`OWUI_TAG=ollama`, and mounting it otherwise creates a stray empty directory
that looks like it should contain something.

**`WEBUI_SECRET_KEY` is optional and empty.** The image generates one into the
data directory on first run. That's fine until you move the data to another
host, at which point a regenerated key logs everyone out.

## Gotchas

- **Switching tags keeps your data.** `DATA_PATH` holds chats, users and
  settings regardless of tag, so moving between `main` and `ollama` is safe.
  Your *models* are a different story — those live in `OLLAMA_PATH` and only
  exist for the bundled tag.
- **`:main` is a rolling tag.** `docker compose pull` can bring a different
  version any day. Pin `OWUI_TAG=v0.11.0` if you'd rather upgrade deliberately.
- **The container runs as root** (`User: 0:0` in the image config) and has no
  `PUID`/`PGID` support. On rootless Docker this is a non-issue; on rootful,
  expect `DATA_PATH` files to be root-owned.
- **The data directory gets big.** It holds the RAG vector DB and cached
  embedding models, not just chats.

## Exposing it

- [Reverse proxy with Caddy](../docs/reverse-proxy.md)
- [Cloudflare Tunnel](../cloudflare-tunnel/) — fine for this one; chat is
  low-bandwidth. Watch the ~100 MB cap if you upload documents for RAG.
- [Single sign-on with Authentik](../docs/authentik-sso.md) — Open WebUI
  supports OIDC directly, which is nicer than forward auth here.

## Links

- Quick start: <https://docs.openwebui.com/getting-started/quick-start>
- Image: <https://github.com/open-webui/open-webui/pkgs/container/open-webui>
