---
title: grafana.datasources.yml
description: One UI over two stores — why the audit trail needs Postgres alongside Loki, and why the data sources are a file rather than a click.
---

# `grafana.datasources.yml`

The read side of the observability stack. Grafana stores nothing itself; it queries Loki and Postgres
and draws the results.

| | |
| --- | --- |
| **Image** | `grafana/grafana:11.4.0` |
| **Inside the network** | `grafana:3000` |
| **From the host** | `localhost:3001` |
| **Login** | none — anonymous admin |
| **Volume** | `grafanadata` — dashboards you create by hand |
| **Config file** | `grafana.datasources.yml` |

**3001 outside, 3000 inside**, because the web app owns 3000 on the host. Nothing inside the network
is affected.

---

## Provisioned as a file, never clicked in

```yaml
apiVersion: 1

datasources:
  - name: Loki
    type: loki
    uid: loki
    access: proxy
    url: http://loki:3100
    isDefault: true
```

Mounted at `/etc/grafana/provisioning/datasources/datasources.yml`. Grafana scans that directory at
startup and reconciles what it finds — so this file is the source of truth and the UI reflects it.

**A data source configured through the UI lives in `grafanadata`** and disappears on
`pnpm infra:reset`, which is exactly when somebody is already debugging something else. Provisioning
also means a new developer gets a working Grafana on first `up` rather than a blank one.

`apiVersion: 1` is the provisioning schema version, not Grafana's — it has been 1 for years and is
required.

**`uid: loki`** is a stable identifier. Dashboards reference a data source by uid, so pinning it
means a dashboard JSON committed later keeps working across rebuilds. Without it Grafana generates a
random uid each time.

**`access: proxy`** means Grafana's *server* makes the query, not your browser. That is what lets the
URL be `http://loki:3100` — a service name only resolvable inside the bridge network. The alternative,
`direct`, would ask the browser to reach Loki and would need `localhost:3100` plus CORS.

---

## Two stores, and the second is the point

```yaml
  - name: Postgres
    type: grafana-postgresql-datasource
    uid: postgres
    access: proxy
    url: postgres:5432
    user: ratchet
    jsonData:
      database: ratchet
      sslmode: disable
    secureJsonData:
      password: ratchet
```

**Loki answers *what did the system do*. Postgres answers *who did what*.**

The audit trail is a Postgres table written inside the transaction, not a log stream — that is the
whole [four-stream split](../../../docs/opinions/data-and-scale.md). So *"who reactivated this
task"* is a SQL query and *"why did the worker retry"* is a LogQL query, and having both in one UI is
the reason for Grafana rather than a Loki-specific viewer.

When ClickHouse is eventually adopted it becomes a third data source in this same file, and the UI
does not change.

**`secureJsonData`** is the block Grafana encrypts into its own database rather than leaving readable.
It matters little here — the password is `ratchet` — and it is the right habit for the file that gets
copied into a real environment.

**`sslmode: disable`** because the local Postgres has no TLS. This is one of the values that changes
in production, along with the credentials.

---

## Derived fields

```yaml
    jsonData:
      derivedFields:
        - name: TraceID
          matcherRegex: '"traceId":"([^"]+)"'
          url: '$${__value.raw}'
```

A Loki-specific feature: Grafana runs `matcherRegex` against each log line and turns the captured
group into a clickable field in the detail view.

The regex matches the JSON form `"traceId":"0195…"` because that is exactly what `JsonLogger` emits —
`traceId` stays in the **body**, never as a label, so this is how it becomes navigable without
costing cardinality.

> **`$${__value.raw}` is escaped for Compose, which expands `$`.** Written `${__value.raw}` the
> variable is consumed before Grafana ever sees it and the link resolves to an empty string. This is
> a real trap: the file is valid YAML either way and fails silently.

Today the link points at the value itself. When tracing is added, `url` becomes a Tempo link and a
log line turns into a trace in one click — the reason to wire this now while the regex is obvious.

---

## Anonymous admin, deliberately

```yaml
environment:
  GF_AUTH_ANONYMOUS_ENABLED: "true"
  GF_AUTH_ANONYMOUS_ORG_ROLE: Admin
  GF_AUTH_DISABLE_LOGIN_FORM: "true"
```

Set in the compose file, not here. **A local observability stack behind a password is a local
observability stack nobody opens** — the friction costs more than it protects, on data that is a
scratch database's logs.

`GF_AUTH_DISABLE_LOGIN_FORM` removes the login screen entirely rather than leaving a dead form beside
an anonymous session.

All three come off in any shared environment.

---

## Checking it

```bash
curl -s http://localhost:3001/api/health
curl -s http://localhost:3001/api/datasources | jq -r '.[] | "\(.name) (\(.type)) uid=\(.uid)"'
curl -s http://localhost:3001/api/datasources/uid/loki/health
curl -s http://localhost:3001/api/datasources/uid/postgres/health
```

The health endpoints are the useful ones: they make Grafana actually connect, so they distinguish
*"provisioned"* from *"provisioned and reachable"*.

In the UI, **Explore** is the query surface. A first query worth running:

```logql
{app="postgres"} | json
```

That returns Postgres's container logs — proving collection works — and shows `| json` failing
harmlessly on lines that are not JSON, which is the fall-through behaviour
[alloy](alloy.md) relies on.
