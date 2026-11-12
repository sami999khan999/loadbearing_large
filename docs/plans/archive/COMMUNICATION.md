---
title: Communication — messaging, email, notifications, deferred whole
updated: 2026-09-22
owner: sami
source: Phase 26, moved out of plans/BACKLOG.md on 2026-09-22
---

# Communication

**Not a ledger.** `plans/BACKLOG.md` is still the only one. This is where the communication work
went, and nothing here has an order, an estimate, or a tick.

Phase 26 was eight boxes in the backlog and **nothing in it was blocked** — every item could have
been built against the local stack the day it was filed. It moved here anyway, because the entries
share a requirement none of them stated: **messaging, email and notifications must not slow the
app down.** Each one was written as a feature and they are, together, a performance and isolation
problem. That is a different plan, written later, against these as its input.

---

## The work

### Messaging

- `26.1` — threads, reactions, attachments.
- `26.5` — replay on reconnect: Redis Streams behind `RealtimeSubscriber`, so a resume is a real
  replay rather than "throw your cache away and refetch".
- `26.6` — a cluster-wide stream cap, and presence derived from open streams.
- `26.4` — old `messages` partitions archived to S3. **Parked pending a discussion**, separately
  from the rest: `messages` is `retentionMonths: null` by decision D47 and is never dropped by the
  calendar, so this reopens a decision rather than building on one.
- `26.8` — the 250 000-recipient fan-out load test. Wants a machine that can afford a `users` row
  per recipient.

### Email

- `26.11` — SMTP configurable from the dashboard. Filed as "move from SMTP to a provider API"; the
  decision below replaces that.
- `26.10` — a delivery log. Its own trigger is that "was this sent?" cannot be answered from Loki
  or a provider log — and letting tenants bring their own SMTP makes that moment far more likely,
  because a tenant's mail host has no log anyone here can read.

### Notifications

- `26.3` — web push.
- `26.7` — per-tenant digest hour, channel mentions, notification grouping. Also holds the
  recipient list, count and opt-out that `23.4` called product work.

---

## Decisions already taken

Reached on 2026-09-22 and recorded so nobody pays for them twice.

- **SMTP is a platform default plus an optional per-tenant override.** Not one or the other.
- **`auth.*` mail always uses the platform sender.** A tenant misconfiguring their mail host must
  never be able to lock people out of signing in. `member.invitation` and `notification.*` use the
  tenant's sender when set and fall back to the platform's.
- **Tenant SMTP passwords are encrypted at rest** under a new `MAIL_SECRET_KEY`, behind a
  `SecretCipher` port, with the dashboard field write-only — set it, never read it back. Per-tenant
  SMTP is what forces this: the environment holds one password and tenants need many.
- **Not derived from `AUTH_SECRET`.** Rotating the cookie-signing secret must not silently break
  every tenant's mail.
- **Web push ships whole or not at all** — port, adapter, VAPID keys, subscriptions table, service
  worker — which is rule `5.11`. It becomes a third channel in the existing preference grid beside
  `in_app` and `email`, at `immediate` or `off`; a digest push means nothing.
- **Presence is visible in conversations**, not an internal metric.

---

## Three things the archived entries get wrong

Found while researching on 2026-09-22. Cheap to write down, expensive to rediscover.

- **`26.1` assumes `messages` is unpartitioned.** It is partitioned now — tenant, then month — so
  the primary key is `(id, organization_id, created_at)` and a thread's `parent_id` cannot
  reference `id` alone. `archive/COMMUNICATION-PLAN.md`'s `C5.4` note is stale.
- **`StorageGateway.presignUpload` already exists**, with an S3 adapter and a fake, and has **no
  production caller**. Attachments are a table and a use-case, not a pipeline.
- **`26.5`'s stated precondition is already met.** `R.27` — CORS omitting `last-event-id`, so a
  cross-origin stream could never resume — was fixed on 2026-09-20.

And one that is only half wrong: `26.4` names `PgActivityArchiveGateway`, which was renamed to
`PgPartitionArchiveGateway` and generalised over `PartitionedTableName`. The mechanism it says to
copy already covers `messages` structurally, so the item is smaller than its entry implies — it is
a policy decision far more than it is a pipeline.

---

The full original text of every item is in
[`archive/PLAN.md`](PLAN.md) under the same IDs, and in
[`archive/COMMUNICATION-PLAN.md`](COMMUNICATION-PLAN.md) under `C6.1`–`C6.11`. Neither is
edited: a file in `archive/` records what was believed when it was written.
