---
title: Messaging
description: Direct-key uniqueness, unread computed rather than counted, the fast path beside the durable one, and where the send dedupe went when messages took a month level.
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

### `messages.created_at` is stored to the millisecond, on purpose

Postgres writes `now()` to the microsecond. A JavaScript `Date` holds milliseconds, so a value
read back through the client and sent again is a *different* instant from the one on the row —
and `findById`, `edit` and `softDelete` all carry `createdAt` back as a predicate. Every one of
them matched zero rows: editing a message did nothing, deleting it did nothing, and a
conversation the reader had just read still showed one unread, because `unreadCounts` compares
`created_at > last_read_at` and `last_read_at` comes from the application clock.

The column is therefore `timestamptz(3)`, which is what makes the round trip exact. `notifications`
needs no equivalent: its `created_at` is the event's `occurred_at`, which has already been through
a `Date` — the same property, arrived at a different way, and the reason its dedupe index holds.

The general rule, for any column a caller will hand back: **if a timestamp is a key, it must be
storable in the type the caller holds it in.**

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

## The member frames go out in chunks, and that was worth measuring

A message in a room of N members is **one** publish of the body on the conversation channel and
**N** compact "something changed" frames on the members' own channels. The body is published once
on purpose — N publishes of the same bytes is the thing a conversation channel exists to avoid —
but the N frames are still N.

They used to go out one at a time, each awaited. At 25 000 members that is 25 000 serialised Redis
round trips and **eighteen seconds**. In chunks of 500 through `Promise.all` it is **769 ms**:
ioredis multiplexes one socket, so a chunk leaves as one write rather than as five hundred round
trips. Twenty-three times, for four lines.

Chunked rather than `Promise.all` over the whole list, which is the only judgement in it: a room of
a hundred thousand is not a write buffer to build.

The measurement is
[infrastructure · fan-out](../../../infrastructure/docs/reference/fan-out.md), and it times both
shapes side by side so the difference cannot quietly go away again. What is left at 25 000 is the
notification rows — five seconds of them — which is where §6 said the cost would be.

## How `messages` is partitioned, and where the dedupe went

It is partitioned by tenant and then by month, like `activity_log` and `notifications`. It was the
one table that was not, and the blocker was never the table — it was one index, for a reason that
is Postgres's own:

> A unique index on a partitioned table must include every partitioning column.

`messages_client_uq` on `(organization_id, conversation_id, client_id)` was the send dedupe — the
thing that makes a retried send one row instead of two. Adding `created_at` to it would not have
weakened that guarantee, it would have **deleted** it: two attempts seconds apart carry different
timestamps, so every retry would insert.

`notifications` survives the same constraint only because its `created_at` is the *event's*
`occurred_at` rather than the clock's, so a redelivery recomputes the same value and collides with
itself. A send has no such value to recompute.

**So the dedupe left Postgres.** `SendMessageUseCase` generates the id and the timestamp itself and
claims the client id with one `SET … EX … NX` before the transaction opens:

```
message:client:<organization>:<conversation>:<clientId>  →  { id, createdAt }, 24h
```

`false` means a retry: read the held pair back, `findById` it, and return that row without touching
the conversation, the outbox or the realtime fast path — so the two attempts stay indistinguishable,
which is exactly what `DO UPDATE … RETURNING` bought. `save()` is now a plain insert, and `client_id`
stays as a column with no index on it.

**The branch worth knowing about** is a claim whose row is not there: the first attempt set the key
and then rolled back. Sending as new is the only answer that does not lose the message, and the
claim is then taken over by the attempt that succeeds, so the next retry is deduped rather than
writing a third message. There is a spec pinned on exactly that.

Three alternatives were real. Two were rejected before the table was partitioned at all:

- **A unique index per partition**, created alongside each month by `MaintenanceGateway`. Correct,
  and it makes the generic partition loop carry a per-table index spec.
- **A non-partitioned side table** holding `(organization_id, conversation_id, client_id)`, written
  in the same transaction. Also correct, and it is an extra write on the hottest path in the slice.

The third is the one built: a cache key. It costs one Redis round trip on a path that already opens
a transaction, it needs no schema, and losing it is a duplicate message rather than a lost one —
which is the failure a chat client can already handle, because it dedupes by message id.

What partitioning buys is a manageable table and a ready detach-and-ship archive path, not a faster
page: the keyset cursor is a row constructor, which the partition pruner does not decompose, so a
conversation page still reads every month of that tenant. See
[partitions](../../../infrastructure/docs/reference/partitions.md) for the measurements.
Retention never drops a message: messages are domain data, so `retentionMonths` is `null`.

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
