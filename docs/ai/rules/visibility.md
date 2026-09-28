# Visibility

Four independent reasons something is missing from a screen. Each can only narrow the one above
it, and each has a different owner.

| Mechanism | Owner | Reach | What the API says |
|---|---|---|---|
| **Flag** | engineering, temporary | the deployment, or a list of orgs | `NOT_FOUND` |
| **Entitlement** | platform admin | one org — a plan plus adjustments | `FORBIDDEN` |
| **Permission** | org admin | a role, or one user | `FORBIDDEN` |
| **Widget preference** | a user, or the org admin | one user, or the whole org | nothing — cosmetic |

- **A widget resolves flag → permission → admin preference → user preference**, and reports the
  broadest cause. The answer is one `WidgetVisibility`: `visible` · `hidden-by-flag` · `denied` ·
  `hidden-by-admin` · `hidden-by-user` · `unregistered`.
- **Entitlement is a mask, not a step.** It narrows the `CapabilitySet` on the server, so `<Can>`,
  the nav, `RouteGuard` and `Authorizer.assert` obey a plan without knowing it exists. **Grants
  are filtered, never deleted** — an upgrade restores the org admin's roles at once. `core` and
  `platform`-scope keys are never masked.
- **A flag check throws `NOT_FOUND`, and the error carries no flag key.** `error.toJSON()` reaches
  the browser. Client-gating flag names are in the bundle anyway: **a flag is not a secret.**
- **A new flag or widget is a fragment file plus one spread** in `permissions`' `flag/` or
  `widget/` barrel. Every flag declares an owner and an expiry date.

### The rules for a widget

1. **The smallest unit with an independent reason to be absent** — a card, not the button in it.
2. **`policy` defaults to `required`.** Dismissible is a decision.
3. **The permission lives in the registry, never in props.** Only `goalId` comes from the call
   site.
4. **Registered ≠ resolved.** Declare every widget statically; compute its visibility per request.
5. **A preference is cosmetic** — a row, not an audit entry, and it changes nothing anyone can do.
6. **Per-user denies are permanent; per-user grants carry a reason and expire** — 30 days by
   default, 90 at most.
7. **`<Can>` gates an affordance inside a visible unit; `<Widget>` gates a unit.** Neither wraps
   the other.
8. **Inline widgets are `required`.** Preferences load with the zone's route, never the session.
9. **Never lazy-load by permission.** It hides nothing and adds a waterfall to the allowed path.
10. **Hiding is not revoking.** The API, a bookmark and the nav still work — which is why the nav
    is `required` and never hideable.

- **The mount point is a zone, never a surface.** `ZoneKey`, `<Zone>`, `ui-zone`.
- **A platform admin is not a tenant owner.** `wildcard` is never set in production, and a
  platform admin gets no powers inside a tenant.

---

**The argument.**
[`docs/opinions/visibility.md`](../../opinions/visibility.md) — the four mechanisms, the resolution
order, why entitlement is a mask, and the ten rules for a widget.

When this file and `docs/opinions/` disagree, **`docs/opinions/` wins and this file is stale;
say so.**
