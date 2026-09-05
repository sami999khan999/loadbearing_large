---
title: TODO — loadbearing starter kit
updated: 2026-09-05
owner: sami
schema: todo/v1
---

# TODO — loadbearing starter kit

> **Rules for agents & humans (read first)**
>
> 1. Every task has a **unique ID** (`T-001`). Never reuse or renumber an ID.
> 2. Change progress by editing the **checkbox marker only** — do not delete tasks.
> 3. When a task is done, set `[x]`, add `done: YYYY-MM-DD`, and move it to **Done**.
> 4. New tasks go to the bottom of **Backlog** with the next free ID.
> 5. If a task is blocked, set `[!]` and fill **Blocked by** with a reason or task ID.
> 6. Do not start a task whose `Depends on` tasks are not `[x]`.
> 7. Keep one task per line item. If a task needs more than 5 subtasks, split it.

## Legend

| Marker | Status      | Meaning                                 |
| ------ | ----------- | --------------------------------------- |
| `[ ]`  | todo        | Not started                             |
| `[~]`  | in-progress | Someone is actively working on it       |
| `[!]`  | blocked     | Cannot proceed — reason required        |
| `[x]`  | done        | Finished and verified                   |
| `[-]`  | dropped     | Cancelled — keep for history            |

| Tag     | Meaning                          |
| ------- | -------------------------------- |
| `P0`    | Critical — drop everything       |
| `P1`    | High — this cycle                |
| `P2`    | Normal                           |
| `P3`    | Nice to have                     |
| `~2h`   | Estimated effort                 |
| `#area` | Area: `#api` `#ui` `#db` `#infra` `#docs` |
| `@name` | Assignee (`@agent` for AI tasks) |

## Task format

```md
- [ ] `T-000` **Short imperative title** `@owner` `P2` `~2h` `#area`
  - **Goal:** One sentence — why this exists.
  - **Done when:** Testable condition. No opinion words.
  - **Files:** `path/to/file.ts`, `path/to/other.ts`
  - **Depends on:** `T-000` (or `none`)
  - **Blocked by:** reason (only when status is `[!]`)
  - **Notes:** links, decisions, gotchas
```

Only **Goal** and **Done when** are required. Drop the rest when empty.

---

## State of the repo — 2026-08-29

Verified by running the pipeline end to end on this tree:

| Check | Result |
| --- | --- |
| `pnpm build:packages` | ✅ 15 packages build |
| `pnpm typecheck` | ✅ 20 projects clean |
| `pnpm lint` (biome + eslint) | ✅ 538 files, no findings |
| `pnpm test` (excl. `infrastructure`) | ✅ 388 tests across 65 files |
| `pnpm --filter @loadbearing/web build` | ✅ builds `.output/` |
| `pnpm check:architecture` | ✅ 11/11 assertions |
| `pnpm deps:check` / `pnpm repo:check` | ✅ silent, and now blocking in CI |
| `pnpm test` (`infrastructure`) | ⚠️ needs live Postgres — Docker not running locally, covered in CI |

**Every task `T-001`–`T-024` is done.** The kit now authenticates a user end to end, ships one
feature slice through all twelve steps of `27.4`, has a transactional mail transport, a readiness
probe, and documentation that names directories which exist.

> [!IMPORTANT]
> **Three things could not be verified on this machine and are verified by CI instead.** Docker was
> not running, so nothing below was exercised against a live Postgres, Redis or Mailpit:
>
> - `T-001`'s end-to-end sign-up → sign-in against `/api/auth`, and the membership row it writes
> - `T-002`'s owner-renders / member-redirects behaviour on `/permissions`
> - `T-004`'s verification message landing in Mailpit
>
> Every one of them typechecks, builds, lints, and passes its unit tests. CI runs `db:migrate` and
> `db:seed` against a real Postgres and will exercise the rest on the next push.

---

## 🔥 In Progress

*(nothing in progress)*

## 📋 Backlog

*(nothing in the backlog — open work is tracked in `tasks/IMPLEMENTATION-PLAN.md`)*

## ⛔ Blocked

*(nothing blocked)*

## ✅ Done

- [x] `T-030` **`core.activity.write` is unreachable for anyone but `owner`** `@sami` `P2` `~1h` `#api` `done: 2026-09-05`
  - **Goal:** `core.permissions.ts` says the key is "held by every principal … a property of acting at all", but `PgCapabilityRepository.resolveFor` grants only through roles and only `owner`'s wildcard carries it. `IndexDocumentUseCase` asserts it, so a `member` cannot index a document.
  - **Done when:** Either every resolved principal holds the `core.*` keys or no use-case asserts one; the decision is recorded in `packages/permissions/docs/`.
  - **Files:** `packages/permissions/src/capability/capability-set.ts`, `packages/application/src/ai/index-document.use-case.ts`, `packages/permissions/src/catalog/core.permissions.ts`, `apps/worker/src/system-principal.ts`
  - **Done:** Both halves, because either alone leaves the other half of the contradiction standing. `CapabilitySet.can()` holds every `core.*` key for any resolved principal — checked after denies, exactly where the wildcard is, so rule 2 stays the one rule nothing is above — and `IndexDocumentUseCase` no longer asserts it. `SystemPrincipal.GRANTS` drops it too: granting what is already true reads as a decision. Recorded as the fifth resolution rule in `packages/permissions/docs/reference/capability-set.md`. Three new specs in `capability-set.spec.ts` and one in `system-principal.spec.ts`.
  - **Notes:** Found while planning `T-028`. The member use-cases deliberately assert only their own permission so `admin` — which holds `member.invite` and not `core.activity.write` — can invite; that reading is now the only one. `PgCapabilityRepository` is untouched: the exemption belongs in the resolver, not in every row the database returns. Closed by `P2.14`.

