## What it is

Every program writes one line of text for each thing it does: a request answered, a job finished,
an error. These are the **logs**. They are collected in **Loki**, a store built for searching
them.

## Why it exists

When something goes wrong, the logs say what happened, when, and in which program. They are kept
apart from the database: they are for finding faults, not records of the business.

## How it works

:::steps
### Each program prints its lines

The web app, the worker and the stream process each print one JSON line per event.

### Alloy collects them

**Alloy** reads the output of every container in the stack. Programs run with `pnpm dev` are
collected only if you keep a copy: `pnpm dev | tee infra/logs/dev.log`.

### Loki stores them

Each line is stored under four labels: `app` (which program), `env`, `level` (such as `error`)
and `event_code` (what happened, such as `queue.job.failed`). Everything else is in the line
itself.
:::

## Step by step: searching the logs

There is no log screen in the app. You search with Loki's API, on port 13100 on your machine.

:::steps
### See which programs are sending

```sh
curl -s -G http://localhost:13100/loki/api/v1/label/app/values
```

### Find the errors of the last hour

```sh
curl -s -G http://localhost:13100/loki/api/v1/query_range \
  --data-urlencode 'query={level="error"}' \
  --data-urlencode "start=$(date -d '1 hour ago' +%s)000000000"
```
:::

To watch the containers live, run `pnpm infra:logs`.

## Good to know

- **Logs are kept 30 days**, then deleted. They may be lost; nothing in the app depends on them.
- **Who did what is not in the logs.** That is the activity history, kept in the database. See
  [Where data lives](/docs/admin-guide/data).
- `pnpm infra:core` starts the stack without Loki and Alloy. Logs then only reach your terminal.
- Loki keeps its files in the same storage server as the app, in a separate `loki` bucket.
