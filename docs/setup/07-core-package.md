# 07 · `@loadbearing/core`

> The smallest package, written first to prove the build pipeline end to end. Four primitives and nothing else.

**Delivers:** `Clock`, `Result`, `Uuid`, `ServerOnly`.

**Prerequisite:** [06 · Package Anatomy](06-package-anatomy.md)

---

## What belongs here

Only things that (a) every other package might need and (b) belong to no feature. The bar is deliberately high — this package depends on nothing at all, and every addition here is something that can never be tested with a fake.

```
packages/core/
├── vitest.config.ts
├── src/
│   ├── index.ts
│   ├── clock.ts          → Clock, SystemClock, FixedClock
│   ├── result.ts         → Result, Ok, Err, Results
│   ├── uuid.ts           → Uuid
│   └── server-only.ts    → ServerOnly
└── tests/
    ├── clock.spec.ts
    ├── result.spec.ts
    └── uuid.spec.ts
```

---

## Step 7.1 — `Clock`

**`packages/core/src/clock.ts`**

```ts
export abstract class Clock {
  public abstract now(): Date;
}

export class SystemClock extends Clock {
  public override now(): Date {
    return new Date();
  }
}

export class FixedClock extends Clock {
  public constructor(private readonly fixed: Date) {
    super();
  }

  public override now(): Date {
    return this.fixed;
  }

  public advance(ms: number): FixedClock {
    return new FixedClock(new Date(this.fixed.getTime() + ms));
  }
}
```

This looks like over-engineering for `new Date()` until you count how much of a real product is time-dependent: deadlines, overdue detection, SLA thresholds, review integrity windows, token expiry, cache TTLs, rate-limit buckets. Every one of those rules needs testing, and testing them against the real system clock means either sleeping in tests or accepting flaky ones.

`FixedClock` makes "does a task go overdue at exactly midnight" a synchronous assertion. `advance()` returns a new instance rather than mutating, because a mutable clock shared between two assertions in the same test is its own source of confusion.

**The rule:** no code anywhere in `packages/` calls `Date.now()` or `new Date()` for a decision. Formatting a display string is fine; deciding whether something is overdue is not.

---

## Step 7.2 — `Result`

**`packages/core/src/result.ts`**

```ts
/**
 * The shared behaviour of both cases. Not exported — `Result` is the union below,
 * and that is what call sites annotate with. Only the union narrows in every
 * position; an abstract base class narrows a positive `instanceof` and nothing else,
 * because TypeScript can subtract a member from a union but not from a class.
 */
abstract class ResultBase<T, E> {
  public abstract unwrapOr(fallback: T): T;
  public abstract mapOk<U>(fn: (value: T) => U): Result<U, E>;
  public abstract mapErr<F>(fn: (error: E) => F): Result<T, F>;
}

export class Ok<T, E> extends ResultBase<T, E> {
  public readonly kind = "ok" as const;

  public constructor(public readonly value: T) {
    super();
  }

  public override unwrapOr(_fallback: T): T {
    return this.value;
  }

  public override mapOk<U>(fn: (value: T) => U): Result<U, E> {
    return new Ok(fn(this.value));
  }

  public override mapErr<F>(_fn: (error: E) => F): Result<T, F> {
    return new Ok(this.value);
  }
}

export class Err<T, E> extends ResultBase<T, E> {
  public readonly kind = "err" as const;

  public constructor(public readonly error: E) {
    super();
  }

  public override unwrapOr(fallback: T): T {
    return fallback;
  }

  public override mapOk<U>(_fn: (value: T) => U): Result<U, E> {
    return new Err(this.error);
  }

  public override mapErr<F>(fn: (error: E) => F): Result<T, F> {
    return new Err(fn(this.error));
  }
}

export type Result<T, E> = Ok<T, E> | Err<T, E>;

/**
 * Factories. A type alias cannot carry statics, so these live on their own class
 * rather than on `Result` — the one cost of making `Result` a union.
 */
export class Results {
  private constructor() {}

  public static ok<T, E = never>(value: T): Result<T, E> {
    return new Ok(value);
  }

  public static err<E, T = never>(error: E): Result<T, E> {
    return new Err(error);
  }
}
```