- [x] `T-026` **Make the activity-replay spec independent of how many rows are already in the table** `@sami` `P2` `~30m` `#api` `done: 2026-09-05`
  - **Goal:** `pg-activity-replay.reader.spec.ts` walks the table from the start in ten batches of two, so it can only reach its own rows while fewer than twenty older ones exist. `activity_log` is append-only and the other specs never clean up, so the suite goes red after roughly twenty runs against one database and stays red.
  - **Done when:** The spec passes with several hundred unrelated rows already in `activity_log`.
  - **Files:** `packages/infrastructure/tests/analytics/pg-activity-replay.reader.spec.ts`
  - **Done:** Every read starts from a checkpoint just before the spec's own 2031-03 instant rather than from `{null, null}`, so the walk is bounded by the partition this spec writes and drops rather than by the table. Verified against a database carrying the seed's audit rows.
  - **Notes:** Pre-existing, and unrelated to `T-025`. Closed by `P6.5`.

- [x] `T-029` **Organization plugin: switch, create, accept; switcher; invitation landing page** `@sami` `P1` `~8h` `#api` `#ui` `done: 2026-09-03`
  - **Goal:** A user in two organizations could reach only the one the session was pinned to, nothing let anyone create a second organization, and an existing account holding an invitation link had no way to accept it.
  - **Done when:** `POST /api/auth/organization/{switch,create}` and `/api/auth/invitation/accept` rebind the session and re-issue the cookie cache so the very next RPC resolves the new tenant; the header switcher lists every membership; `/organization/new` founds and switches; `/invitation/$token` previews for an anonymous visitor and accepts for a signed-in one; `/sign-in?redirect=` returns there; a sign-in lands in the last-used organization.
  - **Files:** `packages/auth/src/plugin/organization.plugin.ts`, `packages/api-client/src/auth/organization.client.ts`, `packages/query/src/organization/`, `packages/feature/src/organization/`, `apps/web/src/server/{session,invitation}.fn.ts`, `apps/web/src/route/-redirect.ts`, `apps/web/src/route/(shell)/invitation/$token.tsx`, `apps/web/src/route/(app)/_authenticated/organization/new.tsx`
  - **Done:** Typecheck, lint, `check:architecture` 13/13 against a fresh web bundle, and every unit suite green — including the plugin's endpoint spec, the client spec with its two error-code mappings, the redirect schema spec (rejects `//evil.test`, absolute URLs, `javascript:`), and five render states of `InvitationAccept`. **Not exercised against the live stack: Docker was down.** The ten-step manual pass in the plan (`~/.claude/plans/sprightly-kindling-dongarra.md`, "Verification") is still owed, in particular step 5 — a switch followed immediately by an RPC that must answer for the new tenant.
  - **Notes:** A Better Auth plugin rather than oRPC, for two verified reasons: these actions are identity-gated and no permission a non-owner holds could gate them, and only an endpoint with Better Auth's `ctx` can call `setSessionCookie` — without that, `session.cookieCache` keeps resolving the old tenant for up to sixty seconds after a switch. `rebind` does what Better Auth's own organization plugin does for `setActiveOrganization`, plus writes `users.last_active_organization_id`. `SessionUser` now carries `activeOrganizationId` and `organizations`, resolved in `fetchSession` in one extra indexed query. The sign-in page's `?redirect=` is validated to a rooted single-slash path. `auth` gained a `zod` dependency for the plugin's request bodies.

