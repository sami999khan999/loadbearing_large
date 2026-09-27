---
title: Access and visibility plan — flags, entitlement, per-user overrides, the platform deny, widgets and zones
updated: 2026-09-27
owner: sami
schema: plan/v1
source: tree at 8944903 (dev), 2026-09-27; three read-only surveys (the server authorization model, the client and session path, the plan and CI conventions) and one design pass, checked against the tree
---

# Access and visibility plan

## Resume here

**Not started.** Written and agreed 2026-09-27; `BACKLOG.md` §13 points here, one line per
phase, and nothing else in `plans/` does. Tick boxes here while the plan is live. When it is built
it moves to `plans/archive/` with a row in `plans/archive/index.md`, and whatever is still open
becomes boxes in `BACKLOG.md` §13, as `COMMUNICATION-PERFORMANCE-PLAN.md` did.

### What is outstanding

| Phase | Open items |
|---|---|
| 1–11 | all |

### Running it again

```bash
pnpm build:packages && pnpm --filter @loadbearing/web build && pnpm --filter @loadbearing/worker build
pnpm check:architecture      # 29/29 today; 30/30 after Phase 3; 31/31 after Phase 8; no "○ skipped"
pnpm typecheck && pnpm lint && pnpm test
pnpm check:contrast          # after Phase 7
pnpm infra:up && pnpm db:migrate && pnpm db:seed && pnpm dev
pnpm --filter @loadbearing/infrastructure test && pnpm smoke
```

> **How to use this file**
>
> 1. Every item has a unique ID (`AX4.2`). Never reuse or renumber one. `AX` is new; `S`, `P`,
>    `C`, `CR`, `A`, `CP`, `R`, `PF`, `T-` and `D` are taken.
> 2. Change progress by editing the checkbox marker only: `[ ]` todo · `[~]` in progress ·
>    `[!]` blocked · `[x]` done · `[-]` dropped. Add `done: YYYY-MM-DD` when closing, and
>    `unverified:` naming the command when the proof needs a container the executor lacks.
> 3. **Order.** Phase 1 first — the rules are written before any fragment exists. Phase 2 needs 1.
>    Phases 3 and 4 need 2 and are independent of each other. Phase 5 needs 4 (the mask).
>    Phase 6 needs 5 (the `authority` column). Phase 7 needs only 1. Phase 8 needs 3 and 7.
>    Phase 9 needs 8. Phase 10 needs 5 and 9. Phase 11 is last. Inside a phase, items run top to
>    bottom unless **Depends on** says otherwise.
> 4. Every item that touches code names the doc it must update. A code change with the doc
>    untouched is not done. `docs/opinions/` wins over `docs/ai/rules/`.
> 5. **A new permission key lands with its procedure, its contracts mapping and its use-case
>    `assert` in one commit** — `check-architecture` §28 fails otherwise. A new tenant key also
>    needs a grant migration shaped like `0039_analytics_grants.sql`, because `SystemRoleSeed`
>    only runs for the bootstrap tenant and for new ones.
> 6. No new package or app, so no new commitlint scope. One commit per layer, as
>    `docs/ai/skills/add-slice.md` orders them. No author or tool trailers
>    (`docs/ai/rules/workflow.md`).
> 7. Defects found while executing go to the bottom of the phase they were found in.
> 8. Migration numbers below (`0042`–`0048`) are the expected next free numbers. If other work
>    lands first, take the next free one; the ID of the item does not change.

---

## Context

The design text of 2026-09-27 ("Widget, permission, and extension model") describes four
independent ways something can be absent from a screen, and one answer to "why is it gone".

| Mechanism | Owner | Reach | Lifetime | What the API says |
|---|---|---|---|---|
| **Flag** | engineering | the deployment, or a list of orgs | temporary — deleted after rollout | `NOT_FOUND` |
| **Entitlement** | platform admin | one org | as long as the org exists | `FORBIDDEN` |
| **Permission** | org admin | a role, or one user | ongoing | `FORBIDDEN` |
| **Widget preference** | a user, or the org admin | one user, or the whole org | persists | nothing — it is cosmetic |

Each layer can only narrow the one above it. A widget resolves in the order
**flag → permission → admin preference → user preference**, broadest cause first, so the reason
reported is the fundamental one. Entitlement is not a step in that chain: it narrows the
`CapabilitySet` on the server, so it is already inside the permission answer by the time a widget
asks.

Today this repo has the permission layer and nothing else:

- **No flags.** The only switch is `Env.googleEnabled`.
- **No entitlement.** `organizations` has no plan, and every tenant holds whatever its roles grant.
- **Per-user overrides exist as data and nowhere else.** `permission_overrides` has `grant` and
  `deny` rows, and `PgCapabilityRepository` already reads them with deny winning. But nothing
  writes them, and a grant never expires.
- **No widgets, zones or dashboard.** `/` shows a member count and the module list, outside the
  authenticated layout.

The request: plan all of it, except the extension model, which the user scrapped on 2026-09-27.

### Decisions recorded up front (do not re-litigate)

1. **"Super admin" means platform admin** — a holder of `platform.*` keys through a membership in
   the one organization marked `is_platform`. `wildcard` is never set from anything and stays
   `false` in production. Setting it for a platform admin would make them an owner inside every
   tenant, which `packages/permissions/docs/reference/platform-scope.md` closes on purpose.
2. **Entitlement is plans plus per-org adjustments**, the most flexible of the three models offered.
   - A plan is a named set of permission keys. Every org is on exactly one plan.
   - An adjustment adds or removes one key for one org, with an optional expiry. A trial is an
     expiring `add`.
   - Entitlement is stored as **permission keys**, never module keys. A module is only a
     convenience in the editor: ticking one writes `PermissionRegistry.byModule(m)`.
   - `core`-module keys and `platform`-scope keys are never subject to it.
   - **Grants are filtered, never deleted.** Role rows are the org admin's data; entitlement is a
     mask over them, so an upgrade restores their configuration at once.
   - **`unlimited` is a property of a plan (`is_unlimited`), resolved at read time as every
     tenant-scope key.** It is not a set of rows reconciled by `db:seed`. Rows would hide every new
     key from every tenant on any deploy that skipped the seed. Every existing org lands on
     `unlimited` through the column default, so the deploy changes nothing anyone can do.
   - **A module kill switch lives in the same mask** — deployment-wide, for an incident, and
     untouched by plan data.
3. **Flags live in Postgres, on for the deployment or for a list of orgs.**
   - There is no percentage rollout.
   - Code declares every flag statically — key, owner, expiry date and description. CI fails a
     flag past its expiry, or one that nothing reads.
   - The server check throws `NOT_FOUND`, and **the error carries no flag key**:
     `ErrorInterceptor` sends `error.toJSON()` to the browser, and a server-only flag's name must
     not reach it.
   - Only the *on-set* of *client-gating* flags — those some widget names — rides the session.
4. **No cache version stamp.** `capability-cache.md` already rejects a generation counter as a
   second Redis round trip on every request. Invalidation stays as it is: delete, then repeat the
   delete two seconds later. Plan edits and the kill switch get one new `invalidateAll()`.
   The one real gap this exposes — **an open conversation stream keeps the permissions it opened
   with** — is fixed in Phase 6.
5. **Per-user overrides reuse `permission_overrides`.**
   - Denies are permanent by default.
   - Grants must carry a reason and must expire: 30 days by default, 90 at most.
   - A grant never rises above entitlement, because the mask filters every grant.
   - `requires` implications are closed over **on write only**. Applying them on read would take
     access away from existing roles on the day it deploys.
6. **The platform deny is two things.**
   - Per-key denies in one org, written with `authority = 'platform'`. The org admin sees them and
     cannot clear them.
   - An **account suspend** for a compromised account. It uses `users.deactivated_at`, renamed
     `suspended_at` — the column already exists and nothing reads it. The suspend refuses the
     session everywhere and ends live sessions. It also catches keys added to the catalog after it
     was set, which a list of per-key denies never would.
