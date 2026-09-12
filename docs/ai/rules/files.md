---
title: Files
description: Kebab-case everywhere, the closed set of role suffixes, one class per file, where tests go.
---

# Files

- **Kebab-case everywhere**, React components included: `task-card.tsx` exports `TaskCard`.
- **One class per file, filename derived from the class.** Strip the role suffix, kebab-case the
  rest, append `.<role>.ts`: `ReactivateTaskUseCase` → `reactivate-task.use-case.ts`.
- **A file with an architectural role takes a dot-suffix**, `<subject>.<role>.ts`, and the suffix set
  is closed — adding one is a decision recorded in `docs/opinions/files.md`, not an invention.
  Server roles: `.contract` `.entity` `.procedures` `.use-case` `.repository` `.gateway` `.store`
  `.reader` `.logger` `.provider` `.publisher` `.resolver` `.projector` `.sender` `.mailer`
  `.source` `.unit-of-work` `.connection` `.cache` `.hasher` `.builder` `.factory` `.seed`
  `.enroller` `.founder` `.claimer` `.rules` `.renderer` `.policy` `.strategy` `.plugin`
  `.router` `.interceptor` `.consumer` `.schedule` `.composer` `.error` `.schema` `.config`
  `.manifest`. Catalog fragments:
  `.permissions` `.errors` `.events` `.gate` `.routes` `.data`. Client roles: `.form` `.list`
  `.panel` `.button` `.notice` `.setup` `.inspector` `.guard` `.context` `.client` `.queries`
  `.mutations` `.fn` `.server`. And `.spec`.
- **Only the role takes the dot; the technology joins with a hyphen.** `redis-cache.store.ts`, never
  `redis.cache-store.ts` — the second spells the role `cache-store`, so `*.store.ts` misses it.
- **Files with no layer role stay plain kebab-case:** `permission-registry.ts`, `clock.ts`.
- **Two exemptions to subject-first order.** Use-cases lead with the verb
  (`reactivate-task.use-case.ts`); implementations lead with the technology (`pg-vector.store.ts`,
  `loki-log.reader.ts`) so you can see what to delete when a vendor changes.
- **Framework-dictated filenames win.** In `apps/web/src/route/` the TanStack conventions are
  load-bearing — a `-` prefix marks a file as *not* a route.
- **Banned filenames:** `utils.ts`, `helpers.ts`, `common.ts`, `misc.ts`. A barrel may re-export; it
  may never contain logic.
- **Tests mirror `src/` and never live inside it.** `src/error/app.error.ts` →
  `tests/error/app.error.spec.ts`. `*.stories.tsx` is not a test and stays in `src/`.

---

**The argument.**
[`docs/opinions/files.md`](../../opinions/files.md) — casing, role suffixes, one class per file, where tests go.

When this file and `docs/opinions/` disagree, **`docs/opinions/` wins and this file is stale;
say so.**