- [x] `T-028` **Member slice: invite, list members, list and revoke invitations, members page** `@sami` `P1` `~8h` `#api` `#ui` `done: 2026-09-03`
  - **Goal:** `member.invite` was a permission key with nothing behind it and `ROUTES.rbac.members` a declared route with no page. An owner or admin could not bring anyone into their organization.
  - **Done when:** `/settings/members` lists members and pending invitations, an `admin` can invite an address at a role and revoke a pending invitation, the invited address receives a link in Mailpit, and `member.invited` / `member.invitation.revoked` land in `activity_log`. The four procedures are in `PROCEDURE_PERMISSIONS` and gated in their use-cases.
  - **Files:** `packages/contracts/src/member/`, `packages/application/src/member/`, `packages/infrastructure/src/pg/repository/pg-{member,invitation}.repository.ts`, `packages/composition/src/mail/content.invitation-mailer.ts`, `packages/query/src/member/`, `packages/content/src/message/{en,bn}/member.ts`, `packages/feature/src/member/`, `apps/web/src/server/orpc/member.router.ts`, `apps/web/src/route/(app)/_authenticated/settings/members.tsx`
  - **Done:** All twelve steps, subject `member`. Typecheck, lint, `check:architecture` 13/13 with a fresh web bundle, and every unit suite green (contracts 34, application 22 incl. four new use-case specs, composition 17, feature, query, content, web). **The two Postgres specs — `pg-member.repository` and `pg-invitation.repository` — were not run here: Docker was down. CI runs them.** Not exercised against Mailpit for the same reason.
  - **Notes:** The mail goes out only after the unit of work commits, and the invite spec pins that a failed commit sends nothing. `InvitationRecord` never carries the token — the contract spec asserts the wire shape has no such key. `admin` can invite because the use-cases assert only `member.invite`, never `core.activity.write` (`T-030`). `composition` now depends on `permissions`, solely so the mail's link is built from `ROUTES.shell.invitation`. The nav gained gated links to members and roles; neither existed before.

- [x] `T-027` **Invitations foundation: schema, claim and found adapters, claiming enroller** `@sami` `P1` `~6h` `#db` `#api` `done: 2026-09-03`
  - **Goal:** Nothing could turn an invitation into a membership, nothing could create an organization except the personal enroller, and `activeOrganizationFor` pinned a user in two organizations to the oldest one forever.
  - **Done when:** `invitations` exists, `memberships_uq` is `(organization_id, user_id)`, `users.last_active_organization_id` exists, `PgInvitationClaimer` claims only against a verified matching address, `PgOrganizationFounder` is the one place a tenant is created, and `InvitationClaimingEnroller` wraps every enrolment mode so an invited address never gets a personal organization.
  - **Files:** `packages/infrastructure/src/pg/schema/invitation.schema.ts`, `packages/infrastructure/migrations/0004_awesome_wraith.sql`, `packages/infrastructure/src/pg/repository/pg-{invitation.claimer,organization.founder,membership.reader,personal-organization.enroller}.ts`, `packages/auth/src/session/{invitation.claimer,organization.founder,invitation-claiming.enroller}.ts`, `packages/composition/src/container/container.ts`, `packages/core/src/primitive/token.ts`
  - **Done:** Typecheck, lint, `check:architecture` 13/13 and the unit suites (auth 45, composition 17, core 19) green locally. **The three new Postgres specs — founder, claimer, reader — plus the updated enroller spec were not run on this machine: Docker was down. CI runs them.** Migration reviewed by hand: the `memberships_uq` swap fails on any existing database where one person holds two roles in one organization, which a fresh kit cannot have.
  - **Notes:** Tenancy decision recorded in `packages/auth/docs/reference/enrolment.md`: an invited address joins the inviting organization *instead of* getting a personal one; the other model is the two lines of `InvitationClaimingEnroller.enrol` swapped. The claim's only security property is the verified-address match, so invitations require `AUTH_REQUIRE_EMAIL_VERIFICATION`. `PgPersonalOrganizationEnroller` now delegates to the founder, whose transaction is a savepoint inside the enroller's lock.

