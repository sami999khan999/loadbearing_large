---
title: Notification recipients
description: Four ways to resolve an audience, the correlated EXISTS that keeps one of them a single statement, and the one read that is deliberately two.
---

# `PgNotificationRecipientReader`

Four questions, one per audience a `NotificationPolicy` row can name: everyone in the tenant,
everyone in a conversation, one subject, and a page of ids the digest already has.

Each is **tenant-scoped and joined through `memberships`** — an unscoped list is a cross-tenant leak
with emails attached, and `memberships` (not `users`) stops notifying deactivated members.

## `organizationMembers` and the correlated `EXISTS`

`holding` narrows to members whose role grants a permission, via a correlated `EXISTS` on
`role_permissions` against the membership's `role_id` — **one statement**. A join multiplies rows (then a
`DISTINCT` over everything); a role-id query is a second round trip and an unbounded array. Keyset on
`user_id`: the digest pages a tenant, and `OFFSET` reads every skipped row.

## `conversationMembers` is two statements, and that is the design

`conversation_members` is **routed** and `users`/`memberships` **catalog** — one join worked on one
Postgres and has no plan across databases. So it is split (D15), *before* the transaction:

1. `ConversationRepository.memberIds(organizationId, conversationId, limit)` on the routed shard.
2. `users(organizationId, memberIds)` on the catalog — already written, already one statement,
   already applying the `deactivatedAt` filter this needs.

**Two queries per fan-out, not per recipient** — per recipient turns a fan-out into an outage. The cap
now applies to the routed read ("up to N members, minus deactivated"); `RECIPIENT_LIMIT` is 500, a fan-out
ceiling, so the difference is unobservable. Ids are ordered and re-sorted for stable results. **No
exemption:** §22 fails a cross-placement repository, and the exemption set exists to be empty.

## What this reader deliberately does not do

It does not drop the actor (`DeliverNotificationUseCase` knows who caused the event) or resolve copy;
an unknown locale falls back to `en`. See also [sharding](sharding.md) for what `routed` and `catalog` mean, and
[the notification policy](../../../application/docs/reference/notification-policy.md) for which
audience each event asks for.
