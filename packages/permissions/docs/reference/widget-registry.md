---
title: WidgetRegistry
description: WidgetRegistry — the zones, the widgets registered to them, the six-word visibility answer, and why the whole thing is data with no React.
---

# `WidgetRegistry`

A card can be missing by flag, permission or someone's hide; the registry holds every such unit, and
`visibilityOf` answers "why is it gone".

```ts
WidgetRegistry.instance.visibilityOf("member.count", {
  capabilities,               // already masked by the org's plan
  flags,                      // the on-set for this org
  hiddenByAdmin, hiddenByUser,
});
// "visible" | "hidden-by-flag" | "denied" | "hidden-by-admin" | "hidden-by-user" | "unregistered"
```

Pure data, no React — zones resolve during SSR, and specs say what a role sees without rendering.

## The declaration

```ts
export const memberWidgets = {
  "member.count": {
    zone: "dashboard.main",
    permission: "member.read",
    policy: "dismissible",
    order: 20,
  },
} as const satisfies Record<string, WidgetMeta>;
```

- **`permission` is required, `null` included** — ungated is stated, and never a prop.
- **`policy` defaults to `required`**; `dismissible` lets a user, or an admin for everyone, hide it.
- **Inline widgets have no `zone` and must be `required`** — preferences load with a zone's route; the
  type refuses the combination.

## The order, broadest cause first

Unregistered → flag → permission → admin preference → user preference; the first that hides answers (a
hidden card the role no longer grants reads `denied`). Required widgets ignore preferences, so a stale row
cannot hide the nav. Entitlement already narrowed `capabilities`, so it reads as `denied`.

## Zones

```ts
ZONES; // ["dashboard.main"]
```

`<page>.<region>`; one zone, so a tuple is the whole declaration. `forZone` sorts by `order`;
`ZoneWidgetKey<"dashboard.main">` types a zone's component map, so a missing or foreign widget fails to
compile.

## The nav is required, and the spec says why

Hiding is not revoking; the nav is the last path to every capability, so it is `required`. A spec asserts
every dismissible widget's permission belongs to a module some nav gate opens — joined on the
permission's module, since the `document` gate asks for `ai.embedding.read`.