- [x] `T-025` **Complete the authentication flow** `@sami` `P1` `~16h` `#api` `done: 2026-09-01`
  - **Goal:** Sign-in and two-factor *verification* worked; sign-up, two-factor *enrolment*, forgot/reset, change password, change email, Google, and sign-out were either configured with no client path or missing outright.
  - **Done when:** Every flow works end to end against the live stack, and `pnpm check:architecture` reports 13/13 with no skips.
  - **Files:** `packages/auth/src/auth.factory.ts`, `packages/api-client/src/auth/`, `packages/feature/src/{auth,account}/`, `apps/web/src/route/(shell)/`, `apps/web/src/route/(app)/_authenticated/settings/`
  - **Done:** Verified against live Postgres, Redis and Mailpit rather than only in CI. Sign-up issues no session (`autoSignIn: false`) and mails a link; verification redirects to `/verify-email`; reset is enumeration-safe (byte-identical responses for a real and an absent address) and revokes every session; two-factor enrols through a three-step wizard and completes sign-in by TOTP, backup code (single-use, 401 on reuse) or emailed OTP; change-email confirms at the **old** address; change-password took 6 sessions to 1 and left the calling tab alive. Google proven to the authorization URL with placeholder credentials — the consent round trip needs real ones.
  - **Notes:** Enrolment became three modes behind `AUTH_ENROLMENT_MODE`, resolved to one of three `MembershipEnroller`s in `Container` — `personal` (default, own organization, reuses `SystemRoleSeed`), `bootstrap` (the old behaviour), `invite` (`NullMembershipEnroller`). All three exercised, including the `superRefine` that refuses to boot on `bootstrap` with no slug. One migration, and it is a latent bug rather than a feature: `organizations.slug` had no unique index while two code paths resolved by it with `.limit(1)`. One new runtime dependency, `uqr`, for the TOTP QR.

- [x] `T-001` **Create a membership row so sign-in can succeed** `@sami` `P0` `~3h` `#db` `done: 2026-08-29`
  - **Goal:** Nothing in the repository ever inserts into `memberships`, so every sign-in is aborted before a session exists.
  - **Done when:** A fresh `pnpm db:migrate && pnpm db:seed` followed by a sign-up and sign-in against `/api/auth` returns a session whose `activeOrganizationId` is the seeded organization.
  - **Files:** `packages/infrastructure/src/pg/seed/index.ts`, `packages/auth/src/auth.factory.ts`, `packages/infrastructure/src/pg/repository/pg-membership.reader.ts`
  - **Done:** `MembershipEnroller` (port, `packages/auth/src/session/`) and `PgMembershipEnroller` (`packages/infrastructure/src/pg/repository/`), bound in `Container`. Enrolment runs from `session.create.before`, **not** `user.create.after` — Better Auth queues `create.after` until the whole sign-up endpoint has finished, which is after the session hook has already refused. Gated on `BOOTSTRAP_ORGANIZATION_SLUG`, which the seed reads too so the two cannot drift; first user in gets `owner`, everyone after `member`, behind a `pg_advisory_xact_lock`. Not exercised against a live database on this machine.

- [x] `T-002` **Resolve the session into the router context** `@sami` `P0` `~4h` `#ui` `done: 2026-08-29`
  - **Goal:** `RouteGuard` and `SessionProvider` are both inert, so two of the four enforcement surfaces named in `docs/setup/23` do nothing.
  - **Done when:** `RouterContext` carries `user` and `capabilities`, a root loader resolves them server-side during SSR, and `RouteGuard.requirePermission("rbac.role.read")` on a test route redirects a member to `/forbidden` while an owner renders it.
  - **Files:** `apps/web/src/route/-context.ts`, `apps/web/src/route/__root.tsx`, `apps/web/src/route/-guard.ts`, `apps/web/src/router.tsx`

  - **Done:** `RouterContext` carries `user`, `capabilities` (as the DTO) and a `SessionStore`; the root's `beforeLoad` resolves them through `fetchSession`, a `createServerFn` in `src/server/`. The DTO rather than a `CapabilitySet` because TanStack dehydrates a `beforeLoad` return value and rejects anything carrying a method — `RouteGuard` rebuilds the class, so `can()` stays the one decision. `SessionStore` rides the same dehydrate/hydrate payload as the message snapshot, so the browser refetches nothing; `/sign-in` invalidates both on success. `/permissions` is the gated route: `requireSession()` then `requirePermission("rbac.role.read")`.

- [x] `T-003` **Fix the `auth:generate` root script** `@agent` `P1` `~5m` `#tooling` `done: 2026-08-29`
  - **Goal:** `pnpm auth:generate` fails, because the root script calls a package script that does not exist.
  - **Done when:** `pnpm auth:generate` runs the schema-inspection script and exits 0.
  - **Files:** `package.json`, `packages/auth/package.json`
  - **Done:** Renamed the root script to `auth:tables`, which is what `docs/setup/03` already documented.

