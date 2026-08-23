---
title: Opinions
description: The positions this repository takes, stated flatly. Naming, folders, imports, classes, vocabulary, comments.
---

# Opinions

> Every rule this repository has decided, in one place. `docs/setup/` is the build order, walked
> once. This is the reference, consulted continually.

Each page states a position, gives the reason, and names the failure it prevents. Where a rule is
enforced by a linter or the type system, the page says which — a rule nothing checks is a
suggestion, and this repository prefers mechanical enforcement to good intentions.

---

## The test every opinion serves

**Given a feature name and a layer, you should be able to write the file path, the folder, and the
class name without looking anything up.**

That is the only justification any rule here needs. When a rule stops producing that property, the
rule has a gap worth fixing rather than working around.

---

## The pages

| Page | Decides |
|---|---|
| [Files](files.md) | Casing, role suffixes, one class per file |
| [Folders](folders.md) | What `src/` looks like, role folders vs subject folders, what may sit at the root |
| [Imports and exports](imports.md) | `index.ts`, `import.ts`, the three import rules, why `export *` is banned |
| [Classes and methods](classes.md) | Class-name grammar, banned suffixes, the method vocabulary |
| [Vocabulary](vocabulary.md) | Permissions, procedures, events, queues, contract members, database, env, React |
| [Comments](comments.md) | Line comments only, two lines, where the reasoning goes instead |

---

## The three that get broken most

**1. `src/` holds `index.ts`, `import.ts`, and folders. Nothing else.** Not a "just this one file"
helper, not a small type. The moment a loose file appears, the next one has a precedent.
See [Folders](folders.md).

**2. The barrel names every export.** `export *` republishes anything a file exports, which makes
widening the public API invisible in review. Enforced by Biome's `noReExportAll`.
See [Imports and exports](imports.md).

**3. Comments are `//`, and they stop at two lines.** The argument for a design belongs in the
package's `docs/reference/`, where it can have headings and worked examples and gets reviewed.
See [Comments](comments.md).

---

## Where these rules are enforced

| Rule | Enforced by |
|---|---|
| No `export *` | Biome `performance/noReExportAll` |
| Explicit member accessibility | Biome `style/useConsistentMemberAccessibility` |
| `import type` for type-only imports | Biome `style/useImportType` + `verbatimModuleSyntax` |
| No `process.env` outside `apps/*/src/env.ts` | Biome `style/noProcessEnv` |
| Layer bans (`ui` may not import `db`, …) | Biome `noRestrictedImports` overrides |
| `application` may not import `HTTP_STATUS` | ESLint `no-restricted-imports` |
| No exported free functions in OOP packages | ESLint `no-restricted-syntax` |
| Consistent file casing | `forceConsistentCasingInFileNames` |
| Everything else on these pages | Review |

The last row is the one to shrink. A rule that moves from "review" to a linter is a rule that stops
being argued about.
