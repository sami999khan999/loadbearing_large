---
title: "@loadbearing/feature"
description: Components that fetch and mutate — the auth screens, the message provider, the session guard. Mountable under any routing shell, because navigation arrives as a prop.
---

# `@loadbearing/feature`

Where data, presentation, copy and permissions meet. Two bans define it, and both are unwriteable
rather than discouraged.

**No `@loadbearing/api-client`.** Every read goes through a defined query in
[`query`](../../query/docs/index.md). Without the ban, someone under deadline writes
`await client.task.list()` inside a component; it works, and now there is an uncached read that no
invalidation will ever touch.

**No router.** Navigation arrives as an `onNavigate` prop or an `href`. That is what lets the Tauri
shell mount these components under a different routing shell.

| | |
| --- | --- |
| **Package** | `@loadbearing/feature` (private, never published) |
| **Entrypoint** | `src/index.tsx` — opens with `"use client"` |
| **Depends on** | `content`, `contracts`, `errors`, `permissions`, `query`, `ui` |
| **Type-only** | `api-client` — a `devDependency`, because `AuthClient` arrives as a prop |
| **Peers** | `react`, `react-dom` |

```
packages/feature/src/
├── index.tsx                          ← "use client" on line 1
├── import.ts                          ← the two bans, made visible
├── i18n/message.context.tsx           → MessageProvider, useMessages
├── auth/
│   ├── session.context.tsx            → SessionProvider, useSession, useCapabilities
│   ├── session.guard.tsx              → SessionGuard
│   ├── sign-in.form.tsx               → SignInForm
│   └── two-factor.form.tsx            → TwoFactorForm
└── rbac/
    ├── permission-matrix.tsx          → PermissionMatrix, MatrixSubject
    └── effective-permissions.inspector.tsx → EffectivePermissionsInspector
```

Both bans live in the **root ESLint config**, not Biome, and that is not a preference: Biome's
`noRestrictedImports` flags `import type` identically to a value import and has no exemption for one,
so a Biome-side ban would error on `SignInForm`'s own `AuthClient` import.
`@typescript-eslint/no-restricted-imports` has `allowTypeImports: true`, and the core rule must be
`"off"` beside it since it has no such option.

Both are verified the way this repository verifies every rule — by writing the violation and watching
it fail. A value import of `api-client` errors; so does `import { Database } from "@loadbearing/db"`,
from the single server-only Biome override.

## `useMessages` narrows to one namespace, and the shape is what makes it work

```tsx
const { t } = useMessages("auth");
t("auth.signIn");       // ✓
t("action.cancel");     // ✓  shell — always loaded
t("nav.roles");         // ✗  compile error
```

**`N` is inferred from a single argument position, before any key is written.** The two-argument
shape that looks equivalent constrains nothing — there the key position is *also* an inference site,
so `N` widens until both arguments fit. `NamespaceKeys[N]`, an indexed access into a mapped type, is
not an inference site. That is why `Translator.t` keeps a flat `MessageKey` and all narrowing happens
here, in the one place that knows the namespace statically.

**The shell is in the union because the runtime guarantees it.** Every `ContentSource` puts `common`
and `error` in every snapshot ([`content`](../../content/docs/index.md)), so `t("action.cancel")`
works from an auth screen without declaring `common`. And `email` cannot be named at all —
`N extends ClientNamespace`, and `email` is a `ServerNamespace`.

**`useSyncExternalStore`, because navigation adds namespaces after the provider mounted.** The store
is subscribed once, at the provider; `useMessages` stays a plain context read. `MessageStore` returns
a stable translator identity until `ensure()` genuinely adds something — a new object per call would
re-render forever.

## The session context reconstructs the class from a DTO

```tsx
<SessionProvider user={user} capabilities={dto}>
```

The DTO is what crosses the SSR boundary as JSON; `CapabilitySet.from()` on the client produces an
object whose `can()` is the same `can()` the server ran. **That is the round-trip property from
[`permissions`](../../permissions/docs/index.md) doing its actual job**, and it is what the first
test asserts.