7. **The mount point is a "zone", never a "surface".** `--surface` is one of the twelve colour
   tokens (25 source files) and "surface" already means a package's import surface. So the names
   are `ZoneKey`, `<Zone>`, `ui-zone`, and zone keys shaped like `dashboard.main`.
8. **Each zone's component map is a total record over the widgets registered to that zone**,
   required ones included, so all of them sort together by `order`.
   - It is typed `satisfies Record<ZoneWidgetKey<"dashboard.main">, …>`. A missing key, or a key
     from another zone or an inline widget, is then a compile error, not a grep.
   - Maps are per zone and never in the `feature` barrel, which keeps code splitting per route.
   - `<Zone>` takes an `items` array, not children, so `<Can>` cannot be its direct child.
9. **Inline widgets are `required` by type, and widget preferences stay off the session payload.**
   - `fetchSession` runs on every document request. Preferences are routed data and do not help
     build a principal, so carrying them there would add a routed read to every page.
   - The zone's route loader loads them instead.
   - **Reopen when** the first dismissible inline widget is wanted: preferences move into
     `SessionSnapshot`, a local change to one server function and one type.
10. **The dashboard is `/dashboard`**, inside the authenticated layout. `/` redirects a signed-in
    user there and stays the signed-out landing page. Today's `MemberCount` and `ModuleNav` become
    its first two widgets.
11. **The registries live in `packages/permissions`, with no React.**
    - Pure data means a zone resolves during SSR, and a spec can say what a role sees without
      rendering anything.
    - `flag/` and `widget/` are fragment folders like `gate/` and `route/`. The registries sit in
      `registry/` beside `PermissionRegistry`.
    - A new flag or widget is a fragment file plus one spread in a platform-owned barrel.
12. **The last path to a capability is the nav, not a command palette.** No palette exists. The nav
    is `required` and never hideable. A spec asserts that every dismissible widget's permission
    belongs to a module some nav gate opens, so hiding a card never removes the only way in.
13. **Out of scope:** extensions, slots, themes as extensions, extension routes, the client-portal
    key space, percentage rollout and nested widgets (a `parent` field). The last section of this
    file says what each would need.

### Where this plan departs from the design text

| The text says | This plan does | Why |
|---|---|---|
| `wildcard: principal.isSuperAdmin` | Dropped; decision 1 | A tenant's wildcard is kept off platform keys on purpose, and platform admins get no tenant powers |
| "Surface" | "Zone"; decision 7 | The name already means a colour token and an import surface |
| §15: no map may name a required widget | A zone map is total over its own zone; decision 8 | The text contradicts itself: §4 marks `finance.outstanding` required and §9 puts it in the map |
| §15: three CI scripts | Two type checks and two `check-architecture` assertions (§30, §31) | The type system catches a wrong map key at compile time; the slot check went with extensions |
| `widgetPrefs` in the session payload | Loaded by the zone's route; decision 9 | A routed read on every document request, for a value only the dashboard reads |
| `<Widget>` for dismissible inline elements | Inline widgets are `required` | Follows from decision 9, with a reopen trigger |
| An org-level version stamp in the cache key | Delete, repeat, and `invalidateAll`; decision 4 | Already argued in `capability-cache.md` |
| A `required` command palette | The nav-path spec; decision 12 | No palette exists, and the nav already enumerates every module |
| `execute(input, principal)`, `assert(key, principal)` | `execute(principal, input)`, `assert(principal, key)` | The repo's signatures |
| Finance, invoice and task examples | `member.count`, `core.module-nav`, `notification.bell` | Those modules do not exist here |
| One per-principal deny | Per-key denies plus an account suspend; decision 6 | A list of keys misses keys added later |

### What exists and is reused (verified against the tree at `8944903`)

- **`CapabilitySet`** (`packages/permissions/src/capability/capability-set.ts`):
  - three axes — org, goal and platform;
  - deny beats grant and wildcard;
  - `core` keys are held by everyone;
  - `intersect()` empties the platform axis.
  - The mask narrows the DTO before `from()`; the class does not change.
- **The fragment pattern** — `catalog/`, `gate/` and `route/`, merged by spreads in a barrel, with
  a registry singleton over module-level frozen maps (`permission-registry.ts`,
  `module-registry.ts`). Flags and widgets copy it exactly.
- **`permission_overrides`** (`packages/infrastructure/src/pg/schema/rbac.schema.ts:144`) and
  **`PgCapabilityRepository`**. The repository reads overrides in both `resolveFor` and
  `resolvePlatformFor`, and a platform deny is already a tier-org row with `effect = 'deny'`.
- **`CapabilityCache`** (`packages/auth/src/principal/capability.cache.ts`) — 60 s TTL,
  `invalidate`, `invalidateOrganization` and `invalidatePlatform`, each repeated after 2 s.
- **`users.deactivated_at`** (`auth.schema.ts:36`, `auth.factory.ts:88`), declared and unread.
- **The notification-preference slice** — the full-stack template for a per-user preference, down
  to the routed table partitioned by tenant.
- **`fetchSession`** (`apps/web/src/server/session.fn.ts`) → `SessionSnapshot` → `RouterContext`
  → `SessionProvider`. Flags ride this path.
- **In `ui`:** `<Can>` (returns its children bare), `EmptyState`, `DataTable`, `StatusBadge` and
  the kitchen sink at `apps/web/src/route/(dev)/kitchen-sink.tsx`.
- **In `feature`:** `PermissionMatrix` (`excludeScopes` already exists), `RoleMatrix`,
  `EffectivePermissionsInspector`, `ModuleNav` and `renderWithFakes`.
- **`platform_policy`** — the precedent for a singleton platform switch.
- **The maintenance consumer's `cleanup()`** — where the expiry sweeps run.
- **`check-architecture.mjs`** — `spreadFragments()` reads a catalog barrel, and §28 is the model
  for "declared but unused".

---

## The phases

### Vocabulary fixed up front

| Thing | Name |
|---|---|
| Flag key | `<slice>.<change>`, a kebab noun — `widget.dismissal` |
| Widget key | `<module>.<name>`, where `<module>` is in `PermissionRegistry.modules()` — `member.count` |
| Zone key | `<page>.<region>` — `dashboard.main` |
| Visibility union | `WidgetVisibility`: `visible` · `hidden-by-flag` · `denied` · `hidden-by-admin` · `hidden-by-user` · `unregistered` |
| Role suffixes (new) | `.flags.ts`, `.widgets.ts` (catalog fragments); `.actions.ts` recorded (already in use, never listed) |
| Role folders (new) | `permissions/src/flag/`, `permissions/src/widget/` |
| Registries | `FlagRegistry`, `WidgetRegistry` (`packages/permissions/src/registry/`) |
| Mask | `EntitlementMask` (`packages/permissions/src/capability/entitlement-mask.ts`) |
| Tables (catalog) | `feature_flags`, `feature_flag_organizations`, `plans`, `plan_permissions`, `entitlement_adjustments`, `disabled_modules`; column `organizations.plan_key` |
| Table (routed) | `widget_preferences`, `PARTITION BY LIST (organization_id)`, no month level |
| Columns | `permission_overrides.{expires_at, created_by, authority}`; `users.suspended_at` (renamed from `deactivated_at`) |
| Platform keys | `platform.flag.read` · `.flag.manage` · `.entitlement.read` · `.entitlement.manage` · `.module.manage` · `.account.read` · `.account.manage` |
| Tenant keys | `rbac.override.read` · `rbac.override.manage` · `widget.default.manage` · `core.widget.customize` (core: held by everyone) |
| Ports and classes | `FlagRepository`, `FlagCache`, `EntitlementRepository`, `PermissionOverrideRepository`, `AccountRepository`, `SessionGateway`, `WidgetPreferenceRepository`; `CapabilityInvalidator.invalidateAll()`, `CapabilityRepository.entitlementFor()` / `.explainFor()` |
| Error code | `ACCOUNT_SUSPENDED` |
| Routes | `/dashboard`, `/settings/widgets`, `/platform/flags`, `/platform/entitlements`, `/platform/accounts` |
| Content namespace | `widget` (new); `platform`, `role`, `member` grow |
| New docs pages | `docs/opinions/visibility.md`, `docs/ai/rules/visibility.md`, `packages/permissions/docs/reference/{flag-registry,widget-registry,entitlement-mask}.md` |

