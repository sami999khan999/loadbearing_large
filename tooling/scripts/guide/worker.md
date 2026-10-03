## What it is

The **worker** is a separate program that does slow or scheduled work, so that pages stay fast.
The web app only drops a job on the queue and answers straight away.

## What it does on request

| Job | Started by |
|---|---|
| Sending email | sign-ups, invitations, password resets, digests |
| Delivering events | every change that others must hear about, such as the bell |
| Notifications | the daily digest for each organization |
| Indexing documents | **AI document search**, when a document is added |
| Exports and deletes | the **Cold storage** page |
| Restoring an archived month | **Restore a month** on the **Retention** page |
| Moving an organization to another node | **Move** on the **Shards** page |
| Re-projecting a month to analytics | **Re-project this month** on the platform **Analytics** page |
| Re-rendering docs | `pnpm doc:rerender` |

## What it does on its own

All times are UTC.

| When | What |
|---|---|
| every second | delivers waiting events |
| every 5 minutes | keeps 20 empty organizations ready, so a sign-up is instant |
| every 5 minutes | copies new activity into the analytics store (only with ClickHouse) |
| 02:00 on the 1st, and at every start | prepares storage for the coming months, and archives months past their [retention](/docs/admin-guide/retention), on every node |
| 03:00 daily | clears expired sessions, invitations, trials and exceptions, and deletes a moved organization's old copy once its 7 days are up |
| 03:30 daily | makes storage delete old exports (after 7 days) and archived months past their limit, and removes deleted organizations' archives 30 days after the delete |
| 04:00 daily | checks every node for data left behind by an unfinished delete; silence means all is well |
| 05:00 daily | checks the analytics store against the main database, and repairs it (only with ClickHouse) |
| 07:00 daily | sends each organization's notification digest |

## If the worker is stopped

Nothing is lost: jobs wait in the queue and run when it starts again. But until then no email is
sent, no export appears and no delete happens.

## Step by step: retrying failed jobs

A job that fails after its retries is kept for about a week.

:::steps
### Fix the cause

For example, start the mail server.

### Put the jobs back

```sh
pnpm queue:replay mail
```

The queue names are `mail`, `event`, `notification`, `embedding`, `maintenance` and
`analytics`. Add a job name
to replay only those, for example `pnpm queue:replay maintenance tenant-export`.
:::

:::accordion{title="If the worker was down on the 1st of the month"}
Run `pnpm db:partitions` to prepare the month's storage by hand. The worker also does this every
time it starts.
:::
