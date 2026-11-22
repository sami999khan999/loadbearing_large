---
title: Loki
description: The read side of the diagnostic stream — one file, one HTTP API, and a port shaped so a label cannot be misused.
---

# Loki

The one class that knows Loki exists — and **nothing writes to it from here**: `JsonLogger` writes stdout,
Alloy tails and pushes, so the write path has no dependency and the platform swap is config
([Tier 0](../../../../docs/opinions/dependencies.md)).

| | |
| --- | --- |
| **Folder** | `packages/infrastructure/src/loki/` |
| **Port** | `LogReader` — read-only |
| **Config** | `logs` on `ContainerConfig`; `LOKI_URL`, `LOKI_TENANT_ID` |
| **Container** | `container.logs`, `container.hasLogs` |
| **Compose** | `--profile observability`, on by default |
| **Dependency** | none — `fetch` against `/loki/api/v1/query_range` |

---

## Why a reader exists at all

Grafana was removed (two consoles for one operator), and the query that matters — *this tenant's logs
beside its audit rows* — needs a surface that knows organizations. `LogReader` is that seam; until the
super-admin view ships, its only consumer is the smoke check. `docker compose logs` and curl stay the
break-glass path — a log query needing the app is useless when the app is down.

---

## The port refuses to offer a bad query

```ts
interface LogQuery {
  from: Date; to: Date;
  app?: string; env?: string; level?: string; eventCode?: string;   // labels
  contains?: string;                                                // line body
  limit?: number;
}
```

Four label filters and one substring, closed. **A label is one stream per value** (`user_id` at 100k
users topples Loki), so `LogQuery` cannot express one; high-cardinality values go in `contains`, a line
filter after the selector:

```logql
{app="web", level="error"} |= "abc123" | json
```

`| json` follows the selector so parsing touches only surviving streams. `EVENT_CATALOG` is
`event_code`'s budget — one code with a `queue` field, never a code per queue.

---

## Four things `LokiLogReader` gets right that are easy to get wrong

- **Nanosecond timestamps** — milliseconds silently query 1970; parsing back uses `BigInt` (above 2^53).
- **`direction=backward`** — `forward` shows the *oldest* lines once the window exceeds `limit`.
- **`limit` caps at 5,000** — Loki 400s above it.
- **Non-JSON lines keep raw text as the message** (Postgres, MinIO); labels come off the stream, fields
  from the body, an unparseable body yields empty `fields`.
- **Failures log the body, throw the status** — to `dependency.request.failed` at warn (300 characters),
  `UnavailableError("loki", status)`, since the body echoes LogQL over others' labels.

---

## The tenant header

`LOKI_TENANT_ID` becomes `X-Scope-OrgID` (unset locally), so **Grafana Cloud is config, not migration** —
one reason Loki won, with its ecosystem and CNCF default. If incident-time search latency ever hurts, the
alternatives (VictoriaLogs, OpenObserve, SigNoz — not Elasticsearch) replace this file and one Alloy line.

## Health is deliberately not in `Container.health()`

`LokiLogReader.healthy()` pings `/ready`, but readiness ignores it — failing a probe over logs takes the
app down to protect diagnostics, backwards in the incident that needs them. ClickHouse is included: a
non-answering dashboard store is user-visible.