---

### Phase 1 — The rules, written before the first fragment

**Goal.** Every name and rule this plan introduces is in `docs/opinions/` and its digest before any
code uses it. Anyone who authors a second fragment reads the rule first.

- [ ] `AX1.1` **Suffixes** — `docs/opinions/files.md` catalog-fragment rows for `.flags.ts`
  (`widget.flags.ts`) and `.widgets.ts` (`member.widgets.ts`). Add `.actions.ts` too: five files
  in `contracts/src/catalog/` use it, and the closed set never listed it. The digest
  `docs/ai/rules/files.md` lists the fragments as
  `.permissions .errors .events .actions .gate .routes .flags .widgets .data`.
- [ ] `AX1.2` **Folders** — `docs/opinions/folders.md` role-table rows `flag/` and `widget/`: fragment
  per slice, merged by a platform-owned barrel, used by `permissions`. Add both to the list in
  `docs/ai/rules/folders.md`.
- [ ] `AX1.3` **Vocabulary** — `docs/opinions/vocabulary.md` gains three grammar rows (flag, widget,
  zone), from the table above, and a paragraph: *zone, never surface*, and why. The digest
  `docs/ai/rules/vocabulary.md` mirrors the rows and its count of grammars.
- [ ] `AX1.4` **`docs/opinions/visibility.md`** — the argument page. It holds:
  - the four-mechanism table and the resolution order, and why entitlement is a mask, not a step;
  - the six rules from the design text:
    - a widget is the smallest unit with an independent reason to be absent;
    - `policy` defaults to `required`;
    - the permission lives in the registry, never in props, and only `goalId` comes from the call
      site;
    - registered ≠ dynamically resolved;
    - a widget preference is cosmetic;
    - per-user denies narrow and are permanent, and per-user grants widen and must expire;
  - four more rules this plan adds:
    - `<Can>` gates an affordance inside a visible unit, and `<Widget>` gates a unit;
    - inline widgets are required;
    - never lazy-load by permission;
    - **hiding is not revoking** — the API, a bookmarked URL and the nav still work.
  
  `docs/opinions/meta.json` puts `"visibility"` before `"simplicity"`, and `index.md` gains a row.
- [ ] `AX1.5` **The digest and its routes** — `docs/ai/rules/visibility.md`, under 900 tokens,
  with the standard footer. Then:
  - `CLAUDE.md` gains `@docs/ai/rules/visibility.md`.
  - `docs/ai/rules/index.md` gains a row; "thirteen" becomes "fourteen", and the token estimate is
    updated.
  - `docs/ai/index.md` gains the row "Gate something behind a flag, a plan, a permission or a
    widget", and its "thirteen" is updated in both places.
  - `AGENTS.md:10` becomes "fourteen files".
  
  §12 fails if any of these is missing.
- [ ] `AX1.6` **The stale wildcard claims** — `platform-scope.md:43` ("Every `owner` holds it") and
  the comment at `grant-permission.use-case.ts:30` are wrong today: owners hold an explicit list,
  and nothing sets `wildcard` in production. Correct both and state decision 1 there.

**Exit.** `pnpm check:architecture` 29/29, with §12, §13 and §15 green. A path that no phase has
built yet is written with the `UNBUILT` wording §15 accepts, never as a live path.

---

### Phase 2 — The kernel in `@loadbearing/permissions`

**Goal.** The whole vocabulary — requirements, flags, widgets, zones, the visibility union and the
entitlement mask — exists as pure, tested data before anything reads it. No new permission keys.

- [ ] `AX2.1` **Requirements** — `PermissionMeta.requires?: readonly string[]`.
  - Typed `string[]`, not `PermissionKey[]`: the fragments `satisfies PermissionMeta` and
    `PermissionKey` derives from them, so the typed form is a circular type (TS7022).
  - A module-level frozen `REQUIRES` map narrows each entry through `isKnown`.
  - New methods `requirementsOf(key)` and `closure(keys)`. `closure` is transitive and safe against
    a cycle.
  - Existing fragments gain `requires`:
    - a write key requires its read key;
    - `member.invite` and `member.role.change` also require `rbac.role.read`, because the role
      picker reads `role.list`.
  
  Spec (`tests/registry/permission-registry.spec.ts`):
  - every requirement is known and has the same scope as the key that needs it;
  - `closure` is idempotent and survives a cycle.
- [ ] `AX2.2` **Flags** — `src/flag/widget.flags.ts` declares
  `"widget.dismissal": { owner, expiresOn: "YYYY-MM-DD", description }`, and `src/flag/index.ts`
  exports `FLAGS`. `src/registry/flag-registry.ts` holds:
  - `FlagMeta` and `FlagKey`;
  - `FlagRegistry.instance`, with `all`, `meta` (`Object.hasOwn`, returning `undefined`, never a
    throw), `isKnown`, `isClientGating` and `clientGating()`.
  
  The client-gating set is derived from `WIDGETS` at module load and frozen — never declared by
  hand. Spec: `tests/registry/flag-registry.spec.ts`.
- [ ] `AX2.3` **Widgets and zones** — `src/registry/widget-registry.ts`:
  - **Zones:** `ZONES` (a frozen tuple, one entry: `dashboard.main`) and `ZoneKey`. No zone folder
    and no zone metadata while there is one zone.
  - **Metadata:** `WidgetMeta` is a union of a zone widget and an inline widget. An inline widget
    has no zone, and its `policy` can only be `required`. `policy` defaults to `required`.
    **`permission: PermissionKey | null` is a required field**, so an ungated widget says so rather
    than forgetting.
  - **Key types:** `WidgetKey`, `ZoneWidgetKey<Z>`, `InlineWidgetKey`, `DismissibleWidgetKey`.
  - **`WidgetVisibility`**, with the six kinds from the vocabulary table.
  - **`WidgetFacts`** — `{ capabilities, flags, hiddenByAdmin, hiddenByUser, goalId? }`.
  - **`WidgetRegistry.instance`** — `meta`, `forZone` (sorted by `order`, from a frozen `BY_ZONE`
    map), `isDismissible`, and `visibilityOf(key, facts)`. The order of checks is: unregistered,
    flag, permission, admin, user. A required widget ignores both preferences.
- [ ] `AX2.4` **The first fragments** —
  - `widget/core.widgets.ts`: `core.module-nav` (zone `dashboard.main`, permission `null`,
    required, order 10).
  - `widget/member.widgets.ts`: `member.count` (`member.read`, user-dismissible, order 20).
  - `widget/notification.widgets.ts`: `notification.bell` (inline, `notification.inbox.read`).
  
  `widget/index.ts` exports `WIDGETS`.
- [ ] `AX2.5` **Registry specs** — `tests/registry/widget-registry.spec.ts`:
  - each resolution step on its own, and that broadest wins when two apply;
  - `unregistered` for an unknown key;
  - `order` is unique within a zone;
  - every key's first segment is a module;
  - the nav widget is required;
  - **the nav-path invariant** (decision 12): every dismissible widget's permission belongs to the
    module of some `GATES[*].permission`. The join is on the permission's module, not the gate key,
    because the `document` gate's permission is `ai.embedding.read`.
