---
title: Imports and exports
description: index.ts is what a package gives, import.ts is what it takes. Barrels name every export; export * is banned.
---

# Imports and exports

## One public entrypoint: `src/index.ts`

It re-exports and contains no logic. The `exports` map points at it and nothing else — no deep
subpaths, so no consumer can reach into a package's internals and break when you move a file.

The only permitted extra exports are non-JS side-effect files that physically cannot live in a
barrel: `@loadbearing/asset` ships `./font.css` and `./sprite.svg`; `@loadbearing/ui` ships
`./token.css` and `./theme.css`. **A package wanting extra JavaScript subpaths is a signal it should
be two packages.**

## Barrels name every export. `export *` is banned

```ts
// packages/core/src/primitive/index.ts
export { Clock, FixedClock, SystemClock } from "./clock.js";
export { Err, Ok, type Result, Results } from "./result.js";
export { ServerOnly } from "./server-only.js";
export { Uuid } from "./uuid.js";
```

Enforced by Biome's `performance/noReExportAll`, set to `error` ([05](../setup/05-lint-and-format.md)).

Four reasons, in the order they will bite you:

**1. `export *` makes the public API an accident.** With a star, adding `export` to any symbol in
any file silently publishes it to every consumer in the repository. The reviewer looking at the diff
on `clock.ts` sees a new class; they do not see that the package's public surface just grew. With a
named list, widening the API is a second, deliberate edit — visible in the diff, reviewable on its
own terms, and attributable. **The surface is a decision, not a side effect.**

**2. It gives you a private layer.** Under `export *`, every symbol a sibling needs is automatically
public. Under a named list, `capability-set.ts` can export a helper that `permission-registry.ts`
imports directly while the barrel never mentions it — internal by default, public by choice.

**3. Collisions fail silently.** Two starred files exporting the same name do not error. ESM
resolves the ambiguity by excluding the name from the namespace entirely, so the export vanishes and
the failure surfaces downstream as an import that resolves to `undefined`. A named list produces a
duplicate-identifier error at the barrel, on the line that caused it.

**4. `verbatimModuleSyntax` needs the distinction.** Named re-exports carry the inline `type`
modifier — `export { Err, Ok, type Result, Results }` — so type-only symbols stay erased. A star
export cannot say which of its names are types.

**Ordering is not yours to choose.** `biome check --write` sorts the statements by module specifier
and the specifiers inside each brace alphabetically, ignoring the `type` keyword.

**One exemption: `packages/db/src/schema.ts`.** It exists so `drizzle-kit` and
`drizzle(pool, { schema })` receive every table, relation, and enum; hand-enumerating them would add
no API-surface safety, because the file is not an entrypoint. The Biome rule is switched off for
that one path and nowhere else. The namespace re-export itself is two statements, because
`export * as schema from` is a star export too:

```ts
// packages/db/src/index.ts
import * as schema from "./schema.js";

export { schema };
```

**Code-splitting a package's internals is not widening its API.** `packages/content` reaches its
per-namespace catalogs by dynamic `import()` *inside* the package; the bundler emits separate
chunks and the public surface is still one barrel. The rule is about what an importer may name, not
about how many files the bundler emits.

## Three import rules, in priority order

1. **Across packages** — always the package name, and always through `import.ts`:
   `export { TaskEntity } from "@loadbearing/contracts"`.
2. **Across folders inside a package** — the folder barrel:
   `import { Locales } from "../primitive/index.js"`.
3. **Within one folder** — the direct file: `import { AppError } from "./app.error.js"`.

**Rule 3 is not stylistic.** Importing a sibling *through* your own folder barrel is the standard
way to create a circular import, and the failure mode is a runtime `undefined` at module-init time
that looks nothing like an import problem.

**Rule 2 yields to rule 3's reasoning when a barrel would close a loop.** `permissions` has one:

```ts
// packages/permissions/src/capability/capability-set.ts
// The direct file, not `../registry/index.js`: that barrel also loads
// `module-registry.ts`, which imports this folder back. Type-only today, so the
// barrel would work — but this import is what would break the day it is not.
import { type PermissionKey, PermissionRegistry } from "../registry/permission-registry.js";
```

Write the comment when you do this. An unexplained deep import reads like carelessness.

## One outside surface: `src/import.ts`

**Every import from another workspace package or an npm dependency is written once here and
re-exported; the rest of `src/` imports it from `./import.js`.**

```ts
// packages/content/src/import.ts
// Everything this package takes from outside itself, in one place. No relative
// re-exports live here — that is what keeps it cycle-free.

// ── @loadbearing/errors ──────────────────────────────────────────────────────
export type { ErrorCode, ErrorEnvelope, FieldViolation } from "@loadbearing/errors";
```

```ts
// packages/content/src/message/error-copy.ts
import type { ErrorCode, ErrorEnvelope, FieldViolation } from "../import.js";
```

One file answers "what does this package actually use?" — no grep across twenty modules, and no
drift between `package.json` and the code. Group the specifiers under a separator comment per
source, workspace packages before npm ones.

> [!WARNING]
> **`import.ts` re-exports external modules only. Never a relative one.** That single constraint is
> what separates this from the shared-hub anti-pattern: with no edge back into the package,
> `import.ts` cannot participate in a cycle. Re-export `./translator.js` from it once and you have
> rebuilt exactly the barrel-cycle that rule 3 exists to prevent.

**`import.ts` governs `src/`, not `tests/`.** A spec imports its subject by relative path and its
harness — `vitest`, `zod`, an `oc` fixture — directly. Routing a test's `vitest` import through the
package's outside surface would put the test runner in the shipped dependency list.

**A package with no `import.ts` depends on nothing outside itself**, and that is the statement —
`@loadbearing/errors` and `@loadbearing/permissions` have none. Never commit an empty one.

The `no-restricted-imports` blocks in `tooling/eslint-config` match on the specifier, so they fire
on `import.ts` and nowhere else. That is the right place: the ban on `application` importing
`HTTP_STATUS` is checked at the one line that could introduce it.

## `.js` extensions on every relative import

`moduleResolution: "Bundler"` doesn't require them, but `NodeNext` in `apps/worker` does. Writing
them everywhere means code moves between the two without an edit.
