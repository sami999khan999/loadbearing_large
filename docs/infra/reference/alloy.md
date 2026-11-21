---
title: alloy.config.alloy
description: The log pipeline component by component — two sources, six stages, four labels, and the three leaks that only a running system reveals.
---

# `alloy.config.alloy`

The agent that turns container stdout into Loki streams — **where the label rule stops being a
convention.**

| | |
| --- | --- |
| **Image** | `grafana/alloy:v1.5.1` |
| **Inside the network** | `alloy:12345` (its own UI and metrics) |
| **Reads** | `/var/run/docker.sock` (ro), `/var/log/app/*.log` (ro) |
| **Writes to** | `loki:3100` |

The config is a dataflow graph: each block is a named **component** referencing others' outputs by
identifier. Nothing runs in file order.

```
discovery.docker.compose
   └→ discovery.relabel.compose
        └→ loki.source.docker.compose ─┐
                                       ├→ loki.process.stream → loki.write.default → loki:3100
local.file_match.dev                   │
   └→ loki.source.file.dev ────────────┘
```

---

## Source 1 — container stdout

```alloy
discovery.docker "compose" {
  host             = "unix:///var/run/docker.sock"
  refresh_interval = "15s"

  filter {
    name   = "label"
    values = ["com.docker.compose.project=ratchet"]
  }
}
```

Asks Docker which containers exist. **The filter is not optional** — without it Alloy ingests every
unrelated project on the machine. It matches the label Compose stamps, so it must equal `name: ratchet`
([compose](compose.md)). **`refresh_interval = "15s"`** is how long a new container waits for its logs
to appear; the one-minute default makes a restarted service look like a broken pipeline.

```alloy
discovery.relabel "compose" {
  targets = discovery.docker.compose.targets
  rule {
    source_labels = ["__meta_docker_container_label_com_docker_compose_service"]
    target_label  = "app"
  }
}
```

Discovery metadata is `__meta_*`, and **double-underscore labels are dropped** before a target
becomes a stream, so this copies the Compose service name into `app` — the **fallback** for containers
that do not emit our JSON; our apps overwrite it from the body.

```alloy
loki.source.docker "compose" {
  host       = "unix:///var/run/docker.sock"
  targets    = discovery.relabel.compose.output
  forward_to = [loki.process.stream.receiver]
}
```

Reads the logs. The read-only socket mount exists only for this.

---

## Source 2 — the host

```alloy
local.file_match "dev" {
  path_targets = [{ __path__ = "/var/log/app/*.log", app = "dev" }]
}

loki.source.file "dev" {
  targets    = local.file_match.dev.targets
  forward_to = [loki.process.stream.receiver]
}
```

**`pnpm dev` runs apps on the host**, invisible to Docker discovery, so this tails `infra/logs/`
(mounted at `/var/log/app`):

```bash
pnpm dev | tee infra/logs/dev.log
```

Optional — `LOG_PRETTY=true` in the terminal is the normal loop; pipe only to exercise the pipeline.
`app = "dev"` is a fallback the JSON stage overwrites.

---

## The pipeline

```alloy
loki.process "stream" {
  forward_to = [loki.write.default.receiver]
```

**One pipeline for both sources:** a stage that cannot parse a line extracts nothing and falls
through, so stages compose without a branch per service.

### `stage.json` — our own lines

```alloy
  stage.json {
    expressions = {
      app        = "app",
      env        = "env",
      level      = "level",
      event_code = "event",
    }
  }
```

Reads four body fields into the **extracted map**, per-line scratch space; nothing is a label yet.
`Container` binds `app` and `env` to every line; `level` and `event` come from `EVENT_CATALOG`.
`packages/observability/tests/logger/wire-contract.spec.ts` asserts the contract, since no compiler
spans this file and `JsonLogger`.

> **`app` comes from the body, not the container name, deliberately.** On Kubernetes a container name
> is a pod name (`web-7d4f9`, `web-2a1c8` — two values of one label), and host-run `pnpm dev` has no
> container. The application knows what it is.