- [ ] `AX2.6` **`EntitlementMask`** — `src/capability/entitlement-mask.ts`:
  - `EntitlementMask.from({ plan: keys | "all", added, removed, disabledModules })`.
  - `isEntitled(key)` is always true for `core` keys and for `platform`-scope keys.
  - `keys()`.
  - `narrow(dto)` filters org and goal **grants** only. Denies and the platform axis pass through
    untouched.
  
  Spec (`tests/capability/entitlement-mask.spec.ts`):
  - a remove beats the plan and an add;
  - a disabled module removes its keys;
  - denies survive;
  - `"all"` includes a key declared after the mask was built.
- [ ] `AX2.7` **Barrels and docs** — `src/index.ts`, `registry/index.ts` and `capability/index.ts`
  name every new export. **Docs:** `packages/permissions/docs/index.md` (the tree and the seams),
  new `docs/reference/{flag-registry,widget-registry,entitlement-mask}.md`, and `meta.json`.

**Exit.** `pnpm --filter @loadbearing/permissions test` green. The package still has no
dependencies and no React. `check:architecture` 29/29.

---

### Phase 3 — Flags, end to end

**Goal.** A platform admin turns a flag on for the deployment or for chosen orgs. A procedure behind
it answers `NOT_FOUND` when it is off. The browser learns only the on-set of flags a widget names.

- [ ] `AX3.1` **Tables** — `pg/schema/flag.schema.ts`:
  - `feature_flags`: `key` primary key, `is_enabled` default false, `updated_by`, `updated_at`.
  - `feature_flag_organizations`: `organization_id` (FK cascade), `flag_key` (FK cascade),
    `created_by`, `created_at`. Unique `feature_flag_organizations_uq (organization_id, flag_key)`,
    plus an index on `flag_key` for the FK (§18).
  - A missing row means off.
  
  Register the file in `schema/index.ts` (§11), add both tables to the catalog list in
  `application/src/primitive/shard.ts`, and generate migration `0042_feature_flags.sql`. Add
  `feature_flag_organizations` to `tests/rbac/tenant-cascade.spec.ts`.
- [ ] `AX3.2` **`FlagRepository`** — the port in `application/src/flag/flag.repository.ts`, the
  adapter `pg-flag.repository.ts` (catalog placement) with its spec, and
  `composition/src/fake/in-memory-flag.repository.ts`. `test-container.ts` compiles only once the
  fake exists.
- [ ] `AX3.3` **`FlagCache`** — `application/src/flag/flag.cache.ts`:
  - one key, `flag:state`, 60 s TTL;
  - `onFor(org)` and `isOn(org, key)`;
  - `assertOn(actor, key)` throws `NotFoundError` with **no flag key in its context**;
  - `invalidate()` deletes, then repeats the delete after 2 s.
  
  It is a concrete class over two ports, like `CapabilityCache`. Spec
  (`application/tests/flag/flag.cache.spec.ts`):
  - global on, and on for one targeted org;
  - an unknown row is ignored;
  - **`JSON.stringify(error.toJSON())` does not contain the key.**
  
  **Docs:** `application/docs/reference/authorizer.md` — the flag check comes before the
  permission check, and NOT_FOUND vs FORBIDDEN.
- [ ] `AX3.4` **Platform flag management** — use-cases `list-flags`, `update-flag` and
  `update-flag-target` in `application/src/platform/`, audited in the tier org.
  - Keys `platform.flag.read` and `platform.flag.manage`; `PlatformRoleSeed` picks them up by
    scope.
  - Procedures:
    - `platform.listFlags` — GET `/platform/flags`;
    - `platform.updateFlag` — PUT `/platform/flags`;
    - `platform.updateFlagTarget` — PUT `/platform/flags/organization`.
  - Mapping in `contracts/src/catalog/platform.permissions.ts`.
  - Actions `flag.enabled`, `flag.disabled`, `flag.organization.added` and
    `flag.organization.removed` in `platform.actions.ts`.
  - Router `apps/web/src/server/orpc/platform.router.ts`; `container.flags`.
  
  `listFlags` is also the platform-only view of **every** flag, server-behaviour flags included —
  the endpoint the design text asks for.
- [ ] `AX3.5` **Flags on the session** — `fetchSession` adds `container.flags.onFor(org)` to its
  existing `Promise.all`, filtered through `FlagRegistry.isClientGating`, and sends the on-set only.
  The flag rides through:
  - `SessionSnapshot.flags: readonly FlagKey[]` (`[]` when anonymous);
  - `RouterContext`, via `__root.tsx`;
  - `SessionProvider` and a new `useFlags()`.
  
  `renderWithFakes` gains a `flags` parameter. Spec: `apps/web/tests/store/session.store.spec.ts`.
  **Docs:** `apps/web/docs/reference/server-functions.md`, which notes that flag *names* are in
  the bundle anyway, so a flag is the wrong tool for a secret.
- [ ] `AX3.6` **`/platform/flags`** — `feature/src/platform/flag.list.tsx` shows:
  - owner, expiry and description from code;
  - the global toggle and the org targets from the database;
  - a row in the database that code no longer declares, marked orphaned.
  
  Also the route `platform/flags.tsx` (`RouteGuard.requirePermission("platform.flag.read")`),
  `ROUTES.platform.flags`, `PlatformQueries.flags`, `useUpdateFlag` / `useUpdateFlagTarget`,
  `QueryKeys.platform.flags()`, and copy in `content/src/message/{en,bn}/platform.ts`.
  Spec: `feature/tests/platform/flag.list.spec.tsx`.
- [ ] `AX3.7` **§30 — every flag is live** — `check-architecture.mjs` reads `flag/index.ts` with
  `spreadFragments`. It fails when a flag's `expiresOn` is before today (UTC), or when its key
  appears in no `src/` file outside `permissions/src/flag/`. With zero flags it **passes, not
  skips**.
  - The spec gets fixtures that fail and pass, and the count at `:142` becomes 30.
  - The count moves in `AGENTS.md:24`, `docs/ai/rules/workflow.md` (`:14`, `:43` and the prose
    list), and `docs/setup/26-hygiene-and-ci.md` (`:372`, `:374`, `:1064`, `:1118`, `:1121`, plus a
    new `### 30` section).
  - Verified by setting an expiry in the past and watching it fail.

**Exit.** On the running app:
1. A platform admin turns `widget.dismissal` on for one org only.
2. That org's session payload lists it; another org's does not.
3. A server-only flag never appears in any payload.
4. `pnpm check:architecture` is 30/30, and every suite is green.

---

### Phase 4 — Entitlement: plans, adjustments and the module kill switch

**Goal.** A platform admin puts an org on a plan, adjusts it (a trial is an expiring add), and can
switch a module off for everyone during an incident. Every downstream check — `<Can>`, nav,
`RouteGuard` and `Authorizer.assert` — obeys it without learning that entitlement exists.

- [ ] `AX4.1` **Schema** —
  - `plans` (`key` primary key, `name`, `description`, `is_unlimited`, `is_system`, timestamps) and
    `plan_permissions` (`plan_key` FK cascade, `permission`, unique `(plan_key, permission)`) go in
    `rbac.schema.ts`, declared above `organizations`.
  - `organizations.plan_key text NOT NULL DEFAULT 'unlimited'`, FK with no action, plus
    `organizations_plan_idx`.
  - New `pg/schema/entitlement.schema.ts`:
    - `entitlement_adjustments`: `id`, `organization_id` (FK cascade), `permission`,
      `effect add|remove`, `reason NOT NULL`, `expires_at`, `created_by` (no FK), `created_at`.
      Unique `(organization_id, permission)`, plus a partial expiry index.
    - `disabled_modules`: `module` primary key, `reason`, `disabled_by`, `disabled_at`.
  
  All four tables go in the catalog list in `shard.ts`. Migration `0043_entitlement.sql` is
  hand-edited: **insert the `unlimited` row (`is_unlimited`, `is_system`) before** adding the
  column with its default and FK, so every existing org lands on it. Cascade spec updated.
