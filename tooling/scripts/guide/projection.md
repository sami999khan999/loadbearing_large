## What it is

**Platform** → **Analytics** (`/platform/analytics`) controls the **projection**: the copying of
every organization's history into ClickHouse, which feeds each organization's
[Activity](/docs/admin-guide/analytics) page.

## Why it exists

The copy runs on its own, but you sometimes need a say: pause it during maintenance, fill in a
month that was missed, or stop copying a kind of action nobody counts.

## How it works

- Every five minutes the worker copies new history rows, organization by organization.
- Each organization has a **checkpoint**: the last row copied. It is read back from ClickHouse
  itself, so after a pause the copy carries on from exactly where it stopped.
- A **gap** is an archived month that was never copied. Old months leave Postgres for cold storage
  (see [Retention](/docs/admin-guide/retention)), and a month archived while copying was paused
  has never reached ClickHouse.

## The three parts of the page

### Projection: the on and off switch

The badge reads **On**, **Paused** or **Not configured**.

- **Pause projection** stops the copying. **Resume projection** starts it again from each
  checkpoint. Neither asks for confirmation.
- While paused, the page says how long you have: "The audit table keeps … months; resume within
  that or fill the gap from cold storage."
- **Not configured** means there is no ClickHouse: "Set CLICKHOUSE_URL to start one."

### Gaps

Each archived month that never reached ClickHouse is listed: "… — … archived objects never
projected." Press **Re-project this month** to read it back from cold storage. You see "Queued as
…; … objects to read back." It covers every organization for that month.

When nothing is missing, it says "Every archived month reached the analytics store."

> [!TIP]
> Re-projecting twice is harmless. A row already in ClickHouse is not counted twice.

### Which actions, and for how long

Every kind of action is listed, grouped by module, with how many months ClickHouse keeps it.

- Type a number from 1 to 120 and press **Save months**. Blank keeps the default.
- **Stop projecting** stops copying that action. Rows already in ClickHouse stay; new ones stop
  arriving. **Resume projecting** starts it again.

If ClickHouse does not yet hold what you saved, the page says "The store holds a different
expression from these rows. The nightly run repairs it." That fixes itself overnight.

## Who can use it

| Action | Permission |
|---|---|
| Open the page and see the switch | `platform.analytics.read` |
| Pause, resume, re-project, change the actions | `platform.analytics.manage` |

Only platform staff hold these. No organization's role can.

## Good to know

> [!WARNING]
> **A long pause can lose data for good.** Paused, rows wait in Postgres. Once they are old enough
> to be archived, the only way back is **Re-project this month** from cold storage. Resume before
> the deadline the page shows.

- Pausing also skips the nightly repair run.
- Re-projecting shows no progress bar. Check the month disappears from **Gaps** later.
- Every change here is recorded in the activity history.
- How many months ClickHouse keeps overall is set on [Retention](/docs/admin-guide/retention), as
  "Months of analytics history".
