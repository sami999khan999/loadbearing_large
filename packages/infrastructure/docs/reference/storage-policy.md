---
title: The bucket's lifecycle policy
description: Why a second gateway rather than a method on StorageGateway, why "no configuration" is an error code rather than an empty list, and why the app owns the whole configuration rather than one rule of it.
---

# `S3StoragePolicyGateway`

`StorageGateway` moves objects. This moves the **bucket's own policy**: one lifecycle rule per
retained table, saying how long an archived month lives in S3 before the bucket deletes it.

## Why it is a second port

`StorageGateway`'s header says "no bucket, no region, no endpoint — those are adapter
configuration". A lifecycle rule is exactly those things: it names a bucket, it is not about any
object, and no use-case that stores a file has any business reaching it.

So the seam is drawn where the subject changes rather than where the vendor does. Two gateways over
one S3 client, and the container builds both from the same `S3Config`.

## The application owns the configuration, not a rule of it

`PutBucketLifecycleConfiguration` **replaces every rule on the bucket**. There is no per-rule
write, and there is no merge — S3 offers neither.

That decides the shape of everything above it:

- `RetentionRules.lifecycleFor(rows)` takes **every** retention row and composes the whole
  configuration, which is why `RetentionPolicyRepository.all()` exists and why the update use-case
  re-reads all of them after it saves one.
- The rules are **sorted by prefix**, so two runs over the same rows compare equal. Without that,
  the daily job would see a difference whenever the row order changed and rewrite the bucket for
  nothing.
- An empty list **deletes** the configuration, with `DeleteBucketLifecycle` rather than a `Put` of
  zero rules — S3 and MinIO both answer `InvalidArgument` to that. Deleting is the honest reading
  of "no row names a cold window"; the alternative, leaving the last rule in place, is a bucket
  expiring objects to a policy nobody can see any more.

## Two prefixes, and only one of them comes from a row

`cold/<table>/` is composed per retention row. `export/` is not: it is a flat rule at seven days,
present whether or not anyone has ever exported a tenant, because a lifecycle rule has to exist
before the objects it governs do.

That is the one thing an empty `retention_policy` still writes. A fresh deployment's first
`retention` run applies one rule and every run after it applies none — which is the same
converge-then-stop behaviour the rest of this page describes, starting from one rather than zero.

The `export/` rule is flat rather than per tenant for the reason the cold rules are per table
rather than per tenant-month: **a bucket takes at most a thousand lifecycle rules**, and one per
customer is a ceiling with a date on it.

## "No configuration" is an error, and treating it as one would never converge

A bucket that has never had a lifecycle configuration answers `GetBucketLifecycleConfiguration`
with **`NoSuchLifecycleConfiguration`**, not with an empty rule list. Letting that propagate is the
failure worth naming: the daily reconcile would read a failure, apply nothing, report drift, and do
the same thing again tomorrow, forever, on the one deployment shape where it most needs to work —
a fresh bucket.

So `lifecycle()` catches that one code and answers `[]`. The code is read off `name` for an error
the SDK models and off `Code` for one it only saw on the wire, because the AWS SDK surfaces it in
both places depending on which.

**MinIO answers with the same code**, which is what makes the local compose stack a real test of
this path rather than a rehearsal of it.

## A rule the app did not write is reported as absent

`lifecycle()` drops any rule with no prefix filter, and any whose expiry is a *date* rather than a
span of days. Both are legal S3 and neither is anything this system writes.

Reporting them as absent rather than as rules means the next `applyLifecycle` removes them — which
is correct: the bucket's configuration is derived from the rows, and a rule with no row behind it
is drift by definition. A deployment that wants a hand-written rule on this bucket needs a row, or
a different bucket.

## Days, not months

The policy is written in months and S3 counts days, so one of the two has to give.
`RetentionRules.daysFor` rounds **up** — `Math.ceil(months × 30.44)` — because rounding down
expires an object inside the window an operator asked for, and that is the direction that loses
data. The screen says "about", which is the honest word for it.

## What is not here

**Storage classes.** Moving an object to Glacier is a `Transition` rather than an `Expiration`, and
nothing in this system reads a Glacier object back yet — a restore would have to wait hours, which
is a different feature from the one `restore()` provides. Filed, not built.

**Per-tenant expiry.** Lifecycle rules match a prefix and are capped at 1,000 per bucket, so a rule
per tenant-month is not available at any tenant count worth having. The per-table rule is the
**ceiling**, and a tenant that asked for something shorter is enforced by the worker's sweep. That
split is decision D48, and it is the reason `cold/<table>/` is the prefix rather than
`cold/<table>/<organization_id>/`.