- [ ] `AX4.2` **The mask in resolution** — `CapabilityRepository.entitlementFor(org)`.
  `resolveFor` gains **one** statement: a `UNION ALL` of four index lookups:
  - the plan's rows;
  - the unlimited marker;
  - live adjustments;
  - disabled modules.
  
  Its result goes through `EntitlementMask.narrow`. `resolvePlatformFor` is untouched. Specs in
  `pg-capability.repository.spec.ts`:
  - "exactly **four** queries";
  - an org on `unlimited` resolves exactly its pre-change set;
  - a `remove` masks a role grant and an override grant;
  - an expired adjustment is ignored;
  - a disabled module is masked;
  - core keys survive.
  
  **Docs:** "three queries" becomes four, with why the fourth is a union rather than a join, in
  `docs/opinions/simplicity.md`, `packages/auth/docs/reference/capability-cache.md` and the
  comment at `capability.cache.ts:12`.
- [ ] `AX4.3` **Invalidation** — `CapabilityInvalidator.invalidateAll()`: one `deletePrefix` over
  `capability:user:`, repeated after 2 s, for plan edits and the kill switch. It is implemented in
  `CapabilityCache`, and `recording-capability.invalidator.ts` fakes it. Spec:
  `auth/tests/principal/capability.cache.spec.ts`. **Docs:** `capability-cache.md` gains an
  invalidation table (which write flushes what), and decision 4's argument for no stamp.
- [ ] `AX4.4` **Rules and use-cases** — `application/src/platform/entitlement.rules.ts`:
  - no `core` or `platform` keys in a plan or an adjustment;
  - an add closes over `requires`, with the same expiry;
  - the `core` and `platform` modules cannot be switched off.
  
  Use-cases:
  - `list-plans`, `save-plan`, `delete-plan` (`ConflictError` while a plan is in use or is a
    system plan);
  - `get-organization-entitlement`, `assign-plan`;
  - `adjust-entitlement`, `clear-entitlement-adjustment`, `expire-entitlement-adjustments`;
  - `list-module-switches`, `switch-module`.
  
  Assign, adjust and clear call `invalidateOrganization`. Plan save or delete and the switch call
  `invalidateAll`. Every write is audited in the tier org, and a plan or adjustment change also in
  the target org.
- [ ] `AX4.5` **Keys, procedures, adapter** — keys `platform.entitlement.read`,
  `platform.entitlement.manage` and `platform.module.manage`.

  | Procedure | Method and path | Permission |
  |---|---|---|
  | `platform.listPlans` | GET `/platform/plans` | `platform.entitlement.read` |
  | `platform.savePlan` | PUT `/platform/plans` | `platform.entitlement.manage` |
  | `platform.deletePlan` | DELETE `/platform/plans` | `platform.entitlement.manage` |
  | `platform.organizationEntitlement` | GET `/platform/entitlements` | `platform.entitlement.read` |
  | `platform.assignPlan` | PUT `/platform/entitlements/plan` | `platform.entitlement.manage` |
  | `platform.adjustEntitlement` | PUT `/platform/entitlements/adjustments` | `platform.entitlement.manage` |
  | `platform.clearAdjustment` | DELETE `/platform/entitlements/adjustments` | `platform.entitlement.manage` |
  | `platform.moduleSwitches` | GET `/platform/modules` | `platform.status.read` |
  | `platform.updateModuleSwitch` | PUT `/platform/modules` | `platform.module.manage` |

  - Actions: `plan.saved`, `plan.deleted`, `organization.plan.changed`, `entitlement.adjusted`,
    `entitlement.adjustment.cleared`, `entitlement.adjustment.expired`, `module.disabled` and
    `module.enabled`.
  - `pg-entitlement.repository.ts` and its spec.
  - `entitlement_adjustments` joins `CATALOG_TABLES` in `pg-partition-archive.gateway.ts`, so a
    tenant export carries it.
- [ ] `AX4.6` **What a tenant can read** — `rbac/get-entitlement.use-case.ts` (`rbac.role.read`) and
  `role.entitlement`, GET `/roles/entitlement`. It returns the entitled key set, so the role editor
  can show the ceiling.
- [ ] `AX4.7` **Platform screens** —
  - `platform/plan.form.tsx`: ticking a module writes `byModule`, and ticking a key also ticks
    what it requires.
  - `platform/organization-entitlement.panel.tsx`: the plan picker, the adjustments with expiry and
    reason, and **the effective result** — "entitled to 47 permissions; their Accountant role
    holds 12 of them".
  - `platform/module-switch.panel.tsx`, mounted on `/platform/status` behind
    `<Can permission="platform.module.manage">`.
  - The route `platform/entitlements.tsx`, `PlatformQueries.plans`, `.entitlement(slug)` and
    `.moduleSwitches`, and copy.
- [ ] `AX4.8` **Show the ceiling to the org admin** — `PermissionMatrix` gains
  `blocked?: ReadonlySet<PermissionKey>`. A blocked cell is disabled and reads "Not included in
  your plan". `RoleMatrix` supplies it from `RoleQueries.entitlement`, and the `settings/roles.tsx`
  loader prefetches that query. Specs in `feature/tests/rbac/`.
- [ ] `AX4.9` **The expiry sweep** — the maintenance consumer's `cleanup()` runs
  `expire-entitlement-adjustments`, which audits each expired row and invalidates each org.
  `maintenance.sweep.completed` gains `adjustments` in `observability/src/event/event-shape.ts`.

**Exit.** On the running app:
1. An org moved to a plan without `analytics.activity.read` loses the Analytics nav item and gets
   403 on the procedure within seconds. Its role still lists the key, greyed as "Not included in
   your plan".
2. Moving the org back restores the key with no role edit.
3. A two-minute trial `add` works, then stops working after the sweep.
4. Switching `messaging` off removes it for every tenant.
5. Every suite is green.

---

### Phase 5 — Per-user overrides

**Goal.** An org admin can deny one person one permission indefinitely, or grant it for a stated
reason until a date. A reviewer can see the drift without opening each member.

- [ ] `AX5.1` **Migration `0044_override_expiry.sql`** — new columns `expires_at`, `created_by`
  (uuid, no FK) and `authority text NOT NULL DEFAULT 'org'`.
  - **Backfill:** existing grant rows get `expires_at = now() + 90 days` and a reason if they had
    none.
  - **CHECK constraints:**
    - a grant has an expiry and a deny has none;
    - a grant has a reason;
    - `authority = 'platform'` only on a deny.
  - **Indexes:** both partial unique indexes are rebuilt with `authority` in them, so a platform
    deny and an org row for the same key can coexist. Add `permission_overrides_expiry_idx`.
  - `rbac.schema.ts` matches.
- [ ] `AX5.2` **Resolution explains itself** — override reads filter out expired rows. That filter
  is the real mechanism: a cached set can outlive an expiry by up to the 60 s TTL, and the docs say
  so.
  - `CapabilityRepository.explainFor(org, user)` returns the ingredients: role grants, overrides
    (with authority, expiry and reason) and the entitlement. `resolveFor` becomes a fold over it
    and stays at four statements.
  - `InspectEffectivePermissionsUseCase` returns `{ capabilities, explanation }`.
  - `RoleContract.capabilities` stays as it is; the explanation is its own schema.