### Why `Result` is a union and not an abstract class

Every other port in this codebase is an abstract class, so this one being a `type` is worth
justifying. It is the only shape that narrows.

An earlier draft of this file had `Result` as an abstract base with `isOk`/`isErr` boolean getters.
Those getters cost twenty-two lines and bought nothing:

```ts
if (parsed.isOk) {
  parsed.value; // ✗ Property 'value' does not exist on type 'Result<number, string>'
}
```

Switching them to type predicates (`isOk(): this is Ok<T, E>`) fixes the positive branch and
nothing else. Verified against this repo's compiler flags:

| Position | abstract class | union |
| --- | --- | --- |
| `if (r.isOk()) { r.value }` | ✅ | ✅ |
| the `else` branch | ❌ stays `Result<T, E>` | ✅ narrows to `Err` |
| fall-through after `if (r.isErr()) return` | ❌ | ✅ |
| negative branch of `instanceof` | ❌ | ✅ |
| `switch (r.kind)` with no `default` | ❌ not exhaustive | ✅ exhaustive |

The reason is structural: **TypeScript can subtract a member from a union, but not from a class.**
`Result<T, E>` as a class has no "everything except `Ok`" to narrow to. As
`Ok<T, E> | Err<T, E>` it does.

So the accessors are gone entirely — `r.kind === "ok"` is the branch, and it narrows both ways.
`ResultBase` stays as an unexported abstract class purely to hold the three shared method
signatures; it never appears in a public type.

> [!NOTE]
> **The one cost is the factory name.** A type alias cannot carry statics, so `Result.ok(…)`
> becomes `Results.ok(…)`. That is the whole price. The factories exist rather than bare
> `new Ok(1)` because `E` is unconstrained by the constructor and would infer as `unknown`.

`ResultBase` is deliberately not exported, and `tsup` emits it as a local `declare abstract class`
that no public signature mentions.

### When to use `Result` and when to throw

This distinction matters, and getting it wrong produces either an exception-driven codebase or one where every call site has three lines of unwrapping.

| Situation | Use |
|---|---|
| Operation fails as part of normal business flow — validation, a lookup that legitimately misses, a parse of untrusted input | `Result` |
| An invariant is violated — the caller lacks permission, a referenced row must exist and doesn't, a config value is absent | **throw** a domain error from `application/error/` |

`ForbiddenError` throws. `NotFoundError` throws. A repository's `findByIdOrFail` throws. Those are all cases where the caller has no meaningful recovery and the transport adapter should map them to a status code.

`Result` is for cases where the caller *does* branch, and the discriminated return type makes the branch impossible to forget. `noUncheckedIndexedAccess` and `strict` give you most of that already, so `Result` should be the minority pattern. If it starts appearing everywhere, the codebase is drifting toward exception-free purism and away from readable use-cases.

---

## Step 7.3 — `Uuid`

**`packages/core/src/uuid.ts`**

```ts
/**
 * The one Web Crypto method this package uses.
 *
 * `library.json` sets `lib: ["ES2024"]` with no DOM, so `crypto` is not a declared
 * identifier in this package. It happens to resolve today because `tests/clock.spec.ts`
 * imports vitest, which pulls vite's `/// <reference types="node" />` and with it
 * the `@types/node` globals into the program — so deleting the tests, or dropping
 * `tests/**` from this package's tsconfig `include`, would stop `Uuid` from
 * compiling. Naming the method and reaching it off `globalThis` makes the type
 * independent of whatever else lands in the program.
 */
type WebCrypto = {
  getRandomValues<T extends ArrayBufferView>(array: T): T;
};

export class Uuid {
  private constructor() {}

  private static webCrypto(): WebCrypto {
    return (globalThis as unknown as { crypto: WebCrypto }).crypto;
  }

