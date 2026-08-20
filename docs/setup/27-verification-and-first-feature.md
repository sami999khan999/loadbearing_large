# 27 · Verification and your first feature

> Proof that the architecture holds, not just that it builds — and the eleven-step path every feature after this one follows.

**Delivers:** A verified starter kit, a clean commit history, and a repeatable checklist.

**Prerequisite:** [26 · Hygiene and CI](26-hygiene-and-ci.md)

---

## Step 27.1 — The clean run

Do this on a fresh clone, not on the tree you built. The point is to find the step you did by hand and forgot to write down.

```bash
git clone <your-repo> ratchet-verify && cd ratchet-verify
cp .env.example .env

pnpm install
pnpm infra:up                 # wait for all three healthchecks
pnpm db:migrate
pnpm db:seed

pnpm build
pnpm typecheck
pnpm lint
pnpm test
pnpm check:architecture

pnpm dev                      # web + worker in parallel
```

Anything that needed a manual fix is a bug in one of these documents. Fix the document, not just your machine.

---

## Step 27.2 — The architecture checklist

These are the checks a green build does not give you. Run them by hand once now, and again whenever the repo feels like it is drifting.

- [ ] **Topological build.** `pnpm build` from clean builds `core → permissions → contracts → application → db → infrastructure → auth → composition → …` in dependency order, with no config anywhere declaring that order. pnpm derives it from `workspace:*`.
- [ ] **Server-only boundary.** Importing `@loadbearing/db` from a React component is a Biome error; importing it from `apps/web/src/server/**` is fine.
- [ ] **Framework-free domain.** `grep -r "@orpc\|@tanstack\|drizzle-orm\|ioredis" packages/application/src` returns nothing.
- [ ] **OOP rule.** An exported free function in `packages/contracts/src` is an ESLint error (the `no-restricted-syntax` selectors, which Biome cannot express).
- [ ] **Typed permissions.** A misspelled `PermissionKey` is a compile error in *both* the oRPC router and the React component.
- [ ] **Coverage.** Every contract procedure has a `ProcedurePermissions` entry — the unit test from [10](10-contracts-package.md) fails if one is missing, and `principalMiddleware` denies it at runtime if the test is skipped.
- [ ] **One decision, four surfaces.** Removing a permission from a role removes the nav item **and** returns `FORBIDDEN` from the API — without touching the frontend.
- [ ] **Clean client bundle.** The built client output contains no Drizzle, no ioredis, no AWS SDK.
- [ ] **Naming.** Every file under `packages/*/src` matches the rules in [29](29-naming-and-boundaries.md): one class, filename derived from it, kebab-case, role suffix.
- [ ] **The vector seam.** `grep -rn "PgVectorStore" packages/ apps/` returns hits in exactly two places: `packages/db/src/vector/` and `packages/composition/src/container.ts`. If it appears in a use-case, the swap in [14](14-vector-store.md) is no longer cheap.
- [ ] **Env boundary.** `process.env` appears in exactly two files: `apps/web/src/env.ts` and `apps/worker/src/env.ts`.

**The bundle check, the vector-seam check, and the naming check are the three that rot quietly.** The others fail loudly on their own. Put the first two in CI (you already did, in [26](26-hygiene-and-ci.md)); the naming one is a code-review habit.

---

## Step 27.3 — The commit sequence

If you built this in one pass, split it before pushing. Fifteen commits, each independently reviewable:

```
chore(repo): pnpm workspace, catalogs, recursive scripts
chore(tooling): shared tsconfig, eslint (OOP + server-only), prettier
feat(core): Result, Clock, Uuid, ServerOnly
feat(permissions): PermissionRegistry, ModuleRegistry, CapabilitySet
feat(contracts): zod contracts, entities, oRPC contract router, procedure permissions
chore(infra): docker compose for postgres, redis, minio
feat(application): Principal, Authorizer, DomainError, ports
feat(db): drizzle rbac schema, repositories, seed
feat(db): pgvector schema and PgVectorStore behind the port
feat(infrastructure): redis cache, s3 gateway, bullmq publisher
feat(auth): better-auth config, session resolver, capability cache, api keys
feat(composition): Container
feat(ui): tokens, theme registry, Icon, Can
feat(query): query keys, client factory, session queries
feat(feature): providers, SessionGuard, SignInForm
feat(web): tanstack start, oRPC handler, RouteGuard, root providers
feat(worker): bullmq bootstrap, embedding consumer, schedules
chore(repo): husky, lint-staged, commitlint, CI
```