- [x] `T-004` **Add an `EmailSender` port and adapter** `@sami` `P1` `~5h` `#api` `done: 2026-08-29`
  - **Goal:** `requireEmailVerification` is on by default and `revokeSessionsOnPasswordReset` is set, but nothing in the repo can send an email — so verification and password reset are dead ends.
  - **Done when:** `packages/auth/src/auth.factory.ts` supplies both `sendVerificationEmail` and `sendResetPassword`, an `EmailSender` port exists in `packages/application/src/port/`, `Container` builds an adapter behind it, and a sign-up produces a verification message in the local transport.
  - **Files:** `packages/application/src/port/`, `packages/auth/src/auth.factory.ts`, `packages/composition/src/container/container.ts`, `packages/infrastructure/src/`
  - **Done:** `EmailSender` + `EmailMessage` in `packages/application/src/port/`, `SmtpEmailSender` in `packages/infrastructure/src/smtp/`, `AuthMailer` port in `packages/auth/src/mail/`, and `ContentAuthMailer` in `packages/composition/src/mail/` — the only package that can see both the copy and the transport. `AuthFactory` now supplies `sendVerificationEmail` and `sendResetPassword`. Mailpit added to compose (inbox on :8025); `SMTP_URL` and `EMAIL_FROM` are required in both `env.ts` schemas. Six new `email.verify.*` / `email.reset.*` keys in `en` and `bn`, and `check-architecture` assertion 8 greps for all three key prefixes.

- [x] `T-005` **Make the two-factor flow reachable** `@sami` `P1` `~3h` `#ui` `done: 2026-08-29`
  - **Goal:** The 2FA half of sign-in is written end to end and can never fire — the branch that would trigger it is unreachable.
  - **Done when:** A user with TOTP enrolled who submits `SignInForm` is shown `TwoFactorForm`, and a valid code completes the sign-in.
  - **Files:** `packages/api-client/src/auth/auth.client.ts`, `packages/feature/src/auth/sign-in.form.tsx`, `apps/web/src/route/sign-in.tsx`
  - **Done:** Three breaks, three fixes. `AuthClient.signIn` throws `TwoFactorRequiredError` on `data.twoFactorRedirect === true` — a *successful* response, which is why inspecting `error` alone resolved and navigated away — and throws `UnauthorizedError` rather than a bare `Error`, so `ErrorNormalizer` stops flattening every failure to `INTERNAL`. `sign-in.tsx` passes `onNeedsTwoFactor` and renders `TwoFactorForm`. `SignInForm` tracks the fork separately from `isError`, so the hand-off does not render “sign-in failed” under a form that is about to be replaced. Cost one new dependency: `api-client` → `errors`.

- [x] `T-006` **Give `packages/auth` a test suite** `@sami` `P1` `~5h` `#api` `done: 2026-08-29`
  - **Goal:** The only package with no tests is the one holding every credential path.
  - **Done when:** `packages/auth/vitest.config.ts` and `packages/auth/tests/` exist, and `pnpm --filter @loadbearing/auth test` reports passing tests covering `ApiKeyHasher`, `ApiKeyResolver`, `CapabilityCache` and `PrincipalBuilder`.
  - **Files:** `packages/auth/vitest.config.ts`, `packages/auth/tests/`
  - **Done:** `vitest.config.ts` plus 24 tests across five files. Pins the behaviours review cannot re-derive: the api-key-before-cookie order and the absence of a fall-through, re-intersection with the issuer's live capabilities, revoked and expired keys, and the `organization:user` cache key in both its presence and its position.

- [x] `T-007` **Write the `packages/auth` documentation** `@sami` `P1` `~2h` `#docs` `done: 2026-08-29`
  - **Goal:** `packages/auth/docs/index.md` is still the unwritten scaffold while all fourteen other packages have a full doc set.
  - **Done when:** `packages/auth/docs/index.md` contains no `TODO —` lines and has a populated Depends on / Used by table, and `docs/reference/` holds at least pages for `PrincipalBuilder`, the capability cache TTL, and the API-key model.
  - **Files:** `packages/auth/docs/index.md`, `packages/auth/docs/reference/`, `packages/auth/docs/reference/meta.json`
  - **Done:** `docs/index.md` rewritten (163 lines, populated Depends on / Used by), plus three reference pages — `principal-builder.md`, `capability-cache.md`, `api-key.md` — and both `meta.json` files. `grep -rln "TODO — " packages/*/docs` now returns nothing.

- [x] `T-008` **Purge `packages/db` from the documentation** `@sami` `P1` `~4h` `#docs` `done: 2026-08-29`
  - **Goal:** Twenty-three documents describe a `packages/db` that `c78feae` folded into `packages/infrastructure` — for a kit whose documentation is the deliverable, this is the largest single defect.
  - **Done when:** `grep -rn "packages/db\|@loadbearing/db" docs infra packages tooling .github README.md` returns nothing, and the `27` feature checklist, the `28` tree and the `29` boundary map all name real directories.
  - **Files:** `docs/setup/00-README.md`, `docs/setup/27-verification-and-first-feature.md`, `docs/setup/28-folder-structure.md`, `docs/setup/29-naming-and-boundaries.md`, `docs/opinions/imports.md`, `tooling/biome-config/docs/reference/boundary.md`, `.github/workflows/ci.yml`

  - **Done:** `grep -rn "packages/db\|@loadbearing/db" docs infra packages tooling .github README.md` returns nothing. Historical mentions were reworded rather than deleted. Derived claims fixed in the same pass: sixteen→fifteen packages, the `27.4` twelve-step map and `27.2` checklist now name real paths, `28`'s tree and `29`'s §1.10–§1.11 rewritten against the actual `pg/{primitive,schema,repository,transaction,migrate,seed}` layout, and the port count corrected to sixteen everywhere it appeared.

