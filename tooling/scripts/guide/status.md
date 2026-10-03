## What it is

The **Platform** page is the health board. It shows whether each service the app depends on is
answering, in one table, plus switches for incidents.

## Why it exists

When something feels slow or broken, this is the first place to look. It answers "is it us, and
which part?" in one glance.

## How to read it

At the top: **Platform organization: Loadbearing (loadbearing)** and an overall badge, **Healthy**
or **Degraded**. Below, one row per service, each **Up**, **Down** or **Not configured**:

| Row | What it is | If it is Down |
|---|---|---|
| **Postgres** | the main database, and every shard node | nothing works for the organizations on that node; fix this first |
| **Redis — cache** | the short-term memory | pages slow down, permissions are re-read from Postgres |
| **Redis — queue** | the list of background jobs | no mail, exports, deletes or digests happen |
| **Realtime fan-out** | the live line to browsers | the bell stops updating live; a refresh still works |
| **ClickHouse** | the analytics store | **Activity** pages stop updating; nothing else is affected |
| **Postgres — replica** | a standby copy of the database, with "Replica lag: … s" | only batch work slows; it never makes the page Degraded |

> [!NOTE]
> **Not configured** is grey, not red. It means the service is not part of this setup, not that it
> is broken. ClickHouse and the replica are optional: start them on your machine with
> `pnpm infra:up:analytics` and `pnpm infra:up:replica`.

## Step by step: checking health

:::steps
### Open the page

Click **Platform** in the menu.

### Read the badge

**Healthy** means Postgres, both Redis rows and realtime are fine, and ClickHouse too when it is
configured.

### Find the red row

Look up its meaning in the table above, and see [When something is red](/docs/admin-guide/troubleshooting).
:::

## Switches on this page

- **Module switches**: turn a whole part of the product off for everyone, during an incident. See
  [Module switches](/docs/admin-guide/modules).
- **Replica reads**: only shown when a standby database exists. See
  [The read replica](/docs/admin-guide/read-replica).

## Who can use it

`platform.status.read` to see the page; `platform.module.manage` for module switches;
`platform.replica.manage` for the replica switch.

:::accordion{title="The same check, for machines"}
`/api/health` gives the same breakdown as data. It answers `200` when healthy and `503` when not,
so a load balancer or a monitor can watch it without signing in.
:::
