---
title: Membership enrolment
description: Why a session is refused to a user with no membership, the three modes that give them one, and why tenancy is a binding in the DI root rather than a policy baked into an adapter.
---

# Membership enrolment

`AuthFactory` refuses a session to a user who belongs to no organization:

```ts
const organizationId =
  (await memberships.activeOrganizationFor(userId)) ?? (await enroller.enrol(userId));

if (!organizationId) return false;
```

That is the tenancy gate, and everything on this page exists because of it. A sign-up that produces
an account and no membership produces a user who can never sign in — correctly, and with nothing in
either log saying why. **Enrolment is what stops the gate being a wall.**

## Why it runs from `session.create.before`

Not `user.create.after`. Better Auth queues `create.after` hooks until the whole sign-up endpoint has
finished, which is *after* the session hook has already run and refused the session. The session
hook is the first moment a membership can exist and still be seen by the code that needs it.

It costs nothing on the sign-in path: `activeOrganizationFor` answers on every session after the
first, so `enrol` runs exactly once per user, ever.

## Three modes, one binding

`AUTH_ENROLMENT_MODE` picks one of three `MembershipEnroller` implementations, and `Container` is
the only place in the system that branches on it:

| Mode | Implementation | What a new user gets |
|---|---|---|
| `personal` *(default)* | `PgPersonalOrganizationEnroller` | An organization of their own, seeded with the four system roles, and `owner` in it |
| `bootstrap` | `PgBootstrapMembershipEnroller` | Membership of the one organization named by `BOOTSTRAP_ORGANIZATION_SLUG` — first in as `owner`, everyone after as `member` |
| `invite` | `NullMembershipEnroller` | Nothing. Their first sign-in is refused until something else grants membership |

**Tenancy is the decision a starter kit is most likely to be forked over**, which is why it is a
binding rather than a policy inside one adapter. Adding a fourth mode is a class and one line in
`Container.enroller`; nothing above it moves.

`personal` is the default because it is the only mode that works against an empty database. A fresh
clone can sign up and be signed in without `pnpm db:seed` having run, and the second person to sign
up gets their own tenant rather than joining the first person's.

`bootstrap` is right for a demo or a single-tenant install and **wrong for anything reachable from
the internet**: with it on, the sign-up form hands out membership of your organization to whoever
finds it.

`invite` is the posture for a deployment that has built invitations. It is not a disabled state —
`NullMembershipEnroller` is a real implementation returning a real answer, and the refused session
is the system working.

## The lock, and what it is protecting

Both Postgres enrollers do the whole read-decide-write inside one transaction behind
`pg_advisory_xact_lock`. They lock on different things, and the difference is the point:

- **Bootstrap locks the organization.** Two sign-ups racing on an empty organization both read "no
  members yet" and both land as `owner`. `owner` is the wildcard role, so the cost of losing that
  race is a second account holding every permission in the registry.
- **Personal locks the user**, because the organization does not exist yet. Losing that race means
  two organizations and two owner memberships for one person, with the session hook free to pick
  either — so half their data lands in a tenant they cannot reach.

Both re-check for an existing membership *inside* the lock, which is what makes a retried request
return the organization the first attempt chose rather than enrol the user twice. Better Auth does
retry.

## `SystemRoleSeed` is reused, not reimplemented

`PgPersonalOrganizationEnroller` calls the same class `pnpm db:seed` calls, constructed with the
same `TransactionScope` so its writes land inside the enrolment transaction. That is not a
convenience: it resolves `owner`'s wildcard through `PermissionRegistry.instance.all()`, so an
organization created at sign-in holds exactly the grants a seeded one would. A second copy of that
logic is a second permission model, and the divergence would first show up as one tenant being
unable to use a feature every other tenant has.

Making that reuse possible is why the runnable seed script moved to `packages/infrastructure/seed.ts`,
above `src/`. It used to be `src/pg/seed/index.ts` — the folder barrel — so importing it for
`SystemRoleSeed` would have connected to Postgres and called `process.exit` in the middle of a
sign-in.

## Naming a tenant nobody named

A personal organization is named after its owner and slugged from their id:

```ts
slug: `u-${userId}`,
name: user.name,
```

The name is the user's own, so `packages/infrastructure` writes no English and needs no locale to
name a row. The slug is derived from the id rather than from the name or the email because a slug
built from user input needs a normalisation pass and a collision strategy — and
`organizations_slug_uq` would otherwise turn the second person called Grace Hopper into a failed
sign-in. Nothing routes by slug today; when something does, that is the moment to give it a real
one.

## Related

- [`principal-builder.md`](./principal-builder.md) — what the resolved tenant is used for.
- [`capability-cache.md`](./capability-cache.md) — the cache keyed on `organization:user`.