`useMemo` on the reconstruction, so a re-render does not rebuild the internal `Set`s and invalidate
every downstream memo. And capabilities default to nothing, never to permissive — a signed-out user
gets `CapabilitySet.empty()`, which denies everything. There is no loading state that grants access.

## `SessionGuard` is the weakest of four surfaces

| | Surface | Where |
| --- | --- | --- |
| 1 | `Authorizer.assert()` in the use-case — **the real gate** | [`application`](../../application/docs/index.md) |
| 2 | `principalMiddleware` in the oRPC handler | `apps/web` |
| 3 | the route guard — stops the page rendering | `apps/web` |
| 4 | `<Can>` and `SessionGuard` — hide affordances that would fail | here and `ui` |

Removing a permission from a role must remove the nav item **and** return `FORBIDDEN`. Both, every
time. UI-only is security theatre; API-only is a screen full of buttons that error.

**The redirect is a callback, not a `<Navigate>`.** That is the router ban in practice: `apps/web`
passes `() => navigate({ to: "/sign-in" })`, the desktop shell passes its own. The component knows
*that* it should redirect, never *how* — and a spec asserts the callback fires and the children do
not render.

## Two things worth copying from `SignInForm`

**Branch on the code, never the message.** `error.message` *is* the code
([`errors`](../../errors/docs/index.md)) — but even if it carried prose, matching on it would break
the moment someone reworded the copy, and would already be broken in every locale but English.

**The failure message is generic.** `t("auth.signInFailed")` — never "no account with that email" or
"incorrect password". Distinguishing them is an account-enumeration oracle: an attacker learns which
addresses are registered without needing a password. A small copy decision with a real security
consequence.

## The two RBAC components need no query at all

That is the interesting part, and the one deliberate departure from the fetch-here pattern. The
permission axis is `PermissionRegistry.instance` — already in the bundle — and the answer axis is
`CapabilitySet.can()`, already in the session context. So `EffectivePermissionsInspector` takes
nothing but an optional `goalId`, and `PermissionMatrix` takes its **subjects** as a prop.

Rows are the catalog, which is static; columns are whatever the caller is comparing — roles on an
admin screen, two users in a support tool. A component that fetched its own columns could only ever
do one of those.

**Both render a word, not a glyph.** `✓` announces as "check mark", which is not an answer. Cells
read `t("state.allowed")` / `t("state.denied")` — two keys this package added to `content`'s `common`
namespace — and carry `data-allowed` for a design pass to hang an icon on. Biome's
`useAriaPropsSupportedByRole` rejects the shortcut of an `aria-label` on a bare `<span>`, correctly.

## Testing

```bash
pnpm --filter @loadbearing/feature test     # 12 tests
```

**The test doc 23 names as the one worth writing first** is in `tests/rbac/`: render the same
component with two different `CapabilitySetDto` fixtures and assert the answers differ. That single
test exercises the DTO round-trip, the session context and `CapabilitySet.can` at once — and fails
loudly the day the client and server stop agreeing about permissions.

The harness lives in `tests/support/render-with-fakes.tsx` and is **async**, because doc 23 builds it
on `BundledContentSource.snapshotSync` — a [30](../../../docs/setup/30-desktop-app.md) item that does
not exist yet. `StaticContentSource` gives the same snapshot asynchronously and nothing else changes.

`vitest.setup.ts` runs `afterEach(cleanup)`, which is **not optional** with `globals: false` — see
[`ui`](../../ui/docs/index.md) for the failure it prevents.

## Two things this package does not have

**No feature slices.** `AppContract` is `{}`, so there is nothing to query. The shape a slice takes
is in doc 23 §23.5.

**No `useQuery` anywhere** — which is why the conflict below has not bitten yet.

> [!WARNING]
> **Doc 23 §23.5's feature screen imports `useQuery` from `@tanstack/react-query`, and
> [21](../../../docs/setup/21-query-package.md)'s gate forbids exactly that** — it asserts the cache
> library appears in no package but `query`. The first real slice forces the choice: either `query`
> grows a `useAppQuery` beside the `useAppMutation` it already has, or `feature` is exempted from
> that gate. The first is smaller and matches the shape already set. Both documents now say so.