Every scope in that list is in the `scope-enum` from [26](26-hygiene-and-ci.md). If one is rejected, you added a package and forgot to update the enum.

---

## Step 27.4 — Adding a feature module

This is the payoff. Every feature you ever add touches the same twelve places, in this order. Using a `lead` module as the example:

```
 1. packages/permissions/src/catalog/lead.permissions.ts   lead.* keys
    packages/permissions/src/catalog/index.ts              register the fragment
    packages/permissions/src/route/lead.routes.ts          the slice's destinations
    packages/permissions/src/route/index.ts                register the fragment
    packages/permissions/src/gate/lead.gate.ts             nav gate, if it gets a menu entry
    packages/permissions/src/gate/index.ts                 register the fragment

 2. packages/errors/src/catalog/lead.errors.ts             only if the slice needs codes of its own
    packages/errors/src/catalog/index.ts                   register the fragment
    packages/content/src/message/error-copy.ts             copy for each new code — a compile error until it exists

 3. packages/contracts/src/lead/                           lead.contract.ts, lead.entity.ts, lead.procedures.ts
 4. packages/contracts/src/contract-router.ts              register the procedures
 5. packages/contracts/src/permission/lead.permissions.ts  map each procedure path → permission

 6. packages/db/src/lead/lead.schema.ts                    tables + migration
    packages/db/src/lead/pg-lead.repository.ts             implements the port

 7. packages/application/src/lead/                         use-cases + LeadRepository port
 8. packages/api-client/src/lead/                          transport methods, if not generic
    packages/query/src/lead/                               LeadQueries, LeadMutations, keys

 9. packages/content/src/message/en/lead.ts                labels, empty states, validation copy
10. packages/feature/src/lead/                             LeadPipelineBoard

11. apps/web/src/server/orpc/lead.router.ts                three lines per procedure
12. apps/web/src/route/lead/                               compose the components

    packages/composition/src/container.ts                  expose the new use-cases
```

**Plus a migration seeding the new permission rows and granting them to the right system roles** — which is what makes the module *appear*. Until that migration runs, the feature is invisible and uncallable for everyone. That is your staged-rollout mechanism working as designed, not a bug.

**The order is not arbitrary.** Each step compiles against the one before it. Write the permission first, the error codes second and the contract third, and by the time you reach the React component the permission key autocompletes, the error code autocompletes, and a typo in either is a compile error.

**Step 2 is usually empty**, and that is the point. Most slices fail in the ways every slice fails — forbidden, not found, conflict — and reuse the shared codes. Reach for a slice-specific code only when a caller would genuinely branch on it differently, and remember that a new code cannot ship without copy: `Record<ErrorCode, MessageKey>` in `content` will not compile until it has a sentence ([09](09-errors-package.md), [20](20-content-package.md)).

**If a feature needs a step outside this list, stop and look again.** It almost always means logic landed in the wrong layer — business rules in a router, a permission decision in middleware, a Drizzle query in a use-case. The checklist is a diagnostic as much as a recipe.

---

## Step 27.5 — Renaming the scope

The kit ships as `@loadbearing/*`. Before real work starts:

1. Find and replace `@loadbearing/` with `@yourscope/` across the repo.
2. Rename the directory names only if you want to — package names and folder names are independent.
3. Update `scope-enum` in `commitlint.config.js` if you renamed packages too.
4. `rm -rf node_modules pnpm-lock.yaml && pnpm install`.
5. Run Step 27.1 again.

Do this once, early. Doing it after twenty features is a merge-conflict festival.

---

## What you have

Fifteen packages and three applications, where:

- Business logic lives in `packages/`, and the applications are thin.
- One permission decision drives four enforcement surfaces from one `can()`.
- The domain layer imports no framework, so the use-cases outlive the frameworks.
- Postgres, Redis, S3, and the vector store all sit behind ports, so each is a one-line swap in the container.
- Every team owns one glob, one commit scope, one vertical slice.

The next thing you build is a feature, not infrastructure. That was the point.

[28](28-folder-structure.md) is the whole tree on one page — use it to check what you built. Then [30](30-desktop-app.md) builds the desktop shell, and the measure of everything above is that it costs one app directory and no changes to any of it.

---

## ✅ Gate

Every box in Step 27.2 is ticked on a fresh clone.

---

[← Hygiene and CI](26-hygiene-and-ci.md) · [Folder Structure →](28-folder-structure.md)