  /**
   * UUIDv7 — time-ordered. Sequential inserts stay on the right-hand side of the
   * B-tree instead of scattering across it, which is worth a lot on a table
   * that only ever grows.
   */
  public static v7(): string {
    const ts = BigInt(Date.now());
    const bytes = Uuid.webCrypto().getRandomValues(new Uint8Array(16));
    for (let i = 0; i < 6; i++) {
      bytes[i] = Number((ts >> BigInt(40 - i * 8)) & 0xffn);
    }
    // Version 7 into the high nibble of byte 6, RFC 9562 variant into the top two
    // bits of byte 8. The `?? 0` can never fire — a Uint8Array(16) always has both
    // indices — but `noUncheckedIndexedAccess` types the read as possibly-undefined
    // and this discharges it without a non-null assertion.
    bytes[6] = ((bytes[6] ?? 0) & 0x0f) | 0x70;
    bytes[8] = ((bytes[8] ?? 0) & 0x3f) | 0x80;
    const h = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  public static isValid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }
}
```

> [!IMPORTANT]
> **`crypto` is not a global this package can see.** TypeScript declares it only in
> `lib.dom.d.ts` and `lib.webworker.d.ts`, and `library.json` loads neither. Written as a bare
> `crypto.getRandomValues(...)` the file compiles *by accident*: `tests/clock.spec.ts` imports
> vitest, vitest's types pull in vite's, and vite carries `/// <reference types="node" />`. Delete
> the spec file and `Uuid` stops compiling with `TS2304: Cannot find name 'crypto'` — verified.
>
> This accident survives tests living in `tests/` rather than `src/` *only* because the tsconfig
> `include` lists `tests/**` alongside `src/**`, keeping both in one program. Drop that glob and
> the bare-`crypto` form fails again — also verified.
>
> Adding `@types/node` would fix it and cost more than it saves: `core` is the one package that
> must typecheck as isomorphic, and `@types/node` would also make `process` and `Buffer`
> resolve here. The four-line `WebCrypto` type is the smaller commitment.

**Why v7 rather than v4.** Every primary key in the schema is a UUID. Random v4 keys mean each insert lands at a random point in the index, so the B-tree fragments and the working set is the whole index rather than its tail. v7 embeds a millisecond timestamp in the high bits, so inserts are append-mostly and rows created together sit together on disk. On a table with a few hundred thousand rows the difference is measurable; on a few million it is the difference between a fast insert path and a slow one.

The side effect — IDs leak creation time — is worth knowing about. It is fine for internal identifiers and worth avoiding for anything a customer sees in a URL where enumeration order matters.

`crypto.getRandomValues` is the Web Crypto API, global in Node 19+ and in every browser. No import, no polyfill, and it works in a Tauri webview.

---

## Step 7.4 — `ServerOnly`

**`packages/core/src/server-only.ts`**

```ts
export class ServerOnly {
  private constructor() {}

  /** Call at the top of every server-only package barrel. */
  public static assert(packageName: string): void {
    // `library.json` sets lib: ["ES2024"] with no DOM, so a bare `window` is an
    // unresolved identifier (TS2304) even behind `typeof`. Reaching it as an
    // optional property of `globalThis` is the same runtime check, expressed in
    // a way a package that has never heard of a browser can compile.
    if (typeof (globalThis as { window?: unknown }).window !== "undefined") {
      throw new Error(
        `${packageName} was imported into a client bundle. This is a leak, not a bundle-size problem — ` +
          `it means database or credential code is reachable from the browser.`,
      );
    }
  }
}
```

Four packages call this on their first line: `db`, `infrastructure`, `auth`, `composition`.

```ts
// packages/db/src/index.ts
import { ServerOnly } from "@loadbearing/core";
ServerOnly.assert("@loadbearing/db");
```

Note the check goes through `globalThis` rather than naming `window` directly. `library.json` sets `lib: ["ES2024"]` with no DOM, so `window` is not a known identifier in this package.

