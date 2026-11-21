# Visibility

Four independent reasons something is missing from a screen. Each only narrows the one above it.

| Mechanism | Owner | Reach | What the API says |
|---|---|---|---|
| **Flag** | engineering, temporary | the deployment, or a list of orgs | `NOT_FOUND` |
| **Entitlement** | platform admin | one org — a plan plus adjustments | `FORBIDDEN` |
| **Permission** | org admin | a role, or one user | `FORBIDDEN` |
| **Widget preference** | a user, or the org admin | one user, or the whole org | nothing — cosmetic |

- **A widget resolves flag → permission → admin preference → user preference** and reports the
  broadest cause as one `WidgetVisibility`: `visible` · `hidden-by-flag` · `denied` ·
  `hidden-by-admin` · `hidden-by-user` · `unregistered`.
- **Entitlement is a mask, not a step.** It narrows the `CapabilitySet` on the server, so `<Can>`,
  the nav, `RouteGuard` and `Authorizer.assert` obey a plan unaware. **Grants are filtered, never
  deleted** (an upgrade restores roles at once). `core` and `platform`-scope keys are never masked.
- **A flag check throws `NOT_FOUND` carrying no flag key** (`error.toJSON()` reaches the browser).
  **A flag is not a secret** — client-gating names are in the bundle.
- **A new flag or widget is a fragment file plus one spread** in `permissions`' `flag/` or `widget/`
  barrel. Every flag declares an owner and an expiry.

### Widget rules

1. **The smallest unit with its own reason to be absent** — a card, not its button.
2. **`policy` defaults to `required`.** Dismissible is a decision.
3. **The permission lives in the registry, never in props.** Only `goalId` comes from the call site.
4. **Registered ≠ resolved.** Declare every widget statically; resolve visibility per request.
5. **A preference is cosmetic** — a row, not an audit entry.
6. **Per-user denies are permanent; per-user grants carry a reason and expire** (30 days default,
   90 max).
7. **`<Can>` gates an affordance in a visible unit; `<Widget>` gates a unit.** Neither wraps the other.
8. **Inline widgets are `required`.** Preferences load with the zone's route, never the session.
9. **Never lazy-load by permission** — it hides nothing and adds a waterfall.
10. **Hiding is not revoking.** The API, bookmarks and nav still work, so the nav is `required`.

- **Mount points are zones** (`ZoneKey`, `<Zone>`, `ui-zone`), never "surfaces".
- **A platform admin is not a tenant owner.** `wildcard` is never set in production; platform
  admins hold tenant powers only inside the platform organization, and elsewhere only the role
  that tenant gave them.
- **A doc's access link adds no mechanism** — a page linked to a module, permission, flag or plan
  resolves through the first three and hides as `NOT_FOUND`
  (`packages/application/docs/reference/doc.md`).

Argument: [`docs/opinions/visibility.md`](../../opinions/visibility.md).
