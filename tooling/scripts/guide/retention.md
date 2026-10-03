## What it is

**Platform** → **Retention** (`/platform/retention`) sets how long records are kept: how many
months a table keeps in the main database, and how long its old months are kept in **cold
storage** after that.

## Why it exists

Some tables grow every day: the history of who did what, notifications, the queue of events. Kept
forever, they would slow every organization down. So old months leave the main database, but
they are not thrown away. They are packed into files in storage, where they cost little and can
be read back.

## How it works

Each growing table is split by month. On the **1st of every month at 02:00** (and each time the
worker starts), the worker looks at every month older than the limit and, for each organization:

:::steps
### Detaches the month

The month is taken out of the live table. Nobody reads it from there any more.

### Packs it into a file

It writes the rows to `cold/<table>/<year>/<month>/<organization>.ndjson.gz` in storage, and
records the file in the archive index.

### Checks the file

Only once the file is checked is the month deleted from the database. If any step fails, the month
is put back and nothing is lost.
:::

Every night at **03:30** another pass makes the storage bucket delete files older than the
**Months in cold storage**, and removes the index rows for them.

## What each table keeps by default

| Table | What it holds | In the main database |
|---|---|---|
| `activity_log` | who did what | 13 months |
| `notifications` | the bell and the inbox | 12 months |
| `outbox_event` | changes waiting to be sent out | 2 months |
| `messages`, `doc_revision` | conversations, doc history | never dropped |

A table with no saved setting shows the badge **Default** and uses these numbers.

## Step by step: changing a table

:::steps
### Find the table

Each table has its own box.

### Type the months

**Months in Postgres**: at least 1. **Months in cold storage**: blank keeps the files forever.

### Pick what happens to an old month

**Archive, then drop** (the default) or **Drop**.

### Read the preview

A line below says what the next monthly run would do: "The next run would drop nothing." or, in
red, "The next run drops … partitions, about … rows, … bytes." **Save** stays grey until the
preview for the number on screen has loaded.

### Press Save
:::

> [!CAUTION]
> **Drop means gone.** "A month dropped this way is not in cold storage and cannot be restored."
> Use **Archive, then drop** unless you are sure.

> [!CAUTION]
> **Leave the "Never dropped" tables alone.** The page still shows the month fields for
> `messages` and `doc_revision`, and saving a number there is accepted. The next monthly run would
> then start archiving that table's old months, and with **Drop**, deleting them. These are an
> organization's own conversations and doc history, not a log.

## Step by step: one organization's own limit

Under **One tenant's retention** you can give one organization different numbers for
`activity_log` or `notifications`.

:::steps
### Paste the organization id

Into **Organization id**. You find it on [Accounts](/docs/admin-guide/accounts-admin) or with
**Find a tenant** on [Shards](/docs/admin-guide/shards).

### Pick the table and type the months

Then wait for the preview and press **Save**. It says "Saved."
:::

> [!WARNING]
> **Only the months in the main database take effect for one organization.** Its own **Months in
> cold storage** is saved but not yet applied: the table's own number still decides when its files
> are deleted.

## Analytics history

With ClickHouse running, the **ClickHouse** box sets **Months of analytics history**: how long
the [Activity](/docs/admin-guide/analytics) counts go back. It saves without a preview.

## Bringing a month back

**Restore a month**, on this same page, reads an archived month back. See
[Cold storage and restore](/docs/admin-guide/cold-storage).

## Who can use it

| Action | Permission |
|---|---|
| Open the page | `platform.retention.read` |
| Change a table, one organization's limit, restore a month | `platform.retention.manage` |

Someone with only the first sees just the heading.

## Good to know

- Lowering the months takes effect at the next monthly run, not straight away. Read the red
  preview first.
- `outbox_event` is never archived while it still has unsent changes older than the limit.
- Errors here all show one general sentence: "Something went wrong. Please try again." Check the
  number is a whole number of at least 1.