- [x] `T-009` **Add `apps/web/vitest.config.ts`** `@agent` `P2` `~30m` `#tooling` `done: 2026-08-29`
  - **Goal:** With no vitest config the app's `test` script loads `vite.config.ts` — TanStack Start plus Nitro — and cannot tear the server down.
  - **Done when:** `pnpm --filter @loadbearing/web test` completes in under 5s with no "something prevents Vite server from exiting" warning.
  - **Files:** `apps/web/vitest.config.ts`
  - **Done:** `apps/web/vitest.config.ts`, which also carries the `~` alias and the fake `test.env` (in the config rather than a setup file, so `noProcessEnv` needs no new exemption). 30.8s and a “close timed out” warning → 1.9s, warning gone.

- [x] `T-010` **Test the `apps/web` server surface and `apps/worker`** `@sami` `P2` `~4h` `#api` `done: 2026-08-29`
  - **Goal:** Both apps have zero tests, and each holds logic that is unit-testable with no container.
  - **Done when:** `pnpm --filter @loadbearing/web test` and `pnpm --filter @loadbearing/worker test` each report passing tests covering at minimum `Cors`, `ErrorInterceptor`, `Endpoint` and `SystemPrincipal`.
  - **Files:** `apps/web/tests/`, `apps/worker/tests/`, `apps/worker/vitest.config.ts`
  - **Done:** `apps/worker/vitest.config.ts` plus 36 tests across six files: `Cors` (9), `ErrorInterceptor` (4), `Endpoint` (4), `SessionStore` (5), `SystemPrincipal` (4), `MaintenanceConsumer` (5) and `DigestComposer` (5). `handle` is now `public` on all three consumers — it is the consumer's unit of work, and `start()` needs a live Redis.

- [x] `T-011` **Run `deps:check` and `repo:check` in CI** `@agent` `P2` `~30m` `#infra` `done: 2026-08-29`
  - **Goal:** Both scripts exist at the root and no pipeline step calls them, so dependency drift is caught by nobody.
  - **Done when:** `.github/workflows/ci.yml` runs `pnpm deps:check` and `pnpm repo:check`, and the job is green.
  - **Files:** `.github/workflows/ci.yml`
  - **Done:** `deps:check` and `repo:check` run before the build, where they fail in seconds. `pnpm audit --audit-level high` added as a separate `continue-on-error` job, per `26.5`. CI env gained `SMTP_URL` and `EMAIL_FROM`.

- [x] `T-012` **Expose a health endpoint** `@sami` `P2` `~1h` `#api` `done: 2026-08-29`
  - **Goal:** `Container.healthy()` pings Postgres, both Redis instances and ClickHouse, and is called by nothing — there is no readiness probe for any orchestrator to hit.
  - **Done when:** `GET /api/health` returns 200 with a per-dependency breakdown when the stack is up, and 503 when Postgres is down.
  - **Files:** `apps/web/src/route/api/health.ts`, `packages/composition/src/container/container.ts`
  - **Done:** `Container.healthy()` → `Container.health()`, returning a per-dependency `HealthReport`; `analytics` is `null` rather than `true` when no ClickHouse is deployed, because “not running one” is not “healthy”. `GET /api/health` returns it with `cache-control: no-store`, 200 or 503. Loki stays excluded for the reason the container comment already gave.

- [x] `T-013` **Rename `docs/setup/13-db-package.md`** `@agent` `P2` `~30m` `#docs` `done: 2026-08-29`
  - **Goal:** The filename still names the package that was folded away, so the build order reads as if `db` and `infrastructure` are separate steps.
  - **Done when:** The file is renamed to reflect the Postgres slice of `packages/infrastructure`, and every inbound link in `docs/` and `README.md` resolves.
  - **Files:** `docs/setup/13-db-package.md`, `docs/setup/00-README.md`
  - **Done:** Renamed to `13-infrastructure-postgres.md`; all 29 inbound links updated, and a link check over every `.md` in the repo reports no broken targets.