- [ ] `AX5.3` **Rules** — `application/src/rbac/permission-override.rules.ts`:
  - expiry defaults to 30 days and may not pass 90;
  - a grant needs a reason;
  - no `core` or `platform`-scope key;
  - never yourself;
  - the actor must hold the key tenant-wide (`canTenantWide`);
  - the actor may not override someone who outranks them (reuse `role.rules.ts`
    `assertAssignableBy`).
- [ ] `AX5.4` **Use-cases** —
  - `list-permission-overrides`;
  - `grant-permission-override`, which closes over the requirements the target lacks, with the
    same expiry and reason;
  - `deny-permission-override`, permanent;
  - `clear-permission-override`, which refuses a platform row with
    `ConflictError("override", "platform")`;
  - `expire-permission-overrides`, for the worker.
  
  Each write runs a unit of work, then the audit, then `invalidate(org, user)` after commit. The
  existing `GrantPermissionUseCase` also closes over `requires`, and each requirement passes the
  no-escalation check. Spec: `application/tests/rbac/permission-override.use-case.spec.ts` —
  escalation, outrank, self, core and platform refused, expiry default and maximum, reason,
  platform row not clearable, closure.
- [ ] `AX5.5` **Keys and grants** — `rbac.override.read` (requires `member.read`) and
  `rbac.override.manage` (requires `rbac.override.read`). `SystemRoleSeed`: `admin` gets
  `rbac.override.read`. Migration `0045_override_grants.sql`, shaped like `0039`:
  - roles holding `rbac.role.manage` get `.read`;
  - roles holding `rbac.permission.grant` get `.manage`.
- [ ] `AX5.6` **Transport** — a new contracts subject `contracts/src/override/`:
  - `override.list` — GET `/overrides`;
  - `override.grant` — POST `/overrides/grant`;
  - `override.deny` — POST `/overrides/deny`;
  - `override.clear` — DELETE `/overrides/{overrideId}`.
  
  Plus `catalog/override.{permissions,actions}.ts` (`override.granted`, `.denied`, `.cleared`,
  `.expired`), the api-client accessor, `server/orpc/override.router.ts`, the composition wiring,
  and `pg-permission-override.repository.ts` with its spec.
- [ ] `AX5.7` **The drift overlay** — `member.entity.ts` gains `exceptions`, a correlated count of
  live overrides, added to the existing member-list statement so its query count holds.
  - `MemberList` reads "Accountant + 2 exceptions".
  - `RoleList` shows, per role, how many of its members carry exceptions, so a role review sees
    drift without opening anyone.
- [ ] `AX5.8` **Screens** — `member/member-access.panel.tsx`, opened from `settings/members.tsx`
  by a validated `?member=` search parameter. It holds:
  - `rbac/permission-override.list.tsx` — platform rows show a lock and "Set by the platform";
  - `rbac/permission-override.form.tsx` — an expiry picker capped at 90 days, and a reason
    required for a grant;
  - `EffectivePermissionsInspector`, which now names the source of each answer: role, override,
    not in plan, or platform deny.
  
  Copy in `role.ts` and `member.ts`, `en` and `bn`. Specs in `feature/tests/`.
- [ ] `AX5.9` **The expiry sweep** — `cleanup()` runs `expire-permission-overrides`: one audit entry
  per row, and `invalidate` per user. The event shape gains `overrides`.

**Exit.** On the running app:
1. Deny `member.invite` to one admin: the button disappears, and the procedure answers 403 within
   seconds.
2. Grant a member `analytics.activity.read` for two minutes: it works, then stops after the sweep.
   The member list reads "+ 1 exception" until then.
3. A grant of a key the org is not entitled to changes nothing.
4. Every suite is green.

---

### Phase 6 — The platform deny and the account suspend

**Goal.** A platform admin can take one key from one person in one tenant, in a way the org admin
cannot undo. They can also cut a compromised account off everywhere in seconds. Both are loud,
audited, and visible inside the tenant.

- [ ] `AX6.1` **`users.suspended_at`** — rename `deactivated_at` in `auth.schema.ts` and in
  `auth.factory.ts`'s `additionalFields` (`input: false` stays), with migration
  `0046_account_suspension.sql`. "Deactivated" already means a membership here. drizzle-kit asks
  whether this is a rename; if that blocks, keep the old name, and **never** add a second column.
  Correct the comment on `memberships` that the rename makes wrong.
- [ ] `AX6.2` **A suspended account holds nothing** — `PgMembershipReader.isActive`,
  `activeOrganizationFor`, `organizationsFor` and `activeMemberIds` join `users` on
  `suspended_at IS NULL`. That one change:
  - makes `fetchSession` anonymous;
  - makes `PrincipalBuilder` refuse;
  - refuses an API key the user issued;
  - closes the user stream within 60 s.
  
  Spec: `infrastructure/tests/rbac/pg-membership.reader.spec.ts`.
- [ ] `AX6.3` **Sign-in says why** — a Better Auth session-create hook refuses a suspended user with
  the new error code `ACCOUNT_SUSPENDED`. The code goes in `errors`, and its copy in `content`
  (`en`, `bn`); `Record<ErrorCode, ShellMessageKey>` will not compile without the copy. Verify the
  hook's shape against the pinned Better Auth version before writing it.
- [ ] `AX6.4` **Ending live sessions** — a `SessionGateway` port (`revokeAll(userId)`) in
  `application/src/port/`, and `BetterAuthSessionGateway` in `packages/auth`, through Better
  Auth's own adapter so its Redis secondary-storage copy goes too. A raw `DELETE FROM sessions`
  would leave that copy working. Verify the adapter method against the pinned version. Add a
  recording fake.
- [ ] `AX6.5` **Open streams re-read permissions** — the conversation stream's revalidation in
  `packages/api-server/src/router/realtime.router.ts:98` re-runs `watch.execute` with the principal
  captured at open, so no deny, kill switch, plan change or suspend ever closed it. It now
  re-resolves through `container.capabilities.forUser` (the tenant and platform merge) first.
  Spec: `apps/web/tests/server/realtime.stream.spec.ts`. **Docs:** `packages/api-server/docs/`.
- [ ] `AX6.6` **Use-cases and keys** — keys `platform.account.read` and `platform.account.manage`.
  `platform.account.*`, not `platform.principal.*`: `Principal` is the per-request class, and the
  suspend acts on the `users` row. Use-cases in `application/src/platform/`:
  - `find-account`: the user's memberships, whether they are suspended, and their platform denies
    across orgs;
  - `suspend-account`: refuses yourself; audits in the tier and in every org the user belongs to;
    invalidates each of those orgs; calls `revokeAll` after commit;
  - `reinstate-account`;
  - `deny-account-permission`: a tenant key, only in an org the user belongs to; a platform key,
    only in the tier. It refuses `core` keys and yourself, and writes `authority = 'platform'`
    with no expiry;
  - `clear-account-deny`.
  
  Procedures:
  - `platform.findAccount` — GET `/platform/accounts`;
  - `platform.suspendAccount` — POST `/platform/accounts/suspend`;
  - `platform.reinstateAccount` — POST `/platform/accounts/reinstate`;
  - `platform.denyAccountPermission` — POST `/platform/accounts/denies`;
  - `platform.clearAccountDeny` — DELETE `/platform/accounts/denies`.
  
  Actions `account.suspended` and `account.reinstated`. A platform deny reuses `override.denied`
  with `authority` in its payload.
- [ ] `AX6.7` **Visible inside the tenant** — `member.entity.ts` gains `suspended`, and the member
  list shows a "Suspended by the platform" badge. Platform deny rows are locked in the override
  list with "Set by the platform — contact support". Otherwise an admin wastes an afternoon trying
  to restore someone.
- [ ] `AX6.8` **`/platform/accounts`** — `feature/src/platform/account.panel.tsx` (search by email,
  memberships, suspend and reinstate with a reason, per-org denies), the route, and copy.
