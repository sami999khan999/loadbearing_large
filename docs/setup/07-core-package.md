# 07 · `@loadbearing/core`

> The smallest package, written first to prove the build pipeline end to end. Four primitives and nothing else.

**Delivers:** `Result`, `Clock`, `Uuid`, `ServerOnly`.

**Prerequisite:** [06 · Package Anatomy](06-package-anatomy.md)

---

## What belongs here

Only things that (a) every other package might need and (b) belong to no feature. The bar is deliberately high — this package depends on nothing at all, and every addition here is something that can never be tested with a fake.

```
packages/core/src/
├── index.ts
├── clock.ts          → Clock, SystemClock, FixedClock
├── result.ts         → Result, Ok, Err
├── uuid.ts           → Uuid
└── server-only.ts    → ServerOnly
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
  constructor(private readonly fixed: Date) {
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
export abstract class Result<T, E> {
  public abstract get isOk(): boolean;
  public abstract get isErr(): boolean;

  public abstract unwrapOr(fallback: T): T;
  public abstract map<U>(fn: (value: T) => U): Result<U, E>;
  public abstract mapErr<F>(fn: (error: E) => F): Result<T, F>;

  public static ok<T, E = never>(value: T): Result<T, E> {
    return new Ok(value);
  }

  public static err<E, T = never>(error: E): Result<T, E> {
    return new Err(error);
  }
}

export class Ok<T, E> extends Result<T, E> {
  constructor(public readonly value: T) {
    super();
  }

  public override get isOk(): boolean {
    return true;
  }

  public override get isErr(): boolean {
    return false;
  }

  public override unwrapOr(_fallback: T): T {
    return this.value;
  }

  public override map<U>(fn: (value: T) => U): Result<U, E> {
    return new Ok(fn(this.value));
  }

  public override mapErr<F>(_fn: (error: E) => F): Result<T, F> {
    return new Ok(this.value);
  }
}

export class Err<T, E> extends Result<T, E> {
  constructor(public readonly error: E) {
    super();
  }

  public override get isOk(): boolean {
    return false;
  }

  public override get isErr(): boolean {
    return true;
  }

  public override unwrapOr(fallback: T): T {
    return fallback;
  }

  public override map<U>(_fn: (value: T) => U): Result<U, E> {
    return new Err(this.error);
  }

  public override mapErr<F>(fn: (error: E) => F): Result<T, F> {
    return new Err(fn(this.error));
  }
}
```

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
export class Uuid {
  private constructor() {}

  /**
   * UUIDv7 — time-ordered. Sequential inserts stay on the right-hand side of the
   * B-tree instead of scattering across it, which is worth a lot on a table
   * that only ever grows.
   */
  public static v7(): string {
    const ts = BigInt(Date.now());
    const bytes = crypto.getRandomValues(new Uint8Array(16));
    for (let i = 0; i < 6; i++) bytes[i] = Number((ts >> BigInt(40 - i * 8)) & 0xffn);
    bytes[6] = (bytes[6]! & 0x0f) | 0x70;
    bytes[8] = (bytes[8]! & 0x3f) | 0x80;
    const h = [...bytes].map((b) => b.toString(16).padStart(2, "0")).join("");
    return `${h.slice(0, 8)}-${h.slice(8, 12)}-${h.slice(12, 16)}-${h.slice(16, 20)}-${h.slice(20)}`;
  }

  public static isValid(value: string): boolean {
    return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(value);
  }
}
```

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
    if (typeof window !== "undefined") {
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

Note `typeof window !== "undefined"` rather than a direct reference. `library.json` sets `lib: ["ES2024"]` with no DOM, so `window` is not a known identifier — the `typeof` guard is what lets this compile in a package that has never heard of a browser.

This is the second of three defences. The ESLint `no-restricted-imports` boundary ([05](05-lint-and-format.md)) is the first and catches the mistake at authoring time. This one catches it at runtime if someone adds an escape-hatch path. The CI bundle grep ([25](25-hygiene-and-ci.md)) catches it at build time if both are somehow bypassed.

Three feels like a lot for one mistake. It is calibrated to the cost: a Drizzle import reaching the client ships your connection string and full table shapes to anyone who opens devtools.

---

## Step 7.5 — The barrel

**`packages/core/src/index.ts`**

```ts
export * from "./clock.js";
export * from "./result.js";
export * from "./server-only.js";
export * from "./uuid.js";
```

Delete the placeholder `CorePackage` class — but only after [23](23-web-app.md), where it is used once to prove the workspace→bundler chain end to end. Until then, keep it exported.

---

## Step 7.6 — A first test

**`packages/core/src/clock.spec.ts`**

```ts
import { describe, expect, it } from "vitest";
import { FixedClock } from "./clock.js";

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

Tests are **colocated**, named `<subject>.spec.ts`. Not in a `__tests__/` directory, not in a top-level `test/`. When a file moves, its test moves with it, and a subject folder shows its own coverage at a glance.

Add a minimal Vitest config so `include` doesn't pick up `dist/`:

**`packages/core/vitest.config.ts`**

```ts
import { defineConfig } from "vitest/config";

export default defineConfig({
  test: { include: ["src/**/*.spec.ts"] },
});
```

---

## ✅ Gate

```bash
pnpm --filter @loadbearing/core build
pnpm --filter @loadbearing/core test
pnpm --filter @loadbearing/core lint
```

`packages/core/dist/` contains `index.js` and `index.d.ts`. **Do not proceed if it does not** — every later package copies this exact shape, and a problem here multiplies by fourteen.

---

[← Package Anatomy](06-package-anatomy.md) · [`@loadbearing/permissions` →](08-permissions-package.md)