> [!WARNING]
> **A bare `typeof window !== "undefined"` does not compile here.** TypeScript's `typeof` guard
> only tolerates a *declared* binding that might be `undefined` at runtime; on a name it has
> never heard of it still reports `TS2304: Cannot find name 'window'` — verified. Widening
> `globalThis` to `{ window?: unknown }` is the same runtime test with a type the compiler can
> resolve, and it needs neither the DOM lib nor an ambient `declare` that would collide with
> `@types/node` wherever both land in one program.

This is the second of three defences. The ESLint `no-restricted-imports` boundary ([05](05-lint-and-format.md)) is the first and catches the mistake at authoring time. This one catches it at runtime if someone adds an escape-hatch path. The CI bundle grep ([25](25-hygiene-and-ci.md)) catches it at build time if both are somehow bypassed.

Three feels like a lot for one mistake. It is calibrated to the cost: a Drizzle import reaching the client ships your connection string and full table shapes to anyone who opens devtools.

---

## Step 7.5 — The barrel

**`packages/core/src/index.ts`**

```ts
export { Clock, FixedClock, SystemClock } from "./clock.js";
export { Err, Ok, type Result, Results } from "./result.js";
export { ServerOnly } from "./server-only.js";
export { Uuid } from "./uuid.js";

/**
 * Placeholder kept only until doc 23, where apps/web imports it once to prove the
 * workspace → bundler chain end to end. Delete it after that step, not before.
 */
export class CorePackage {
  public static readonly id = "@loadbearing/core";
}
```

