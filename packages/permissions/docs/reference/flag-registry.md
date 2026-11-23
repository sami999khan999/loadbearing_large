---
title: FlagRegistry
description: FlagRegistry — flags declared in code with an owner and an expiry, switched in Postgres, and the client-gating set derived from widgets rather than declared.
---

# `FlagRegistry`

A flag is a rollout — on for the deployment or some orgs while unfinished, then deleted. The failure is
the flag nobody deletes, a permanent unexplained `if`, so each is declared with the facts that make
deleting it someone's job:

```ts
export const widgetFlags = {
  "widget.dismissal": {
    owner: "sami",
    expiresOn: "2027-03-31",
    description: "Lets a user hide a dismissible dashboard card, …",
  },
} as const satisfies Record<string, FlagMeta>;
```

Whether it is **on** lives in Postgres (deployment or per org); a missing row means off.

## The key

`<slice>.<change>`, where the change is a kebab noun: `widget.dismissal`. — what changes, not what it guards.

## Client-gating is derived

```ts
FlagRegistry.instance.clientGating(); // the flags some widget names
```

Only these reach the session payload, built at module load from `WIDGETS` — a hand-written list, once
forgotten, ships server-only names to browsers. Names are still not secret (the widget naming one is in
the bundle): **a flag decides when something ships, not who may know it exists** — hence `NOT_FOUND` with
no key.

## `meta` answers `undefined` for a flag it does not know

A row can outlive its flag (retiring deletes the declaration first), so the platform list shows it as
orphaned rather than failing.

## What CI holds it to

`check-architecture.mjs` fails a flag past `expiresOn` or unread outside `flag/`; zero flags is the
normal state and passes.