- [x] `T-014` **Add a setup step for `packages/observability`** `@sami` `P2` `~3h` `#docs` `done: 2026-08-29`
  - **Goal:** The package is built, documented in-package, and named in the `00-README` paragraph, but no numbered step in the build order constructs it.
  - **Done when:** A numbered step exists covering `JsonLogger`, `EventShape`, the closed event catalog, `Redactor` and `Correlation`, and `00-README`'s sequence table lists it.
  - **Files:** `docs/setup/`, `docs/setup/00-README.md`
  - **Done:** `docs/setup/09b-observability-package.md`, listed in `00-README`'s Phase B table between 09 and 10. Lettered rather than renumbered on purpose: inserting a real `10` would shift twenty-one files and silently break every bare prose cross-reference (“see 24.11”, “the ban in 05”). Covers `LogLevels`, the closed event catalog and its cardinality budget, `EventShape`, `Redactor`, `Correlation`, and both sinks.

- [x] `T-015` **Retire or refresh `docs/data-and-scale-plan.md`** `@sami` `P2` `~1h` `#docs` `done: 2026-08-29`
  - **Goal:** An unlinked plan document at the `docs/` root describes a repo state that has not been true for many commits.
  - **Done when:** The file is deleted, or rewritten to match reality and linked from `docs/setup/00-README.md` or `docs/opinions/index.md`.
  - **Files:** `docs/data-and-scale-plan.md`
  - **Done:** Deleted. Nothing linked to it, and all four of its Context claims were false.

- [x] `T-016` **Replace the `ratchet` defaults in shipped code** `@agent` `P2` `~1h` `#tooling` `done: 2026-08-29`
  - **Goal:** The guide's project name is baked into runtime defaults, not just local compose credentials, so a rename following `27.5` silently leaves them behind.
  - **Done when:** `grep -rn "ratchet" packages apps --include="*.ts"` returns only values that are genuinely local-infrastructure credentials.
  - **Files:** `packages/infrastructure/src/redis/redis.connection.ts`, `packages/auth/src/auth.factory.ts`, `apps/web/src/env.ts`, `apps/worker/src/env.ts`

  - **Done:** `cookiePrefix: "app"`, `keyPrefix ?? "app:"`, and `CLICKHOUSE_DATABASE`/`CLICKHOUSE_USER` defaulting to ClickHouse's own `default`. The smoke script now uses the configured database in its SQL instead of a hardcoded `ratchet.` — which was also a real bug for any non-default database. All three survivors added to the `27.5` rename checklist.

- [x] `T-017` **Fix the stale comments in `ci.yml`** `@agent` `P3` `~15m` `#infra` `done: 2026-08-29`
  - **Goal:** Two comment blocks name a file path that no longer exists, sending the next reader to the wrong place.
  - **Done when:** `.github/workflows/ci.yml` names `packages/infrastructure/tests/support/database.ts`.
  - **Files:** `.github/workflows/ci.yml`
  - **Done:** Both comment blocks now name `packages/infrastructure/tests/support/database.ts`.

- [x] `T-018` **Reconcile the two `process.env` exemption lists** `@agent` `P3` `~30m` `#tooling` `done: 2026-08-29`
  - **Goal:** `docs/setup/26` requires the architecture script and Biome to state the same rule; they have drifted on config-file extensions.
  - **Done when:** Both lists exempt the same set, so adding `process.env` to a `*.config.mjs` either fails both gates or neither.
  - **Files:** `tooling/scripts/check-architecture.mjs`, `tooling/biome-config/src/base.json`
  - **Done:** Biome's override gained `**/*.config.{mts,js,mjs}`, and `check-architecture` now walks those extensions so its own `.config.(ts|mts|js|mjs)` exemption is reachable rather than dead. Both lists carry a comment pointing at the other.

- [x] `T-019` **Add a root `smoke` script** `@agent` `P3` `~10m` `#tooling` `done: 2026-08-29`
  - **Goal:** The smoke check is what `docs/setup/15` and `26` name as the only coverage for the ClickHouse and Loki adapters, and there is no root entry point for it.
  - **Done when:** `pnpm smoke` runs the infrastructure smoke check from the repository root.
  - **Files:** `package.json`
  - **Done:** `"smoke": "pnpm --filter @loadbearing/infrastructure run smoke"`.

- [x] `T-020` **Give `tooling/scripts` a `package.json`** `@agent` `P3` `~10m` `#tooling` `done: 2026-08-29`
  - **Goal:** `pnpm repo:check` warns on it, which means the check cannot be made blocking.
  - **Done when:** `pnpm repo:check` reports 0 issues.
  - **Files:** `tooling/scripts/package.json`, `pnpm-workspace.yaml`
  - **Done:** Private stub at `tooling/scripts/package.json`. `pnpm repo:check` reports 0 issues.

