---
title: Messaging
description: Direct-key uniqueness, unread computed rather than counted, the fast path beside the durable one, and why the messages table is the one that is not partitioned.
---

# Messaging

One slice, two contracts, and four decisions that are load-bearing enough to be wrong
expensively.

## A permission is necessary and never sufficient

`messaging.conversation.read` says this person may read conversations. It does not say
*which*. Every use-case in the slice also calls `ConversationAccess.assertMember`, and a third
member of the organization gets `FORBIDDEN` on `message.list` rather than an empty page.

The two are different questions and giving them one mechanism is the way into a stranger's DM.
That is why the check is a shared object rather than a line copied into thirteen use-cases: a
copy that got missed would be silent, and it would be silent in the direction that leaks.

`FORBIDDEN`, not `NOT_FOUND`: the id came from this tenant's own space, and a different code
would tell a caller nothing it did not already know.

## The direct key, and why the insert is `DO UPDATE`

A DM is unique per pair through `direct_key`, which is `<lowerId>_<higherId>` — sorted, so
`directKey(a, b)` and `directKey(b, a)` are the same string. Without the sort each person would
get their own copy of the same thread and neither would see the other's messages.

The index is **partial**, on `WHERE direct_key IS NOT NULL`. NULLs are distinct in a unique
index, so without the partial clause every channel would be unconstrained against every other
channel — and with a plain unique index over a nullable column, nothing would be enforced at all.

The insert is `ON CONFLICT … DO UPDATE … RETURNING id`, not `DO NOTHING`. Two people opening the
same DM in the same second must both be handed the one row that exists; `DO NOTHING` returns no
row to the loser, and a use-case that then read by direct key would be racing the commit.

## Unread is computed, never counted

There is no `unread_count` column. `last_read_at` on the membership row is the only state, and
the count is a `LATERAL` per row of the conversation page, **capped at a hundred**:

- **Nothing can drift.** A counter is a second source of truth for something the messages table
  already knows, and the first missed decrement is permanent.
- **No fan-out write per message.** The alternative is one `UPDATE … WHERE user_id <> author` per
  send — a write per member per message, which is the amplification `data-and-scale.md` §6 names.
- **`markRead` is idempotent by construction**, through `SET last_read_at = GREATEST(last_read_at, ?)`.
  A mark that arrives late for an older message cannot move the reader backwards.
- **The cap bounds the worst case.** A channel nobody has opened in a year costs a hundred index
  entries, and the badge says "99+" — which is what a person reads anyway.

The 100k move is `unreadCounts` behind a Redis `HINCRBY` adapter with `last_read_at` still the
record. That is a swap of one method, which is the point of it being one method.

## Two publish paths, and the client dedupes

`SendMessageUseCase` publishes the full frame on the conversation channel **right after its
commit** — the fast path. `MessagingRealtimeSubscriber` publishes the same frame from the outbox
— the durable path. Both, deliberately:

- The fast path is what makes a message appear in milliseconds rather than after a drain tick.
- The durable path is what makes it appear *at all* if the web process dies between the commit
  and the publish.

The client dedupes by message id, so a duplicate costs a refetch nobody sees and a lost fast-path
frame costs nothing. Neither path is allowed to be the only one.

Typing rides the conversation channel and stores nothing. It is a separate wire variant rather
than an `event`, because it invalidates no cache and expires on its own — a routing table that had
to skip it would be a table with a hole in it. It is rate-limited to one signal per two seconds
per conversation in the use-case, through a cache entry with a TTL: "have I published in the last
two seconds" is exactly what a TTL answers, and nothing has to expire it.

## `messages` is the one table that is not partitioned

Against the standing rule in `data.md` for a table that grows with activity, and the reason is
Postgres's own:

> A unique index on a partitioned table must include every partitioning column.

`messages_client_uq` on `(organization_id, conversation_id, client_id)` is the send dedupe — the
thing that makes a retried send one row instead of two. Adding `created_at` to it would not
weaken that guarantee, it would **delete** it: two attempts seconds apart carry different
timestamps, so every retry would insert.

`notifications` survives the same constraint only because its `created_at` is the *event's*
`occurred_at` rather than the clock's, so a redelivery recomputes the same value and collides with
itself. A send has no such value to recompute.

Two alternatives were real and both were rejected:

- **A unique index per partition**, created alongside each month by `MaintenanceGateway`. Correct,
  and it makes the generic partition loop carry a per-table index spec.
- **A non-partitioned side table** holding `(organization_id, conversation_id, client_id)`, written
  in the same transaction. Also correct, and it is an extra write on the hottest path in the slice.

Partitioning here buys the detach-and-ship archive path (`C6.4`), which is filed and not built.
Neither structure is worth paying for that today, and the conversion when it is wanted is a
rewrite that will have to answer the dedupe question first. Retention never drops a message:
messages are domain data.

## The notification policy stops at direct conversations

`message.sent` in a **direct** conversation becomes one `message.received` bell item; in a channel
it becomes nothing. A busy channel notifying every member per message is §6's write amplification
with a table attached.

The row also declares a **subject** — the conversation id — and `DeliverNotificationUseCase` drops
any recipient who already has an unread notification of that kind about that subject. So a burst
of ten messages is one bell item, one frame and one digest line, and the eleventh arrives only
after the reader has cleared the first. The check is one indexed query against
`notifications_subject_idx`, which is partial on `read_at IS NULL AND subject_id IS NOT NULL` so
it holds only rows the check can ever match.