- [ ] `AX6.9` **The recovery path** — `infrastructure/platform-grant.ts` refuses a suspended account
  loudly, naming the reinstate route. A platform admin who suspended themselves by mistake would
  otherwise have no way back. **Docs:** `platform-scope.md`, and
  `auth/docs/reference/{principal-builder,enrolment}.md`.

**Exit.** On the running app:
1. Suspend a signed-in member with a conversation open: the page falls back to signed-out on its
   next request, the conversation stream closes within 60 s, and sign-in shows the suspended
   message.
2. Reinstate them: they sign in again.
3. A platform deny appears locked in the tenant's override list, and the org admin's clear answers
   409.
4. Every suite is green.

---

### Phase 7 — `<Zone>` in `ui`

**Goal.** A layout primitive that knows nothing: no registry, no session, no domain noun.

- [ ] `AX7.1` **The component** — `packages/ui/src/zone/{index.ts,zone.tsx}`:
  - `Zone({ label, items, empty })`, with `ZoneItem { key, title, content, action? }`.
  - Markup: `<section className="ui-zone" aria-label>`, then `ui-zone__item`, `__header`,
    `__title` and `__action`.
  - **`items`, not children** — that is what makes "`<Can>` as a direct child of a zone"
    unwritable, with no lint rule.
  - An empty list renders `empty`, or nothing.
- [ ] `AX7.2` **Styles** — `src/theme/class/zone.css`: an auto-fill grid on the spacing tokens, with
  colour only through the twelve `var()` names. One `@import` goes in `theme/class.css`.
- [ ] `AX7.3` **Proof** — a Zone section in the kitchen sink. Spec
  `packages/ui/tests/zone/zone.spec.tsx`: order, label, empty state, the action slot.
  **Docs:** `packages/ui/docs/index.md`.

**Exit.** `pnpm check:contrast` green. The kitchen sink shows the zone in every theme and mode.
Documented setup gate 22's domain-noun grep still finds nothing. Every suite is green.

---

### Phase 8 — `<Widget>`, the dashboard zone, and `/dashboard`

**Goal.** A signed-in user lands on `/dashboard`. Its cards come from the registry. A hidden card
never mounts and never fetches. The header bell is an inline widget.

- [ ] `AX8.1` **`<Widget>`** — `feature/src/widget/{widget.tsx,use-widget-visibility.ts}`:
  - `Widget({ widget: InlineWidgetKey, goalId?, fallback?, children })`.
  - It checks the flag and the permission; there is **no permission prop**.
  - It returns its children bare, like `<Can>`, and neither wraps the other.
  
  Spec: `feature/tests/widget/widget.spec.tsx`.
- [ ] `AX8.2` **`DashboardZone`** — `feature/src/dashboard/dashboard-zone.tsx`:
  - `DASHBOARD_WIDGETS` `satisfies Record<ZoneWidgetKey<"dashboard.main">, { component; prefetch? }>`,
    total over the zone.
  - `DashboardZone` builds the `<Zone>` items from `forZone`, keeping only `visible` ones.
  - `prefetchDashboard(...)` prefetches for visible widgets only.
  - The barrel exports `DashboardZone` and `prefetchDashboard`, **never the map**.
- [ ] `AX8.3` **Copy** — the `widget` namespace:
  - `namespace.ts`: `NamespaceShape`, `ClientNamespace` and `CLIENT_NAMESPACES`, which also gets
    the missing `"account"`;
  - loaders in `catalog.ts`;
  - `message/{en,bn}/widget.ts`.
  
  A new `message/widget-copy.ts` holds `WIDGET_COPY: Record<WidgetKey, NamespaceKeys["widget"]>`,
  on the `error-copy.ts` pattern, so a widget without a title does not compile.
- [ ] `AX8.4` **The route** — `ROUTES` gains `/dashboard` (in `shell.routes.ts` beside `home`).
  - New `route/(app)/_authenticated/dashboard.tsx`, with messages `["nav", "widget"]`. Its loader
    loads the nav, then calls `prefetchDashboard`.
  - `(shell)/index.tsx` gains a `beforeLoad` that sends a signed-in user to `/dashboard`, and
    loses `MemberCount`, `ModuleNav` and the member prefetch.
- [ ] `AX8.5` **The bell** — in `_authenticated.tsx`, `<Can permission="notification.inbox.read">`
  around the bell becomes `<Widget widget="notification.bell">`. The loader's prefetch gate
  uses `visibilityOf`.
- [ ] `AX8.6` **Specs** — `feature/tests/dashboard/dashboard-zone.spec.tsx`:
  - the map's keys equal `forZone("dashboard.main")` — a runtime backstop to the type;
  - a denied widget and a flag-hidden widget do not mount, **and the fake client's `member.list`
    is never called**;
  - `prefetchDashboard` skips both.
  
  `apps/web/tests/route/routes.spec.ts` passes with the new route.
- [ ] `AX8.7` **§31 — every inline widget is placed by a literal key** — every fragment entry with
  no zone must appear as `widget="<key>"` in `packages/feature/src` or `apps/web/src`. Any
  `<Widget … widget={` fails, which also forbids a `<Widget>` inside a loop over runtime data. The
  spec gets fixtures that fail and pass, and the count moves to 31 in the same places as `AX3.7`,
  plus a new `### 31` section. Verified by writing each violation.
- [ ] `AX8.8` **Docs** — `apps/web/docs/reference/enforcement-surfaces.md`: surface 4 now has two
  forms, `<Can>` and `<Widget>`, and neither is the gate. Also `docs/setup/28-folder-structure.md`
  and `packages/feature/docs/`.

**Exit.** On the running app:
1. A signed-in user who opens `/` lands on `/dashboard`, with the header, the nav and two cards.
2. A member without `member.read` sees one card, and the network panel shows no `member.list`
   call.
3. A signed-out visitor still sees the landing page.
4. `pnpm check:architecture` is 31/31, and every suite is green.

---

### Phase 9 — Widget preferences

**Goal.** A user hides a dismissible card and brings it back. An org admin hides one for everyone,
and a user cannot bring that back. The whole capability rolls out behind `widget.dismissal`.

- [ ] `AX9.1` **Table** — `pg/schema/widget.schema.ts`, `widget_preferences`:
  - Columns: `id`, `organization_id`, `user_id` (null means the org default), `widget` and
    `created_at`, with primary key `(id, organization_id)`.
  - Two partial unique indexes, split on `user_id IS NULL`, because a nullable column in one unique
    index enforces nothing.
  - A row means hidden, and no row means shown.
  - It is routed (the default, so `shard.ts` does not change) and joins `PartitionedTable` as
    `LIST (organization_id)` with no month level.
  
  Migration `0047_widget_preferences.sql` through `db:generate`, which writes the partition DDL.
  Existing tenants' child partitions come from `migrate.ts`; tenant move, export and drop all
  derive from the allowlist. The `tenant-partition` spec counts are updated.
- [ ] `AX9.2` **Adapter** — `WidgetPreferenceRepository` port, `pg-widget-preference.repository.ts`
  (routed) with its spec, and the fake.
- [ ] `AX9.3` **Keys** — `core.widget.customize` (core: held by everyone) and
  `widget.default.manage`, in a new `widget` module.
  - `gate/widget.gate.ts` and `route/widget.routes.ts` (`/settings/widgets`).
  - A nav item in `nav.data.ts`, with `nav.widgets` copy.
  - `SystemRoleSeed`: `admin` gets `widget.default.manage`.
  - Migration `0048_widget_grants.sql`.
