---
title: Env
description: What the stream process reads, the auth settings that must equal the web app's, and why its pool is five.
---

# Env

The schema is the web app's, deliberately, with four differences. The process resolves principals —
a session cookie, a bearer token, an API key — so it carries the whole `AUTH_*` block the worker
does not.

| Key | Here | Why |
| --- | --- | --- |
| `REALTIME_PORT` | `13001` | Where `/api/realtime` is proxied to. The web app's Vite reads it too |
| `REALTIME_SHUTDOWN_TIMEOUT_MS` | `20000` | The stop's budget; half spreads the ends, half is the backstop |
| `DATABASE_POOL_MAX` | `5` | The only queries are a principal and a room's membership, once per stream opened |
| `APP` | `realtime` | The log label, so a line says which process wrote it |

**`AUTH_SECRET` and `AUTH_COOKIE_CACHE_MAX_AGE_SECONDS` must equal the web app's.** The cookie
is signed by the web app and read here. A different secret reads every cookie as forged, and every
stream answers `UNAUTHORIZED` — which the browser, correctly, does not retry.

`REALTIME_MAX_STREAMS_PER_USER` and `REALTIME_STREAM_MAX_AGE_SECONDS` are read here and, for one
release, by the web app too: it still mounts the stream router so tabs opened before the deploy keep
working. The cap is per process and counts every stream a person opens — their own and each room's.

`DATABASE_SHARD_<n>_URL` is read by the same `shardsFromEnv` as every other process, and
`check-architecture` §29 holds the four copies to one algorithm.
