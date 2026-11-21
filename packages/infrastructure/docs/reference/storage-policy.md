---
title: The bucket's lifecycle policy
description: Why a second gateway rather than a method on StorageGateway, why "no configuration" is an error code rather than an empty list, and why the app owns the whole configuration rather than one rule of it.
---

# `S3StoragePolicyGateway`

`StorageGateway` moves objects. This moves the **bucket's own policy**: one lifecycle rule per
retained table, saying how long an archived month lives in S3 before the bucket deletes it.

## Why it is a second port

`StorageGateway` excludes bucket, region and endpoint as adapter configuration — and a lifecycle rule is
exactly that, about no object. So the seam follows the subject, not the vendor: two gateways over one S3
client and one `S3Config`.

## The application owns the configuration, not a rule of it

`PutBucketLifecycleConfiguration` **replaces every rule** — S3 has no per-rule write or merge. So:

- `RetentionRules.lifecycleFor(rows)` composes the **whole** configuration from every row — hence
  `RetentionPolicyRepository.all()`, re-read after each save.
- Rules are **sorted by prefix**, so identical rows compare equal and the daily job does not rewrite.
- An empty list **deletes** via `DeleteBucketLifecycle` (a zero-rule `Put` is `InvalidArgument` on S3
  and MinIO) — leaving the last rule would expire objects by an invisible policy.

## Two prefixes, and only one of them comes from a row

`cold/<table>/` comes per retention row; `export/` is a flat seven days, present before any export
(rules must precede objects) — the one rule an empty `retention_policy` still writes; the first run applies
it, later runs nothing. Flat, not per tenant, as cold rules are per table: **a bucket holds at most a
thousand rules**.

## "No configuration" is an error, and treating it as one would never converge

A never-configured bucket answers **`NoSuchLifecycleConfiguration`**, not `[]` — propagated, the daily
reconcile would fail and report drift forever on every fresh bucket. `lifecycle()` maps that code
(read off `name` or `Code`, as the SDK varies) to `[]`; **MinIO answers the same**, so compose tests it
for real.

## A rule the app did not write is reported as absent

`lifecycle()` drops any rule with no prefix filter, and any whose expiry is a *date* rather than a
span of days. Both are legal S3 and neither is anything this system writes.

So the next `applyLifecycle` removes them — a rule with no row is drift; a hand-written one needs a row
or another bucket.

## Days, not months

Policy is months, S3 is days: `RetentionRules.daysFor` rounds **up** (`Math.ceil(months × 30.44)`) —
rounding down expires inside the asked window. The screen says "about".

## A colder class, and only one that reads back at once — `25.3`

Archived months are rarely read, so `S3_COLD_STORAGE_CLASS` and `S3_COLD_TRANSITION_DAYS` (both or
neither) become `coldTier()`, and `lifecycleFor(rows, tier)` adds a `Transition` to each `cold/<table>/`
rule.

- **Never `export/`** — a download needing restore is not a download.
- **Never at or after expiry** — S3 rejects the whole configuration, so that table just gets none.
- **Compared too** — `RetentionRules.describe` spells `cold/messages/=366>COLD@30`; a lost transition is
  drift and is restored.

**Only classes `GetObject` reads at once** (`restore()` and re-projection read directly): `STANDARD_IA`,
`ONEZONE_IA`, `GLACIER_IR`. `GLACIER`/`DEEP_ARCHIVE` are refused at boot — they need an hours-long restore
flow. **MinIO has tiers, not classes:** the `cold-tier` compose profile registers a second MinIO as `COLD`
([compose](../../../../docs/infra/reference/compose.md)); `lifecycle.smoke.spec.ts` proves `COLD` round-trips
and an unregistered name is refused.

## What is not here

**Per-tenant expiry** — prefix rules capped at 1,000 cannot express it. The per-table rule is the
**ceiling**; shorter tenant windows are the worker's sweep (D48), which is why the prefix is
`cold/<table>/`, not `cold/<table>/<organization_id>/`.
