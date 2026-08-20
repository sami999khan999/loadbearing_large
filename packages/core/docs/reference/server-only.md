---
title: server-only
description: ServerOnly.assert — the runtime tripwire that catches database or credential code reaching a client bundle, and the two other defences it sits between.
---

# `ServerOnly`

```ts
export class ServerOnly {
  private constructor() {}

  /** Call at the top of every server-only package barrel. */
  public static assert(packageName: string): void {
    if (typeof (globalThis as { window?: unknown }).window !== "undefined") {
      throw new Error(
        `${packageName} was imported into a client bundle. This is a leak, not a bundle-size problem — ` +
          `it means database or credential code is reachable from the browser.`,
      );
    }
  }
}
```

---

## Who calls it

Four barrels, on their first line, before any other import has a chance to run side effects:

```ts
// packages/db/src/index.ts
import { ServerOnly } from "@loadbearing/core";
ServerOnly.assert("@loadbearing/db");
```

| Package | Why |
| --- | --- |
| `db` | connection pool, full table shapes |
| `infrastructure` | queue and cache clients, vendor SDKs |
| `auth` | signing secrets, session handling |
| `composition` | wires all three together |

---

## Three defences, one mistake

`ServerOnly` is the middle one. Each catches the leak at a different moment, and each can be
bypassed on its own.

| # | Defence | Catches it | Bypassed by |
| --- | --- | --- | --- |
| 1 | [`noRestrictedImports`](../../../../tooling/biome-config/docs/reference/boundary.md) in Biome, plus the ESLint boundary | authoring time | an `overrides` escape hatch, or a path nobody listed |
| 2 | **`ServerOnly.assert`** | runtime, on first import | never being reached because the import is tree-shaken |
| 3 | The CI bundle grep in [26](../../../../docs/setup/26-hygiene-and-ci.md) | build time | not building the app it greps |

> [!CAUTION]
> Three feels like a lot for one mistake. It is calibrated to the cost, not the likelihood: a
> Drizzle import reaching the client ships the shape of your connection string and your full table
> schema to anyone who opens devtools. It is not a bundle-size regression.

---

## Why the check goes through `globalThis`

The obvious spelling does not compile in this package:

```ts
if (typeof window !== "undefined") {   // TS2304: Cannot find name 'window'
```

> [!WARNING]
> **A `typeof` guard does not exempt an undeclared identifier.** TypeScript tolerates
> `typeof x` only when `x` is *declared* and might be `undefined` at runtime; on a name it has
> never heard of, it still errors. Verified — this is the first thing that fails when you build
> `core` from the doc's original listing.

[`library.json`](../../../../tooling/tsconfig/docs/reference/presets.md) sets `lib: ["ES2024"]` with no DOM, so
`window` is genuinely unknown here — and that is the point, not an oversight. Widening `globalThis`
to `{ window?: unknown }` performs the identical runtime test with a type the compiler can resolve:

```ts
if (typeof (globalThis as { window?: unknown }).window !== "undefined") {
```

Adding `"DOM"` to `lib` would fix the error and destroy the property being relied on. An ambient
`declare const window` would collide with `@types/node` wherever both reach one program. See
[uuid](uuid.md#why-crypto-is-not-a-global-here) for the same shape of problem with `crypto`.

---

## What it does not catch

- **A type-only import.** `import type { Db } from "@loadbearing/db"` emits nothing, so the barrel
  never runs. That is correct — nothing leaked.
- **A tree-shaken import.** If a bundler drops the barrel's side effect, the assert never fires.
  Defence 3 exists for this.
- **Server code running in a non-browser sandbox that happens to define `window`.** A false
  positive is possible in principle; none has occurred in practice, and the failure mode is a loud
  crash at startup rather than a silent leak.

The message is deliberately long. Whoever hits this is debugging a stack trace in a browser
console and needs to know immediately that the fix is architectural, not a bundler setting.

---

## The one error allowed to carry a message

[`@loadbearing/errors`](../../../errors/docs/index.md) makes an error carry a code and structured
context and **never prose** — user-visible words live in `content`, keyed and translated. This throw is
the single exception in the repository, and it is a deliberate one:

| Why it holds | |
| --- | --- |
| The reader is a developer | It fires at module load. No request, no locale, no `Translator`, no client. |
| The prose is the payload | "This is a leak, not a bundle-size problem" is what stops someone reaching for a bundler setting. A code plus `{ packageName }` says less. |
| It never crosses a wire | A build-time guard cannot reach a screen. |

`core` also sits *below* `errors`, so `AppError` is not importable here — but that is a consequence of
the ordering being right, not the justification. Don't invert the two packages to "fix" this, and don't
read it as licence to put prose in errors that do reach a user.

---

## See also

- [`@loadbearing/core`](../index.md)
- [Clock](clock.md) · [Result](result.md) · [Uuid](uuid.md)
- [The server-only boundary](../../../../tooling/biome-config/docs/reference/boundary.md) — defence 1
- [`@loadbearing/errors`](../../../errors/docs/index.md) — the rule this is the exception to
