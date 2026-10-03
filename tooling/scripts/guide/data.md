## What it is

Where every kind of data is kept, and how the app keeps one organization's data away from another's.

## The stores

| Store | Keeps | If it were lost |
|---|---|---|
| **Postgres** | everything that matters: accounts, organizations, roles, docs, messages, the audit history | real loss; this is the one to back up |
| **Redis (cache)** | short-term copies, such as each person's permissions for 60 seconds | nothing; it refills itself |
| **Redis (queue)** | background jobs waiting to run. A separate server from the cache, saved to disk | the waiting jobs would never run |
| **S3 storage** | doc images, exports, and old months in cold storage | the files themselves |
| **ClickHouse** | a copy of the activity history, for counting | nothing; it can be rebuilt from Postgres and cold storage |
| **Loki** | the logs, for 30 days | only the logs; the app never reads them |

> [!TIP]
> **The test for any store:** if losing it loses something you cannot get back from Postgres or
> storage, it has become a store that matters. Only Postgres and storage pass that test here.

## Why tenants never see each other

:::steps
### Every row is labelled

Every piece of customer data carries the id of the organization it belongs to.

### Every question asks for one organization

The app never asks the database "show me all documents", only "show me this organization's
documents". There is no code path that reads across organizations.

### Each organization has its own shelf

Inside the database, each organization's data sits in its own partition, a separate slice of each
table. Tables that grow with time are sliced again by month. Deleting a tenant removes its slices
whole.

### Each organization lives on one node

With more than one database server, each organization sits wholly on one of them. See
[Shards and moving a tenant](/docs/admin-guide/shards).
:::

## The history of who did what

Every important change, such as a role edited, a member invited or an account suspended, is written to
an audit history in the same moment as the change itself. A change cannot happen without its record.
Platform actions are recorded in the platform organization's history, and also in the affected
organization's history.

The history is kept in the main database for 13 months, then moves to cold storage. See
[Retention](/docs/admin-guide/retention).

## How the app talks to the database

Every connection goes through **pgBouncer**, a gatekeeper that lets thousands of requests share a
few database connections. Changes to the database's structure use a direct line instead
(`DATABASE_DIRECT_URL`).