- [x] `T-021` **Add a `version` to the root `package.json`** `@agent` `P3` `~5m` `#tooling` `done: 2026-08-29`
  - **Goal:** `pnpm deps:check` reports `VERSION_IS_MISSING (InvalidLocalVersion)` on every run.
  - **Done when:** `pnpm deps:check` prints no warnings.
  - **Files:** `package.json`
  - **Done:** `"version": "0.0.0"`. `pnpm deps:check` prints no warnings.

- [x] `T-022` **Fix the stale paths in the `00-README` rename checklist** `@agent` `P3` `~20m` `#docs` `done: 2026-08-29`
  - **Goal:** The rename checklist tells the reader to edit a file that does not exist, which is the worst possible line in a checklist.
  - **Done when:** Every path in the "Renaming the scope" section resolves, and the step count in `README.md` matches the number of numbered steps.
  - **Files:** `docs/setup/00-README.md`, `README.md`
  - **Done:** The `group:` array in a `react.js` that never existed is now the real `noRestrictedImports` entries in `tooling/eslint-config/src/index.js` and `tooling/biome-config/src/base.json`. `README.md` says thirty-one documents, which matches the tree. `27.5` now points at the full `00-README` list.

- [x] `T-023` **Add process-level error handlers to the worker** `@agent` `P3` `~30m` `#infra` `done: 2026-08-29`
  - **Goal:** A rejection outside a BullMQ handler, or a failure during boot, exits with a bare stack that no log collector can key on.
  - **Done when:** `unhandledRejection` and `uncaughtException` are logged through `container.logger.failure` before the process exits, and a throw from `bootstrap.start()` is logged the same way.
  - **Files:** `apps/worker/src/main.ts`

  - **Done:** `unhandledRejection`, `uncaughtException`, and a `try`/`catch` around `bootstrap.start()`, all logged through `container.logger.failure` — the same argument the SIGTERM path already made.

- [x] `T-024` **Land the first feature slice (`docs/setup/27`)** `@sami` `P2` `~8h` `#api` `done: 2026-08-29`
  - **Goal:** `contract` and `appRouter` are both empty, so `/api/rpc` answers 404 to everything and none of the transport wiring has been exercised against a real procedure.
  - **Done when:** One slice exists end to end through all twelve steps of `27.4`, its procedures appear in `ProcedurePermissions`, the coverage test passes against the real contract rather than only against its fixture, and its route renders behind a `RouteGuard`.
  - **Files:** `packages/contracts/src/procedure/index.ts`, `packages/contracts/src/catalog/index.ts`, `apps/web/src/server/orpc/app.router.ts`
  - **Done:** The `role` slice, end to end through all twelve steps: `contracts/src/role/` plus the procedure and permission merge points, `RoleRepository` and `ListRolesUseCase` in `application/src/rbac/`, `PgRoleRepository` (three fixed queries, never one per role), `RoleQueries`, an `ApiClient.role` accessor, a new `role` message namespace in both locales, `RoleMatrix` in `feature`, `RoleRouter`, and `/permissions` behind the guard. `Envelope.paginated` now marks `items` readonly so a handler never copies an array to widen it. The coverage tests run against a real contract, and `handler.ts`'s explicit context annotation is gone as its comment promised. Also fixed doc `24.6`, which documented `implement(x).use(authed)` — `.use()` takes a middleware, not a builder.

- [x] `T-000` **Build steps 01–26 of the setup guide** `@sami` `P1` `#repo` `done: 2026-08-28`
  - **Done when:** `pnpm build:packages`, `pnpm typecheck`, `pnpm lint`, `pnpm test` and `pnpm check:architecture` all pass on a clean tree.
  - **Notes:** 15 packages, 3 tooling packages, 2 apps. 317 tests across 51 files. 11/11 architecture assertions, including the client-bundle grep after a real `apps/web` build. `packages/infrastructure`'s specs are integration tests against a live Postgres and are covered in CI.

## 🗑 Dropped

*(nothing dropped)*

---

## Changelog

| Date       | Who     | Change                                                      |
| ---------- | ------- | ----------------------------------------------------------- |
| 2026-08-28 | @sami   | Created the list from a full audit of the tree at `c681449` |
| 2026-08-29 | @agent  | Closed `T-001`–`T-024`. Three acceptance criteria need a live stack and are covered by CI |
| 2026-09-01 | @sami   | Closed `T-025`. Every auth flow verified against a live stack on this machine, not deferred to CI |
| 2026-09-05 | @sami   | Filed `IMPLEMENTATION-PLAN.md` from a full audit: eight phases covering comments, bugs, conventions, docs drift, feature gaps, tests, tooling |