### `stage.match` and `stage.logfmt` — third-party lines

```alloy
  stage.match {
    selector = "{app=~\"loki|alloy\"}"

    stage.logfmt {
      mapping = { level = "" }
    }
  }
```

Loki and Alloy emit logfmt with `level`, written to the **same extracted key** as `stage.json`, so
whichever stage understood the line wins. **It is gated, unlike `stage.json`, because `stage.logfmt`
logs an error per unparseable line** — and Alloy collects its own stdout, so ungated it would ship
endless errors that Postgres does not speak logfmt, generating more.

### `stage.static_labels` — the floor

```alloy
  stage.static_labels {
    values = { env = "development" }
  }
```

Every line gets `env`, including third-party ones. **Set before `stage.labels`**, so an app line's
own `env` overrides it. Without it `{env="development"}` silently excluded half the stack.

### `stage.labels` — promotion

```alloy
  stage.labels {
    values = {
      app        = "",
      env        = "",
      level      = "",
      event_code = "",
    }
  }
```

**This decides what a label is.** An empty value means "the extracted key of the same name"; a key
nothing extracted is *left unset*, preserving the relabel fallback `app`. Adding an entry is the one
edit that can quietly make Loki miserable — treat it like adding a catalog row.

### `stage.label_drop` — the leak

```alloy
  stage.label_drop {
    values = ["filename"]
  }
```

`loki.source.file` attaches `filename` — a fifth label and a stream per rotated file, forever.
**Nothing here asked for it**, which is why the check below queries the live label set.

---

## The sink

```alloy
loki.write "default" {
  endpoint {
    url = "http://loki:3100/loki/api/v1/push"
  }
}
```

Service name and container port. Alloy buffers and retries with backoff, so a Loki outage does not
become a log storm.

---

## What each service ends up with

| Service | `app` | `env` | `level` | `event_code` | Parsed as |
|---|---|---|---|---|---|
| `web`, `worker`, `dev` | body | body | body | ✅ | our JSON |
| `loki`, `alloy` | service name | static | body | — | logfmt |
| `postgres`, `redis-*`, `minio`, `clickhouse` | service name | static | — | — | plain text |

**Only our apps get all four** — `event_code` needs a closed catalog. **Third-party services get no
`level`:** normalising four bespoke formats is a per-vendor regex that breaks on their next release,
versus `{app="postgres"} |= "ERROR"`, which Loki already does well.

---

## Three leaks a config review cannot find

All found by running the stack and querying Loki; **none appears in this file.**

1. **`service_name`, invented by Loki 3.x.** Fixed in [loki.config.yml](loki.md) with
   `discover_service_name: []` and `discover_log_levels: false`.
2. **`filename`, attached by `loki.source.file`.** Fixed by `stage.label_drop` above.
3. **`stage.logfmt` error spam**, fixed by the `stage.match` gate above.

---

## Checking it

```bash
curl -s -G http://localhost:13100/loki/api/v1/series \
  --data-urlencode "start=$(($(date +%s)-60))000000000" \
  --data-urlencode 'match[]={app=~".+"}'
```

Every stream in that fresh window must carry only the four. **The global `/labels` endpoint includes
old streams** and shows ghosts long after a fix.

```bash
curl -s -G http://localhost:13100/loki/api/v1/label/app/values | jq -r '.data[]' | sort
```

One entry per compose service. A missing value means that container has not logged yet; a value not
in the compose file means the project filter is wrong. Alloy's UI at `http://localhost:12345` shows the
component graph and health — the fastest way to find a stage dropping lines.

> **`LOG_PRETTY=true` blinds the pipeline** — not JSON, so lines arrive with only target labels.
> Right in a terminal, wrong anywhere Alloy reads.

> **The healthcheck is `bash`'s `/dev/tcp`** (no `wget` or `curl` in the image): it proves Alloy
> listens, not that components loaded. The label checks are the real test.
