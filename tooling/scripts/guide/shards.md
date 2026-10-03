## What it is

A **shard** (or **node**) is one database server. A big platform can spread its organizations over
several. **Platform** → **Shards** (`/platform/shards`) shows which node holds each organization,
and moves one to another node.

## Why it exists

One database can only grow so far. With more nodes, each holds a share of the organizations, and
a busy organization can be moved off a crowded node without anyone else noticing.

## How it works

- Every organization lives on exactly **one** node, chosen when it is founded. New organizations
  always start on node 0.
- A directory in the main database records each organization's node. Every request looks it up,
  so the app always reaches the right node.
- An organization changes node only when you move it.

## Step by step: finding an organization

Under **Find a tenant**, type its id or its slug (at least three characters). You see "… (…) is
on node …." or "No tenant answers to that."

## Step by step: moving an organization

:::steps
### Tell the organization first

While it moves, **its people can read but not save anything**. Every save is refused with "You do
not have permission to do that." There is no maintenance message, so warn them beforehand.

### Open its node

On the **Shard map**, press **Show tenants** on its node, then **Move** on its row.

### Choose the new node

The panel reads "… is on node …. Its writes are refused until every row is copied, and the old
copy is kept for the grace period so the move can be undone." Press **Move to node …**.

### Wait for the worker

"Queued as …. The tenant shows on its new node once the worker has copied every row."
:::

What the worker does, in order:

1. Stops the organization's saves, and waits a minute for any in progress to finish.
2. Copies every row to the new node.
3. Counts the rows on both nodes.
4. Switches the directory, so the organization is served from its new node.

If any step fails, saves are allowed again and the organization stays where it was.

## Undoing a move

The old copy is kept for **7 days**. During that time you can move the organization straight back.
After that, the nightly pass at 03:00 deletes the old copy.

## Who can use it

| Action | Permission |
|---|---|
| See the map and find an organization | `platform.shards.read` |
| Move an organization | `platform.shards.manage` |

The **Move** button shows for anyone who can see the map. Without the second permission the move
is refused.

## Good to know

- **With one node there is nowhere to move to.** **Move** is grey: "Tenant moves need a second
  database node — with one, there is nowhere to move a tenant to." On your machine, start a second
  with `pnpm infra:up:sharded`, then `pnpm db:migrate`.
- A move already running, or a node that is already the organization's, gives "Someone else
  changed this first. Reload and try again."
- The **Retention** column shows whether the organization has its own retention limits.
- **Spare organizations.** Every five minutes the worker keeps 20 empty organizations ready on node
  0, so sign-up is quick. You never see them. If they run out, sign-up is just a little slower.
