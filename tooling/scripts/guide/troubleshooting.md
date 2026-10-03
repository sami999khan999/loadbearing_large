## Start here

Open **Platform** and read the status table. Then find the symptom below.

## Symptoms

:::accordion{title="Emails are not arriving"}
1. Is the worker running? Email is only sent by the worker.
2. Is **Redis — queue** up on the status page?
3. On your machine, look in Mailpit at `http://localhost:18025`, not a real inbox.
4. If jobs failed while something was down, run `pnpm queue:replay mail`.
:::

:::accordion{title="An export or a delete never finishes"}
Both run in the worker. Check that it is running and that **Redis — queue** is up. A delete that
stopped halfway is reported by the 04:00 orphan check. The exported files are listed on
**Cold storage**.
:::

:::accordion{title="Someone cannot see a button or a page"}
Check the three layers, in order:
1. **A feature flag**: is the feature switched on for their organization?
2. **The plan and modules**: does their organization's plan include it, and is the module switched on?
3. **Their role**: does their role, after any exceptions, hold the permission?

A change to any of them can take up to a minute to show, because permissions are cached for 60 seconds.
:::

:::accordion{title="A doc page says 'not found'"}
- Is it published? A draft is invisible to readers.
- Does its space's audience include the reader?
- Does it, or a page above it, have an access link the reader fails?
- Signed-out readers fail every access link.
:::

:::accordion{title="The bell does not update live"}
Check **Realtime fan-out** on the status page, and that the stream process is running. A page
refresh always shows the latest count.
:::

:::accordion{title="Everything is slow"}
Check **Postgres** and **Redis — cache**. With the cache down, every page reads permissions from
the database again.
:::

:::accordion{title="The Activity page shows nothing new"}
1. Is **ClickHouse** up on the status page?
2. On **Platform** → **Analytics**, is the projection **On**, not **Paused**?
3. Any months under **Gaps**? Press **Re-project this month**.
4. The last few minutes are always missing: the copy runs every five minutes.
:::

:::accordion{title="One organization cannot save anything"}
Is it being moved to another node? Look on **Platform** → **Shards**. Saves are refused until the
copy finishes, then work again by themselves.
:::

:::accordion{title="Only some organizations fail"}
The **Postgres** row covers every database node, so it shows **Down** when any one of them is.
If only some organizations fail, their node is the one down; the others carry on. Find an
organization's node with **Find a tenant** on **Platform** → **Shards**.
:::

## Reading the logs

`pnpm infra:logs` shows every container's output live. To search past lines, see
[Logs](/docs/admin-guide/logs).

## The machine-readable check

`/api/health` answers `200` when healthy and `503` when not, with the same breakdown. Point your
monitoring at it.
