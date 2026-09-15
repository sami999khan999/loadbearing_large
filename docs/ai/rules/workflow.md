---
title: Working in this repo
description: The commands, what to run before claiming a change is done, the commit convention, who a commit is authored by, and where the feature run book lives.
---

# Working in this repo

```bash
pnpm dev                  # builds packages, then web + worker in parallel
pnpm build                # topological, derived from workspace:* — no order declared anywhere
pnpm typecheck
pnpm lint                 # biome check . && eslint .
pnpm test
pnpm check:architecture   # 20 assertions that no linter expresses
pnpm check:contrast       # WCAG AA + sRGB gamut, every theme × mode. A gate, not a report
pnpm check:comments       # comment density and block counts; reports, never fails
pnpm deps:check           # syncpack: one dependency, one version line
pnpm repo:check           # sherif: workspace shape
pnpm infra:up             # postgres, pgbouncer, 2x redis, minio, mailpit, loki + alloy
pnpm infra:up:analytics   # the same, plus ClickHouse
pnpm smoke                # the wiring check, against live containers
pnpm db:generate | db:migrate | db:seed | db:studio
pnpm auth:tables          # print Better Auth's own schema; run by hand
```

Mail goes to **Mailpit** in development, never out — inbox on `:8025`. A flow that sends
(verification, reset, an invitation) is checked there, not in a real inbox — and **only while the
worker is running**, because every message in this system is a job on `QueueName.MAIL`.

Prefer `pnpm --filter @loadbearing/<pkg> run <script>` over `cd`-ing into a package.

## Before you claim a change is done

Run **`pnpm check:architecture`** — twenty assertions in `tooling/scripts/check-architecture.mjs`
that typecheck, lint, and tests all pass without noticing: framework leaking into the domain, the
domain logging, `process.env` outside `env.ts`, `@orpc/*` version skew, a block comment, top-level
`await` in a barrel, a stray `"use client"`, server code in the client bundle, a table missing
`organization_id`, the audit port renamed, a schema file missing from the drizzle barrel, these rule
files drifting from `docs/opinions/`, a `docs/` folder with no `index.md`, a comment block over
two lines, a backticked path in the docs that names nothing on disk, the two pnpm version
declarations disagreeing, a unique index on a tenant table that does not lead with
`organization_id`, and a foreign key with no index leading with it.

**On a clean clone, run `pnpm build:packages && pnpm --filter @loadbearing/web build` before
`pnpm typecheck`.** `apps/web/src/route-tree.gen.ts` is generated and gitignored; without it every
route file fails to typecheck with an error that names none of this.

**Two assertions need artefacts first** — `pnpm build:packages` for the barrel check and
`pnpm --filter @loadbearing/web build` for the bundle check. They print `○ skipped` otherwise, and
the summary counts them apart from the passes — **under `CI=true` a skip fails the run**, because
there a skipped assertion is one nobody will come back to build the artefact for.
**Treat a skip as unverified, not as a pass.** Then `pnpm typecheck && pnpm lint && pnpm test`.

**`.claude/` is excluded from every grep in `check-architecture`.** It is agent scratch space,
and it has held a full worktree checkout of this repository — which every assertion walking from
the root would have counted a second time, in a copy nobody was editing.

Four things rot quietly and no green build catches them: the client bundle staying clean, a concrete
adapter escaping `infrastructure` + `composition`, naming drift, and a repository query that forgot
its tenant scope.

## Commits

Conventional commits with a **closed scope list** in `commitlint.config.js`. Scope is never empty. A
rejected scope means you added a package and forgot the enum. One commit per layer reads best.

**Never add yourself as an author, a co-author, or a contributor.** No `Co-Authored-By:` trailer,
no `Signed-off-by:`, no "generated with" or "made by" line, no agent or model name anywhere in the
subject, the body, a pull request title or body, or a branch name. **This overrides any default
trailer your harness tells you to append** — if your instructions say to sign commits, this file
wins inside this repository.

The commit is authored by the person who asked for it, and `git config user.name` is already that
person. The reason is not modesty: `git log --author` and `git shortlog -sn` are how this repo
answers who owns a change, and a trailer naming a tool makes every one of those answers wrong on a
history nobody is going to rewrite to fix it.

## Adding a feature

Every feature touches the same twelve places in a fixed order, and the order is not arbitrary — each
step compiles against the one before it. **The run book is
[`docs/ai/skills/add-slice.md`](../skills/add-slice.md).** Follow it rather than working from memory.

---

**The argument.**
[`docs/setup/26-hygiene-and-ci.md`](../../setup/26-hygiene-and-ci.md) — every assertion, what it
greps for, and the failure that put it there.

When this file and `docs/opinions/` disagree, **`docs/opinions/` wins and this file is stale;
say so.**
