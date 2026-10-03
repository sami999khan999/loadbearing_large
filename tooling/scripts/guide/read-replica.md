## What it is

A **read replica** is a second copy of the main database that follows every change, a moment
behind. The worker can read its heavy batch jobs from there instead of the main database.

## Why it exists

Some background jobs read a lot: copying every organization's history into the analytics store,
and checking it each night. Reading from the copy keeps that load off the database everyone's
clicks go to.

## How it works

- Only **the analytics projection and its nightly check** use the replica. The web app never does.
- Before each read, the worker asks whether the replica has caught up. If it is behind, or down,
  the read goes to the main database instead.
- So the data is never stale. The only cost is a quick check before each batch.

## Step by step

:::steps
### Open Status

**Platform** → **Status**.

### Find Replica reads

The box **Replica reads** shows **On** or **Off**.

### Press the button

**Route batch reads to the replica** turns it on. **Read from the primary only** turns it off. It
applies straight away, with no confirmation.
:::

The **Dependencies** table has a row **Postgres — replica** (Up, Down or Not configured), and
"Replica lag: … s": how far behind the copy is.

## Who can use it

| Action | Permission |
|---|---|
| See the switch | `platform.status.read` |
| Change it | `platform.replica.manage` |

## Good to know

- With no replica configured, the box does not appear. On your machine, start one with
  `pnpm infra:up:replica`.
- It matters only when ClickHouse runs: without the analytics store, nothing reads from the
  replica.
- A replica that falls behind is harmless. Reads go to the main database until it catches up.
