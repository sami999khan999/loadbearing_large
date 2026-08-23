---
title: namespace
description: The closed MessageKey union derived from type-only imports — how the key guarantee survives splitting the runtime data into one chunk per locale and namespace.
---

# `namespace.ts`

The type layer. Nothing in this file emits a single byte of JavaScript, and that is the entire trick.

```ts
import type { common } from "./en/common.js";
import type { error } from "./en/error.js";

interface NamespaceShape {
  readonly common: typeof common;
  readonly error: typeof error;
}

export type ShellNamespace = "common" | "error";
export type ClientNamespace = ShellNamespace;
export type Namespace = ClientNamespace;

export type NamespaceKeys = { [K in Namespace]: keyof NamespaceShape[K] & string };

export type MessageKey = NamespaceKeys[Namespace];
export type ShellMessageKey = NamespaceKeys[ShellNamespace];

export type NamespaceBundle<N extends Namespace> = Partial<Record<NamespaceKeys[N], string>>;
export type MessageBundle = Partial<Record<MessageKey, string>>;
export type MessageParams = Readonly<Record<string, string | number | boolean>>;

export const SHELL_NAMESPACES: readonly ShellNamespace[] = ["common", "error"];
export const CLIENT_NAMESPACES: readonly ClientNamespace[] = ["common", "error"];
```

> [!NOTE]
> **Two namespaces today, five when the package is finished.** `nav`, `auth` and the server-only
> `email` join `NamespaceShape` and the unions at their own build steps. Nothing else in this file
> changes, and no consumer changes — see [the second pass](#what-widening-namespace-changes).

---

## Types are erased; runtime data is not

`verbatimModuleSyntax` guarantees an `import type` emits nothing. So this module can name every
English catalog file in the package and still, at runtime, be an empty object with two arrays in it.

That is what lets `MessageKey` stay one closed union while the actual copy lives in chunks that only
[`CLIENT_CATALOG`](../index.md) reaches, by dynamic import, one locale × namespace at a time.

An earlier design merged the namespaces into a single frozen `en` object and took
`keyof typeof en`. It produced the same union and a much worse runtime: `Translator` needed all of
English resident, `StaticContentSource` had to import every locale statically, and the consequence
was a browser downloading Bengali it would never read plus the worker's email copy it could never
render. **The merge was the bug**, not the union.

---

## `NamespaceKeys` is a mapped type deliberately

The tempting alternative is a template-literal constraint, and it silently does nothing:

```ts
declare function t<N extends string>(ns: N, key: Extract<MessageKey, `${N}.${string}`>): string;
t("auth", "error.forbidden");   // compiles — the constraint is decorative
```

It fails because the key position is *also* an inference site, so `N` widens to satisfy both
arguments. `NamespaceKeys[N]` — an indexed access into a mapped type — is not an inference site, and
rejects the same call. Verified both ways against this repo's compiler flags.

Deriving from the module type rather than a string prefix also handles `common`, whose keys are
`action.save` and `state.loading`. **Its prefix is not its namespace name**, and any template-literal
scheme breaks on it.

---

## `ShellMessageKey` vs `MessageKey`

| Type | Means | Used by |
| --- | --- | --- |
| `MessageKey` | any key in any namespace | `t()`, `MessageBundle` |
| `ShellMessageKey` | only keys guaranteed present in every snapshot | `ERROR_COPY`, `FIELD_RULE_COPY` |

`common` and `error` arrive in every snapshot from every `ContentSource`; everything else is loaded
because a route asked for it. A key from an unloaded namespace renders as the key itself, which is
the right failure for feature copy and the wrong one for an error page.

Typing [`ERROR_COPY`](error-copy.md#the-value-type-is-shellmessagekey-and-that-is-load-bearing)
against the shell makes "an error code cannot point at lazy copy" a compile error rather than a rule
somebody remembers.

---

## `NamespaceBundle<N>` is `Partial` per namespace, not per locale

```ts
// bn/error.ts
export const error: NamespaceBundle<"error"> = {
  "error.forbidden": "এটি করার অনুমতি আপনার নেই।",
  "action.save": "সংরক্ষণ",   // compile error — that key belongs to `common`
};
```

Two properties at once, and the second is the interesting one:

- **`Partial`** — translations arrive incrementally. Requiring completeness means either blocking a
  locale until it is finished or filling it with placeholder English nobody notices needs replacing.
- **Per namespace** — a key from another namespace in this file is a compile error, which is what
  stops `bn/nav.ts` from quietly shipping auth copy inside the nav chunk. **The chunk boundary and
  the type boundary are the same boundary.**

English files are `as const` rather than `NamespaceBundle<N>`: they are the source the union is
derived *from*, so they cannot be checked against it, and they are the fallback layer, so they must
be complete.

---

## `MessageParams`

```ts
export type MessageParams = Readonly<Record<string, string | number | boolean>>;
```

`boolean` is here because `ErrorContext` in `@loadbearing/errors` allows it. That makes
`ErrorCopy.message` able to hand an envelope's context straight to `t()` with no mapping step, and
`String(value)` renders a boolean fine. Narrowing this to `string | number` breaks the most important
call site in the package, and the fix people reach for is a cast.

---

## What widening `Namespace` changes

```ts
import type { auth } from "./en/auth.js";     // + 3 type-only imports
import type { email } from "./en/email.js";
import type { nav } from "./en/nav.js";

interface NamespaceShape {
  readonly common: typeof common;
  readonly nav: typeof nav;                    // +
  readonly auth: typeof auth;                  // +
  readonly error: typeof error;
  readonly email: typeof email;                // +
}

export type ClientNamespace = ShellNamespace | "nav" | "auth";
export type ServerNamespace = "email";
export type Namespace = ClientNamespace | ServerNamespace;

export const CLIENT_NAMESPACES: readonly ClientNamespace[] = ["common", "error", "nav", "auth"];
```

`ShellNamespace`, `NamespaceKeys`, `MessageKey`, `ShellMessageKey`, `NamespaceBundle`,
`MessageBundle` and `MessageParams` are untouched. `CLIENT_CATALOG` gains two cells per namespace and
fails to compile until it has them — which is the reason the union and the catalog are separate
declarations.

**This is why building the error slice early was safe.** `MessageKey` is a closed union over two
namespaces exactly as rigorously as over five, and `ERROR_COPY` is total today.

---

## See also

- [error-copy](error-copy.md) — the one consumer of `ShellMessageKey`
- [Translator](translator.md) — what happens to a key whose namespace never loaded
- [ContentSource](content-source.md) — where `SHELL_NAMESPACES` is enforced