**Every export is named; `export *` is a lint error** ([28](28-naming-and-boundaries.md#13-barrels-and-imports)). `Result` is a type alias, so it carries the inline `type` modifier and stays erased under `verbatimModuleSyntax`. `ResultBase` never appears, which here costs nothing because it was never exported from `result.ts` either — but that is the point of the named list: once a sibling file legitimately needs a symbol and `export` goes on it, the barrel is what decides whether the rest of the repository sees it.

The scaffold from [06](06-package-anatomy.md) wrote `CorePackage` as the whole of `index.ts`. Keep it — [23](23-web-app.md) imports it once to prove the workspace→bundler chain end to end, and it is deleted there, not here. It is the only class in the codebase that lives in a barrel rather than its own file, for exactly as long as it exists.

---

## Step 7.6 — A first test

**`packages/core/tests/clock.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { FixedClock } from "../src/clock.js";

describe("FixedClock", () => {
  it("returns the fixed instant", () => {
    const at = new Date("2026-01-01T00:00:00.000Z");
    expect(new FixedClock(at).now()).toEqual(at);
  });

  it("advances without mutating", () => {
    const clock = new FixedClock(new Date("2026-01-01T00:00:00.000Z"));
    const later = clock.advance(60_000);

    expect(later.now().toISOString()).toBe("2026-01-01T00:01:00.000Z");
    expect(clock.now().toISOString()).toBe("2026-01-01T00:00:00.000Z");
  });
});
```

Tests live in a per-package **`tests/`** directory, named `<subject>.spec.ts`, mirroring the `src/` tree they cover. Not colocated in `src/`, not in a `__tests__/` directory, and not in one repo-wide `test/` folder.

Per-package rather than repo-wide because each package owns its own `vitest.config.ts` and `test` script, and the root `pnpm -r --parallel run test` fans out to them — a single root config would have to be re-split the moment `ui` needs jsdom or `db` needs a live Postgres. Outside `src/` rather than beside it so `src/` is exactly the shipped surface: `tsup` builds from `src/index.ts` and the `development` export condition points into `src/`, and neither should be able to reach a spec file. The cost is that a subject and its test are no longer adjacent; the mirrored layout is what pays for it — `src/clock.ts` is tested by `tests/clock.spec.ts`, always.

One consequence to keep in mind: `tests/**` has to stay in the package's tsconfig `include`, or `tsc --noEmit` silently stops typechecking the tests.

Add one for `Uuid` too — it is the only primitive here whose behaviour is not obvious by reading it, and `vi.setSystemTime` makes the timestamp claim testable rather than assumed.

**`packages/core/tests/uuid.spec.ts`**

```ts
import { afterEach, describe, expect, it, vi } from "vitest";
import { Uuid } from "./uuid.js";

describe("Uuid", () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it("generates a value its own validator accepts", () => {
    expect(Uuid.isValid(Uuid.v7())).toBe(true);
  });

  it("stamps the version and variant nibbles", () => {
    const value = Uuid.v7();

    expect(value[14]).toBe("7");
    expect(value[19]).toMatch(/[89ab]/);
  });

  it("encodes the current millisecond in the leading 48 bits", () => {
    const at = new Date("2026-01-01T00:00:00.000Z");
    vi.useFakeTimers();
    vi.setSystemTime(at);

    const value = Uuid.v7();
    const leading = value.slice(0, 8) + value.slice(9, 13);

    expect(leading).toBe(at.getTime().toString(16).padStart(12, "0"));
  });

  it("differs between two calls in the same millisecond", () => {
    vi.useFakeTimers();
    vi.setSystemTime(new Date("2026-01-01T00:00:00.000Z"));

    expect(Uuid.v7()).not.toBe(Uuid.v7());
  });

  it("rejects a malformed value", () => {
    expect(Uuid.isValid("not-a-uuid")).toBe(false);
    expect(Uuid.isValid("0195f0a0-0000-7000-0000-000000000000")).toBe(false);
  });
});
```

The last assertion is the one worth keeping: `isValid` checks the *variant* nibble, not the version, so a well-formed string with a zero variant is correctly rejected while `…-7000-…` in the version position is not what the regex is looking at.

**`packages/core/tests/result.spec.ts`** covers the factories and `mapOk`/`mapErr` the ordinary way, and then pins the narrowing:

```ts
describe("narrowing", () => {
  const widen = (r: Result<number, string>): Result<number, string> => r;

  it("narrows the fall-through after an early return", () => {
    const first = (r: Result<number, string>): number => {
      if (r.kind === "err") {
        return -1;
      }
      return r.value; // only compiles if the union narrowed
    };

    expect(first(widen(Results.ok(7)))).toBe(7);
    expect(first(widen(Results.err("nope")))).toBe(-1);
  });
});
```

> [!TIP]
> These are **compile-time assertions wearing a test's clothes**. `tests/` is inside the package's
> tsconfig `include`, so if `Result` ever regresses to a shape that does not narrow,
> `pnpm typecheck` fails on this file before a single test runs. The `widen` helper matters —
> without it `Results.ok(7)` infers as `Ok<number, string>`, which narrows trivially and would
> prove nothing.

Add a minimal Vitest config so `include` points at `tests/` and doesn't pick up `dist/`:

**`packages/core/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["tests/**/*.spec.ts"] },
});
```

---

## ✅ Gate

```bash
pnpm check                                  # format + organise imports, first
pnpm --filter @loadbearing/core build
pnpm --filter @loadbearing/core test
pnpm --filter @loadbearing/core typecheck
pnpm lint                                   # biome check . && eslint .
```

> [!NOTE]
> **Lint is a root script, not a per-package one.** No package defines a `lint` script — Biome and
> ESLint both run once over the whole repo from the root, so `pnpm --filter @loadbearing/core lint`
> fails with `Command "lint" not found`. To narrow it while iterating, use
> `pnpm exec biome check packages/core`.
>
> Run `pnpm check` **before** `pnpm lint`, for the same reason [06](06-package-anatomy.md) does.

`packages/core/dist/` contains `index.js` and `index.d.ts`. **Do not proceed if it does not** — every later package copies this exact shape, and a problem here multiplies by fourteen.

Three of the four primitives come out of the build with the shape you expect; check that `index.d.ts` exports all of `Clock`, `SystemClock`, `FixedClock`, `Result`, `Ok`, `Err`, `ServerOnly`, `Uuid` and the temporary `CorePackage`. `Uuid`'s `private static webCrypto` appears in the declaration as an unresolved private — that is normal, and it is why the `WebCrypto` type is not exported.

---

[← Package Anatomy](06-package-anatomy.md) · [`@loadbearing/permissions` →](08-permissions-package.md)
