## What it is

**Activity** in the menu (`/analytics`) counts what happened in the organization, day by day:
invites sent, roles changed, documents added and every other recorded action.

## Why it exists

The history of who did what is kept for every organization. Counting it straight from the main
database would slow everyone else down, so the counts come from a separate store built for
counting.

## How it works

:::steps
### Something happens

Every action is written to the organization's history in Postgres, as part of the same save.

### The worker copies it

Every five minutes the worker copies new history rows into **ClickHouse**, a database made for
adding up millions of rows quickly. It skips the last 30 seconds, so nothing half-written is
copied.

### The page reads the counts

**Activity** asks ClickHouse for the counts. It never touches the main database.
:::

So **the newest few minutes may not be there yet**. The page says so under its heading.

## Step by step

:::steps
### Open Activity

**Activity** in the menu.

### Pick a period

**Last 30 days** (the default) or **Last 90 days**. Both include today.

### Read the two tables

The summary line gives the dates and the total: "… to …. Events: …". Then:

- **By day**: one row per day, newest first.
- **By action**: one row per kind of action, largest first. Actions show by their code, such as
  `member.invited`.
:::

## Who can use it

| Action | Permission |
|---|---|
| Open Activity | `analytics.activity.read` (Owner and Administrator by default) |

## Good to know

- **No ClickHouse, no numbers.** Without `CLICKHOUSE_URL` the page says "Analytics are not
  configured on this deployment." On your machine, start it with `pnpm infra:up:analytics`, then
  run `pnpm ch:migrate` once.
- "Nothing happened in this period." means there really were no actions, or the copying is paused.
  The page cannot tell the two apart. Check [The analytics projection](/docs/admin-guide/projection).
- An action you stop copying on the projection page never reaches this page.
