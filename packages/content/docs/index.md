---
title: "@loadbearing/content"
description: Every user-visible string, split by locale and namespace so no runtime downloads words it cannot use. Partially built — the error slice exists, the rest arrives with the features that need it.
---

# `@loadbearing/content`

The only package in this repository allowed to hold a sentence. `@loadbearing/errors` names failures
and carries structured context; `Error.message` there is the code. Every word a person actually reads
lives here, keyed and translated.

| | |
| --- | --- |
| **Package** | `@loadbearing/content` (private, never published) |
| **Entrypoint** | `src/index.ts` |
| **Depends on** | `@loadbearing/errors` (type-only), `@loadbearing/asset`, `zod` |
| **Used by** | `composition`, `feature`, `apps/web`, `apps/worker`, `apps/desktop` |
| **Environment** | isomorphic and **React-free** — the worker renders email copy with the same class the browser uses |
| **Build** | `tsup` → one chunk per locale × namespace, plus the entry |

> [!IMPORTANT]
> **This package is deliberately half-built.** The error slice below is finished and tested; the
> document, collection, media and message-store halves are not written yet. `@loadbearing/errors`
> has no other half — a code with no copy is a raw `SERVER_ONLY` rendered to a customer — and
> `ServerOnly.assert` in `core` throws before anything else in the repository runs, so the copy had
> to exist first. Nothing in the reduced form is provisional; see
> [What exists](#what-exists-and-what-does-not) for the exact line.

```
packages/content/
├── vitest.config.ts               ← resolve.conditions: ["development"], for the errors import
├── src/
│   ├── index.ts                   ← the public barrel; names only folder barrels
│   ├── import.ts                  ← ErrorCode, ErrorEnvelope, FieldViolation from `errors`
│   ├── primitive/
│   │   ├── index.ts
│   │   └── locale.ts              → Locale, Locales
│   ├── translator/
│   │   ├── index.ts
│   │   └── translator.ts          → Translator, MessageSnapshot
│   ├── source/
│   │   ├── index.ts
│   │   ├── content-source.ts      → ContentSource (abstract)
│   │   └── static.content-source.ts → StaticContentSource
│   └── message/
│       ├── index.ts
│       ├── namespace.ts           → MessageKey, ShellMessageKey, NamespaceBundle, MessageParams
│       ├── catalog.ts             → CLIENT_CATALOG  (locale × namespace → loader)
│       ├── error-copy.ts          → ERROR_COPY, FIELD_RULE_COPY, ErrorCopy
│       ├── en/                    ← as const; the key union is derived from these
│       │   ├── common.ts
│       │   └── error.ts
│       └── bn/                    ← NamespaceBundle<N>; Partial by design
│           ├── common.ts
│           └── error.ts
└── tests/
    ├── primitive/
    │   └── locale.spec.ts
    ├── translator/
    │   └── translator.spec.ts
    ├── source/
    │   └── static.content-source.spec.ts
    └── message/
        └── error-copy.spec.ts
```

---

## The four ideas

### 1. Copy splits by locale **and** by namespace

A key belongs to a namespace, a namespace loads as its own chunk, and a chunk is fetched for one
locale at a time. `CLIENT_CATALOG` is a `locale × namespace` grid of dynamic-import loaders, so a
browser reading English never downloads Bengali and never downloads the worker's email copy.

An earlier design merged every namespace into one frozen `en` object and derived the key union from
it. That object was load-bearing: `Translator` needed all of English resident, so every locale rode
into every bundle. **Merging was the bug.** [`namespace.ts`](reference/namespace.md) keeps the closed
key union and drops the merge, which works only because types are erased and runtime data is not.

### 2. The key union stays closed anyway

```ts
t("error.frobidden");   // compile error
```

`MessageKey` is derived from **type-only** imports of the English files. A typo at a call site is a
build failure, and `ERROR_COPY` is total over `ErrorCode` — even though the runtime data lives in
four separate chunks that no module imports statically.

### 3. Two namespaces are guaranteed; everything else is lazy

`common` and `error` are the *shell*. `ContentSource.resolve()` unions them into every request, so a
route that declares `["auth"]` still gets working error copy and loading states. That is a property
of the seam, not a convention every call site remembers.

It is also why `ERROR_COPY` is typed `Record<ErrorCode, ShellMessageKey>` rather than
`Record<ErrorCode, MessageKey>` — an error code pointed at a lazy namespace would render as its own
raw key on the one screen that cannot afford a wiring bug.

### 4. Content references the security surface; it never defines it

Nav items will carry `module: "rbac"`, never `permission: "rbac.role.read"`. An editor can reorder a
menu; an editor cannot change what gates it. ESLint bans importing `PermissionKey` here, and the ban
is configured and passing today — vacuously, until `nav.data.ts` exists.

---

## The error slice, end to end

```ts
// somewhere on the server
throw new ForbiddenError("task.reactivate", goalId);

// at the boundary
const envelope = ErrorNormalizer.normalize(thrown).toJSON();
// { code: "FORBIDDEN", context: { permission: "task.reactivate", goalId } }

// in the client, in the client's locale
const t = await content.translator(locale, []);
ErrorCopy.message(t, envelope);   // "You do not have permission to do that."
```

The server sent no prose, so there was no server-side locale negotiation for the API error, and a
desktop app running in a different language than the server is correct for free.

The sharpest case is the one that used to be an exception:

```ts
ServerOnly.assert("@loadbearing/db");
// ServerOnlyError: SERVER_ONLY   context: { package: "@loadbearing/db" }

ErrorCopy.message(t, error.toJSON());
// "@loadbearing/db was imported into a client bundle. This is a leak, not a bundle-size
//  problem — it means database or credential code is reachable from the browser."
```

That sentence used to be a string literal inside `ServerOnly.assert`, and it was the one error in the
repository permitted to carry a message. Moving it here cost nothing and removed the exception — see
[`errors`](../../errors/docs/index.md) and
[core's `ServerOnly`](../../core/docs/reference/server-only.md).

---

## What exists, and what does not

| Area | State |
| --- | --- |
| `locale.ts`, `translator.ts` | ✅ final |
| `message/en/{common,error}.ts`, `message/bn/{common,error}.ts` | ✅ final |
| `message/namespace.ts` | ◐ two namespaces; gains `nav`, `auth`, `email` as union members |
| `message/catalog.ts` | ◐ four cells; gains two per namespace |
| `message/error-copy.ts` | ✅ final |
| `content-source.ts`, `static.content-source.ts` | ◐ `messages()` / `translator()`; gains `media()`, `nav()`, `document()` |
| `message/catalog.server.ts` — `SERVER_CATALOG` | ☐ nothing to add until `email` exists |
| `media/`, `document/`, `collection/` | ☐ |
| `message-store.ts` — `MessageStore` | ☐ deferred until a route loader calls `ensure()` |
| `bundled.content-source.ts` — `BundledContentSource` | ☐ lands with the desktop app |

**Widening `Namespace` is additive.** `ShellNamespace`, `NamespaceKeys`, `MessageKey`,
`ShellMessageKey`, `NamespaceBundle`, `MessageBundle` and `MessageParams` are untouched by it, and no
consumer changes. That is what made building the error slice early safe rather than a down payment
on a rewrite.

> [!NOTE]
> **`"sideEffects": false` is load-bearing in this package**, not a kilobyte optimisation.
> `BundledContentSource` will statically import every locale, and `feature` imports `Translator`
> from the same barrel. Without the flag no bundler can prove the unused class is droppable, and the
> Bengali catalog rides into the client chunk through a barrel that never asked for it.

---

## Testing

28 tests.

```bash
pnpm --filter @loadbearing/content test
```

The ones worth knowing about:

- **Every `ErrorCode` resolves against a snapshot that asked for nothing.** `t.has(ERROR_COPY[code])`
  is `true` for all ten, built from `messages("en", [])`. This is what catches a code pointed at a
  lazy namespace once `ShellMessageKey` widens — the compiler cannot.
- **The `errors` seam round-trips.** `ServerOnlyError`'s sentence comes out whole, with `{package}`
  substituted. `errors` pins the context key from its side; neither package can see the other's half.
- **Every rule `ValidationError` can emit has copy** — driven from `ValidationError.fromIssues`
  rather than a hand-written list, so a new Zod issue mapping cannot slip past.
- **The shell arrives unasked**, and English rides alongside Bengali per namespace.
- **An unknown placeholder is left in place.** `"Hello {nmae}"` is obviously a bug;
  `"Hello undefined"` reads like a data problem and gets investigated in the wrong place.

---

## See also

- [namespace](reference/namespace.md) · [Translator](reference/translator.md) · [error-copy](reference/error-copy.md) · [ContentSource](reference/content-source.md)
- [Build order · 20 · content](../../../docs/setup/20-content-package.md)
- [`@loadbearing/errors`](../../errors/docs/index.md) — the codes these words are keyed to
