---
title: minio
description: The S3 stand-in, its two unrelated consumers, and the one-shot container that creates both buckets.
---

# `minio`

An S3-compatible store, so the S3 code path runs in development, not first on deploy day.

| | |
| --- | --- |
| **Image** | `coollabsio/minio:RELEASE.2025-10-15T17-29-55Z` |
| **Inside the network** | `minio:9000` |
| **From the host** | `localhost:19000` (API), `localhost:19001` (console) |
| **Credentials** | `ratchet` / `ratchetsecret` |
| **Volume** | `miniodata` |
| **Buckets** | `ratchet`, `loki` |

---

## Why MinIO rather than a filesystem adapter

The AWS SDK talks to MinIO unchanged; a filesystem `StorageGateway` would first run presign expiry,
addressing, multipart and error shapes in production. The one difference, addressing, is config:

```ini
S3_FORCE_PATH_STYLE=true    # MinIO: endpoint/bucket/key
S3_FORCE_PATH_STYLE=false   # AWS:   bucket.endpoint/key
```

It has been in `.env.example` from the start, so production differs by one line.

---

## Two unrelated consumers

| Bucket | Written by | Contains | Derived? |
|---|---|---|---|
| `ratchet` | `S3StorageGateway` | user uploads | **no** — a second source of truth |
| `loki` | Loki | log chunks and the TSDB index | no — but only 30 days of it |

They share a server and nothing else. **`ratchet` is a real second source of truth** — Postgres has
the metadata row and key, MinIO the bytes — so deleting a resource is two operations that can
disagree if one fails. **`loki` is Loki's backend** ([loki.config.yml](loki.md)), which makes retention
a config line and matches production, where the same setting names S3.

> Keys under `ratchet` follow `<subject>/<yyyy>/<mm>/<uuid>.<ext>` — date-partitioned because
> lifecycle rules and cost reporting both work on prefixes, and a UUID rather than the original
> filename because filenames are user input.

---

## `minio-init`

A one-shot container, not a service:

```yaml
minio-init:
  image: bitnamilegacy/minio-client:latest
  depends_on: [minio]
  entrypoint: >
    /bin/sh -c "
    until mc alias set local http://minio:9000 ratchet ratchetsecret; do sleep 2; done &&
    mc mb --ignore-existing local/ratchet &&
    mc mb --ignore-existing local/loki &&
    mc anonymous set none local/ratchet &&
    mc anonymous set none local/loki &&
    echo 'buckets ready'
    "
```

It creates both buckets and exits — **`exited (0)` is success**; no restart policy or healthcheck,
since it is meant to stop.

- **`mc alias set local http://minio:9000`** — the service name; `localhost` is its own loopback.
- **`--ignore-existing`** — idempotent, safe on every `up`.
- **`mc anonymous set none`** — both buckets private. Files are served via presigned URLs from
  `S3StorageGateway`; a public bucket exposes any upload whose key is guessed.

Loki depends on it *completing*, or it starts before its bucket exists and fails on first write:

```yaml
loki:
  depends_on: { minio-init: { condition: service_completed_successfully } }
```

---

## Checking it

```bash
C="docker compose -f infra/docker-compose.yml"

# both buckets exist
$C exec minio sh -c "mc alias set l http://localhost:19000 ratchet ratchetsecret >/dev/null && mc ls l"

# Loki is genuinely writing into its bucket
$C exec minio sh -c "mc alias set l http://localhost:19000 ratchet ratchetsecret >/dev/null && mc ls --recursive l/loki | head"
```

`loki_cluster_seed.json` and `index/` appear when Loki starts. **Chunks take longer** — buffered in the
WAL and flushed on a timer — so `fake/` (the tenant under `auth_enabled: false`) appears after the
first flush; `index/` without `fake/` after a few minutes is normal. An empty bucket with a healthy Loki
means nothing is shipped — check [alloy](alloy.md). The console at `http://localhost:19001` (same
credentials) is the fastest way to inspect an upload.

> **MinIO stopped publishing community images in October 2025** and pulled existing ones from Docker
> Hub and Quay, so `minio/minio` and `minio/mc` stopped resolving (a `403`, not a rate limit — waiting
> does not help) and took CI down. The server is now a community rebuild of
> `RELEASE.2025-10-15T17-29-55Z`, the last upstream release, pinned since nothing newer will come; `mc`
> is from Bitnami's frozen archive. Both are dev stand-ins, never run by a deployment.