- [ ] `AX9.4` **Rules and use-cases** — `application/src/widget/widget.rules.ts`
  (`assertDismissible`: a required widget is refused, and a user cannot restore an admin-hidden
  one).
  - `get-widget-preferences`: your own under `core.widget.customize`; another member's under
    `rbac.effective.inspect` plus a membership check.
  - `update-widget-preference`: `flags.assertOn("widget.dismissal")` first, then the permission.
    Not audited — it is cosmetic.
  - `update-widget-default`: the flag, then `widget.default.manage`. Audited as
    `widget.default.hidden` / `widget.default.restored`.
- [ ] `AX9.5` **Transport and client data** — the contracts subject `widget/`:
  - `widget.preferences` — GET `/widgets/preferences`;
  - `widget.preferencesOf` — GET `/widgets/preferences/{userId}`;
  - `widget.updatePreference` — PUT `/widgets/preferences`;
  - `widget.updateDefault` — PUT `/widgets/defaults`.
  
  Plus `catalog/widget.{permissions,actions}.ts`, the api-client accessor,
  `server/orpc/widget.router.ts`, composition, `query/src/widget/widget.{queries,mutations}.ts`
  and `QueryKeys.widget`.
- [ ] `AX9.6` **The flag becomes client-gating** — declare `core.hidden-widgets` (zone
  `dashboard.main`, flag `widget.dismissal`, required, order 90): the tray of hidden cards. From
  here `widget.dismissal` is in the session on-set for orgs that have it.
- [ ] `AX9.7` **Screens** —
  - `DashboardZone` shows a Hide action on a dismissible card, when the flag is on and the user
    holds `core.widget.customize`, and applies preferences only while the flag is on.
  - `widget/hidden-widget.list.tsx` is the tray: restore buttons, with admin-hidden rows locked.
  - `widget/widget-default.form.tsx` sits on the new route `settings/widgets.tsx`, and states that
    **hiding a card is not removing access**.
  - The dashboard loader ensures preferences, when the flag is on, before it prefetches.
- [ ] `AX9.8` **Specs** —
  - Application: flag off gives `NOT_FOUND` with no flag key; a required widget is refused; a user
    cannot restore an admin-hidden card.
  - Infrastructure: the repository.
  - Feature: a user-hidden card does not mount and does not fetch.
  
  **Docs:** `infrastructure/docs/reference/partitions.md`, the partitioned-table count in
  `tenant-partition.seed.ts`'s comment, and `packages/application/docs/`.

**Exit.** On the running app, with `widget.dismissal` on for one org:
1. Hide the member card: it is gone after a reload and listed in the tray. Restore it.
2. The org admin hides it for everyone: a member cannot restore it.
3. In an org without the flag there is no Hide action, and the procedure answers 404.
4. Every suite is green.

---

### Phase 10 — The inspector

**Goal.** "Where did my card go?" has a one-word answer on one screen.

- [ ] `AX10.1` **`WidgetInspector`** — `feature/src/widget/widget.inspector.tsx`,
  `WidgetInspector({ userId? })`: every registered widget, with its `WidgetVisibility` and its
  reason in words.
  - **Your own view** uses the session's capabilities and flags and your preferences.
  - **Another member's view** uses `RoleQueries.effective` (already masked) and
    `WidgetQueries.preferencesOf`. It uses the viewer's flag set, which is right: they are in the
    same org, and every flag a widget names is client-gating.
- [ ] `AX10.2` **Where it shows** — in `MemberAccessPanel`, behind `rbac.effective.inspect`, and as
  a "Why is something missing?" disclosure on the hidden-cards tray. Copy under `widget.reason.*`.
- [ ] `AX10.3` **Spec** — `feature/tests/widget/widget.inspector.spec.tsx`: one row per kind,
  including `unregistered` from a stale preference row.

**Exit.** For a member missing the member card, the inspector says `denied — member.read`. After
an admin hides the card, it says `hidden-by-admin`. Every suite is green.

---

### Phase 11 — Lint, the flag's retirement, and the whole-plan check

**Goal.** The one rule no type can hold is linted, the demonstration flag is deleted the way every
flag should be, and the plan is walked end to end.

- [ ] `AX11.1` **No lazy-loading by permission** — ESLint `no-restricted-syntax` against `lazy(` and
  `React.lazy` in `packages/feature/src` and `apps/web/src`, with a message naming
  `docs/opinions/visibility.md`. Route splitting is the router's, so the ban costs nothing.
  Verified by writing the violation. **Docs:** `tooling/eslint-config/docs/reference/rules.md`, and
  the enforcement table in `docs/opinions/index.md` (§30, §31, this rule).
- [ ] `AX11.2` **Retire `widget.dismissal`** — once it has been on for every org, remove:
  - the flag's fragment entry;
  - the `flag` field on `core.hidden-widgets`;
  - both `assertOn` calls;
  - the database rows, through `platform.updateFlag`, or leave them for the orphan view to show.
  
  §30 still passes with zero flags. This is the lifecycle the design text wants, and doing it once
  proves the path. **Trigger:** the rollout is complete, and in any case before its `expiresOn`.
- [ ] `AX11.3` **The hand walk** — every Exit line above, in one session, against
  `pnpm infra:up && pnpm dev`, as one platform admin, one org admin and one member. Record the
  timestamps in this item's `done:` line.
  unverified: needs a running stack and a browser; not run unattended.

**Exit.** The whole-plan verification below passes, and `BACKLOG.md` §13 carries only what is still
open.

---

## Verification — the whole plan

```bash
pnpm build:packages && pnpm --filter @loadbearing/web build && pnpm --filter @loadbearing/worker build
pnpm check:architecture          # 31/31, no "○ skipped"
pnpm typecheck && pnpm lint && pnpm test
pnpm check:contrast
pnpm infra:up && pnpm db:migrate && pnpm db:seed
pnpm --filter @loadbearing/infrastructure test   # the four-query pin, cascades, partitions
pnpm smoke
pnpm dev                          # then the hand walk, AX11.3
```

The load-bearing proofs, each a spec that fails without its change:

| Proof | Where |
|---|---|
| An org on `unlimited` resolves exactly its pre-change set | `pg-capability.repository.spec.ts` |
| A `remove` masks role and override grants; denies survive | the same spec, and `entitlement-mask.spec.ts` |
| A flag's `NOT_FOUND` never carries its key | `flag.cache.spec.ts` |
| A platform deny cannot be cleared by the org | `permission-override.use-case.spec.ts` |
| A suspended user's session, API key and stream all end | `pg-membership.reader.spec.ts`, `realtime.stream.spec.ts` |
| A hidden or denied card does not mount or fetch | `dashboard-zone.spec.tsx` |
| A zone map names exactly its zone | the type, plus `dashboard-zone.spec.tsx` |
| Hiding a card never removes the only path in | the nav-path invariant in `widget-registry.spec.ts` |

---

## Not in this plan

Each of these would need its own plan. The line after each is what it must respect when it comes.

- **Extensions, slots and extension routes** — scrapped on 2026-09-27. When they return:
  - slots are a separate `SlotKey` union, never zone keys with a `public` flag;
  - an extension is a third credential type (`Principal` kind), not a second security model;
  - first-party items render first in a zone, and extensions after them, never interleaved.
- **Themes as installable extensions** — went with extensions. Built-in themes are untouched.
- **The client-portal key space** — there is no client portal. When one exists, its keys are a
  disjoint union and CI-checkable.
- **Percentage rollout** — a stable hash of the org id in `FlagCache.isOn`. Local when wanted.
- **Nested widgets** — a `parent` field, and a resolver rule that a hidden parent hides its
  children. Built with the first nested widget, not before.
- **Dismissible inline widgets** — preferences move into `SessionSnapshot` (decision 9).
- **A command palette** — decision 12 covers the invariant it was meant to hold.

---

## Changelog

| Date | Who | Change |
|---|---|---|
| 2026-09-27 | @sami | Written from the design text "Widget, permission, and extension model"; extensions scrapped; decisions 1–13 agreed. |
