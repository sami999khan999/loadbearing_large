---
title: Files
description: Kebab-case everywhere, the closed set of role suffixes, one class per file, where tests go.
---

# Files

- **Kebab-case everywhere**, React components included: `task-card.tsx` exports `TaskCard`.
- **One class per file, filename derived from the class.** Strip the role suffix, kebab-case the
  rest, append `.<role>.ts`: `ReactivateTaskUseCase` → `reactivate-task.use-case.ts`.
- **A file with an architectural role takes a dot-suffix**, `<subject>.<role>.ts`, and the suffix set
  is closed — adding one is a decision recorded in `docs/opinions/files.md`, not an invention:
  `.contract` `.entity` `.procedures` `.use-case` `.repository` `.gateway` `.store` `.reader`
  `.logger` `.provider` `.publisher` `.resolver` `.bus` `.policy` `.strategy` `.router` `.consumer`
  `.schedule` `.error` `.schema` `.permissions` `.errors` `.gate` `.routes` `.spec`
- **Files with no layer role stay plain kebab-case:** `permission-registry.ts`, `clock.ts`.
- **Two exemptions to subject-first order.** Use-cases lead with the verb
  (`reactivate-task.use-case.ts`); implementations lead with the technology (`pg-vector.store.ts`)
  so you can see what to delete when a vendor changes.
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
