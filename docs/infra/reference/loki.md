---
title: loki.config.yml
description: Every block of Loki's config — single-binary mode, MinIO-backed storage, thirty-day retention, and the two settings that stop it inventing labels.
---

# `loki.config.yml`

The log store. Alloy pushes, MinIO holds chunks, and every reader uses the HTTP query API — `curl`,
the smoke check, and [`LokiLogReader`](../../../packages/infrastructure/docs/reference/loki.md), the
seam for the super-admin dashboard. **Nothing in this repository pushes to it:** `JsonLogger` writes
stdout and Alloy ships it, so a log-platform swap is config — the write path has no dependency.

| | |
| --- | --- |
| **Image** | `grafana/loki:3.3.2` |
| **Inside the network** | `loki:3100` |
| **From the host** | `localhost:13100` |
| **Volume** | `lokidata` — index and WAL only |
| **Chunks** | MinIO, bucket `loki` |
| **Retention** | 30 days |

---

## `auth_enabled: false`

Loki is multi-tenant via an `X-Scope-OrgID` header. Disabling auth hard-codes the tenant `fake` (hence
`fake/` in the bucket) — right for a single-tenant stack. **Enabling it means every client sends the
header**, Alloy's `loki.write` and every query client included.

## `server`

```yaml
server:
  http_listen_port: 3100
  log_level: warn
```

`warn`, not `info`, breaks a loop: Alloy ships Loki's own stdout back to Loki, which at `info` is a
real fraction of a quiet stack's volume.

## `common`

```yaml
common:
  instance_addr: 127.0.0.1
  path_prefix: /loki
  replication_factor: 1
  ring:
    kvstore:
      store: inmemory
```

This makes Loki a **single binary**. Its components (distributor, ingester, querier, compactor)
normally find each other through a Consul or etcd ring; `store: inmemory` with
`replication_factor: 1` is a one-member ring in one process, registered at `127.0.0.1`.
`path_prefix: /loki` holds the WAL, index cache and compactor directory — the `lokidata` mount.

> Scaling past one instance replaces this block. Grafana Cloud runs the same Loki with a real ring, so
> the escape hatch is a config change, not a migration.

## `common.storage.s3` — chunks in MinIO

```yaml
  storage:
    s3:
      endpoint: minio:9000
      bucketnames: loki
      access_key_id: ratchet
      secret_access_key: ratchetsecret
      s3forcepathstyle: true
      insecure: true
```

- **`endpoint: minio:9000`** — the bridge-network service name ([minio](minio.md)); `localhost` would
  be Loki's own loopback.
- **`s3forcepathstyle: true`** — as `S3_FORCE_PATH_STYLE`: MinIO uses `endpoint/bucket/key`, AWS
  `bucket.endpoint/key`. Both flip for real S3.
- **`insecure: true`** — plain HTTP; removed against real S3.

Object storage rather than a volume is what makes retention a config line and keeps the local topology
matching production.

## `schema_config`

```yaml
schema_config:
  configs:
    - from: 2024-01-01
      store: tsdb
      object_store: s3
      schema: v13
      index:
        prefix: index_
        period: 24h
```

**A list, structurally:** rather than migrate data, Loki keeps dated schemas — data after `from` uses
that entry. Changing format means appending an entry with a future `from`, never editing this one.
`tsdb` + `v13` is Loki 3.x's current pair; `period: 24h` is one index table a day, the compactor's
granularity too.

## `limits_config`

```yaml
limits_config:
  retention_period: 720h
  reject_old_samples: true
  reject_old_samples_max_age: 168h
  max_label_names_per_series: 8
  discover_service_name: []
  discover_log_levels: false
```

- **`retention_period: 720h`** — thirty days, the whole case for a log platform over a log table: no
  migration, partition or cleanup job.
- **`reject_old_samples`** — refuses lines older than a week, so a misconfigured agent replaying an old
  file cannot write into arbitrary past index periods.
- **`max_label_names_per_series: 8`** — a backstop that makes a mistake fail loudly at ingest; the rule
  is the four-label pipeline in [alloy](alloy.md).
- **`discover_service_name: []` and `discover_log_levels: false` stop Loki inventing labels.** By
  default Loki 3.x derives `service_name` and `detected_level`, turning four labels into six. Found by
  querying the running system — nothing in `alloy.config.alloy` mentions them — which is why the gate
  checks live labels rather than the file.

## `compactor`

```yaml
compactor:
  working_directory: /loki/compactor
  delete_request_store: s3
  retention_enabled: true
```

**`retention_enabled: true` is what enforces `retention_period`** — without it the limit is advisory
and nothing deletes. `delete_request_store: s3` keeps pending deletions across restarts.

---

## Who talks to it

| Direction | Who | How |
|---|---|---|
| in | `alloy` | `POST http://loki:3100/loki/api/v1/push` |
| out | `LokiLogReader` | `GET http://loki:3100/loki/api/v1/query_range` |
| out | you | `curl localhost:13100/loki/api/v1/...` |
| storage | `minio` | chunks and index to bucket `loki` |

`LokiLogReader` is built only when `LOKI_URL` is set and changes nothing written. It is **not** in
`Container.healthy()`: Loki down loses diagnostics only, and failing readiness over it would take the
app down to protect its logs. Its `LogQuery` offers the four labels and a substring filter, so a
high-cardinality query cannot be expressed.

---

## Checking it

```bash
curl -s http://localhost:13100/ready          # "ready"
curl -s http://localhost:13100/config | head  # what it actually loaded, after defaults

# the label set — query a FRESH window, not the global list
curl -s -G http://localhost:13100/loki/api/v1/series \
  --data-urlencode "start=$(($(date +%s)-60))000000000" \
  --data-urlencode 'match[]={app=~".+"}'
```

**The global `/labels` endpoint includes old streams** and shows ghosts after a fix; always scope to a
fresh window. App-side: `pnpm --filter @loadbearing/infrastructure run smoke` with `LOKI_URL` set pings
`/ready` and runs a real `query_range` over the last hour, asserting nothing about particular lines
(that would be flaky, not a wiring check).

> Loki is the slowest to report healthy on a cold start, waiting for `minio-init` to make its bucket —
> hence twenty retries at ten seconds.
