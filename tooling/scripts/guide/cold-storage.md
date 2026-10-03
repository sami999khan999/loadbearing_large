## What it is

**Cold storage** is where old months go once [Retention](/docs/admin-guide/retention) takes them
out of the main database: one packed file per organization, per table, per month, in S3 storage.
**Platform** → **Cold storage** (`/platform/storage`) shows what each organization has there.

## Why it exists

Old records are rarely read, so keeping them in the main database is expensive and slows it
down. In storage they cost little, and they can still be read back when someone needs them.

## How it works

- Each file is `cold/<table>/<year>/<month>/<organization>.ndjson.gz`.
- An **archive index** records every file: its organization, table, month, size, number of rows,
  a checksum, and whether it has reached the analytics store.
- The index outlives the organization. That is how a deleted organization's files are still found
  and removed 30 days later.

## Step by step: seeing an organization's cold storage

:::steps
### Open Cold storage

**Platform** → **Cold storage**. Its heading is "Cold storage by tenant": one row per organization
and table, with **Size**, **Rows** and **Months**.

### Filter to one organization

Paste its **whole** id into **Organization id**. A part of an id finds nothing.

### Read its months

A second table, **Archived months**, lists each month with its size, rows and actions. **Never**
under **Projected** means that month never reached the analytics store. See
[The analytics projection](/docs/admin-guide/projection).
:::

> [!NOTE]
> Only archived months are shown. How much space an organization takes in the main database
> cannot be split out per organization.

## Step by step: bringing a month back

Restoring is on **Platform** → **Retention**, under **Restore a month**.

:::steps
### Pick the table and month

**Table** and **Month**.

### Press Restore

"Queued as …. … objects to read back." The worker does it in the background.
:::

What you get depends on the month's age:

- **Still inside the table's limit**: the month goes back into the live table, as if it had never
  left.
- **Older than that**: it lands in a separate scratch table, and stays there. To have it live
  again, raise the **Months in Postgres** first.

Each file is checked against its checksum and row count as it is read. A file that does not match
is rejected, and nothing half-read is kept.

> [!WARNING]
> **A restore brings the month back for every organization.** There is no way on screen to pick one
> organization. Nothing archived for that month gives "We could not find what you were looking
> for."

## Export and delete

The forms to [export an organization](/docs/admin-guide/export) and
[delete one](/docs/admin-guide/delete-tenant) are on this page too.

## Who can use it

| Action | Permission |
|---|---|
| Open the page and the list | `platform.storage.read` |
| Restore a month | `platform.retention.manage` (on the Retention page) |
| Export or delete an organization | `platform.tenant.manage` |

## Good to know

- A deleted organization's files are kept **30 days from the delete**, then removed by the
  nightly pass. A deleted organization shows its id instead of its name.
- There is no screen to bring a deleted organization back.
- To remove a deleted organization's files straight away, run
  `pnpm db:partitions --sweep <organization id>` on the server.
