---
title: Comments
description: Line comments only, two lines maximum, and the argument for a design lives in docs/reference instead.
---

# Comments

## Every comment is `//`. There is no second form

No `/* */`, no `/** */`, anywhere in `src/` or `tests/` — not for a note above a class, not for a
section separator, not for commented-out code.

```ts
// packages/errors/src/error/app.error.ts
// The one failure shape, thrown on the server and rebuilt on the client. It carries
// no message — every word lives in `content`, keyed by code.
export abstract class AppError extends Error {
  public constructor(
    public readonly code: ErrorCode,
    public readonly context: ErrorContext = {},
    public readonly fields?: readonly FieldViolation[],
  ) {
    // The code *is* the message. Nothing else is ever assigned here.
    super(code);
    this.name = new.target.name;
  }
}
```

**One form means no decision.** A repository with both forms spends review cycles on which one this
line deserves, and the answer is never interesting. Picking one and applying it everywhere costs
nothing and settles the question permanently.

**What this gives up, stated honestly.** A block comment above a declaration is JSDoc: it reaches
editor hover, the generated `.d.ts`, and any API-docs tool pointed at the package. A `//` comment
reaches none of them. That is a real cost, accepted deliberately — because the place a consumer
should learn what `AppError` is for is the package's `docs/reference/app-error.md`, which can hold
a worked example and gets reviewed like prose. A hover tooltip cannot, and quietly rots.

## Two lines is the ceiling

A comment's job is to stop the *next* reader misreading the line under it. Anything longer is
documentation that has been pasted into the wrong file.

```ts
// `Object.hasOwn`, not `in` — `in` walks the prototype chain and admits `toString`.
public static isKnownCode(value: string): value is ErrorCode {
  return Object.hasOwn(ERROR_CATALOG, value);
}
```

The long-form reasoning — why `CapabilitySet.intersect()` unions denies and intersects grants, why
`CLIENT_CATALOG` needs string-literal `import()` specifiers, why `InternalError.cause` is
non-enumerable — lives in the package's `docs/reference/`, where it can have headings, worked
examples, and a description of the failure it prevents.

**Say the constraint in the code. Let the reference page carry the argument.**

Where the argument matters and a reader will want it, point at it:

```ts
// Narrow to the intersection with another set. Denies union, grants intersect, goal
// keys union — see docs/reference/capability-set.md for why each is load-bearing.
public intersect(other: CapabilitySet): CapabilitySet {
```

## Commented-out code is not a comment

A placeholder like this:

```ts
export const ERROR_CATALOG = {
  ...coreErrors,
  // ...billingErrors,
} as const;
```

becomes a sentence instead:

```ts
// Merged from team-owned fragments. Add them here — `...billingErrors`.
export const ERROR_CATALOG = {
  ...coreErrors,
} as const;
```

Git remembers the deleted version. A reader cannot tell a deliberate placeholder from a regression
someone commented out at 2am.

## Separators are `//` too

`import.ts` groups its specifiers under one separator per source:

```ts
// packages/core/src/import.ts
// Everything this package takes from outside itself, in one place. No relative
// re-exports live here — that is what keeps it cycle-free.

// ── @loadbearing/errors ──────────────────────────────────────────────────────
export { ServerOnlyError } from "@loadbearing/errors";
```

## The one place `/* */` survives

Documentation samples elide code with an inline block comment, because a `//` cannot close and let
the line continue:

```ts
const BY_MODULE: ReadonlyMap<string, readonly PermissionKey[]> = /* grouped once */;
```

That is a prose device inside a Markdown fence, not source. No file under `src/` or `tests/`
contains one.

## What this is not

**Not a rule against comments.** A comment that says why the obvious approach is wrong is worth
more than the line it sits above. `server-only.ts` reads `globalThis.window` instead of `window`,
and without the comment the next person "simplifies" it into a compile error:

```ts
// `globalThis.window`, not bare `window` — no DOM lib, so the identifier is TS2304.
if (typeof (globalThis as { window?: unknown }).window !== "undefined") {
```

**Not enforced by a linter — yet.** Neither Biome nor ESLint is configured with a comment-style
rule today, so this page is checked in review. That is the weakest kind of enforcement this
repository has, and moving it to a lint rule is worth doing.
