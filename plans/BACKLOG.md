---
title: Backlog — every task not done, in one place
updated: 2026-10-10
owner: sami
schema: backlog/v1
source: compiled 2026-09-20 at 885e144 from the five ledgers, which moved to archive/ the same day
---

# Backlog

**This is the only open ledger, and it holds only what is open.** What has closed is in
[`archive/DONE.md`](archive/DONE.md). What sessions left on a developer machine is in
[`archive/STATE.md`](archive/STATE.md). Everything else in `plans/` is history, except a plan
still being built, which its section here names, and `HANDOFF.md`.

> **How to use this file**
>
> 1. **Every entry keeps its original ID** — `24.7`, `S.2` — and points at the archived file and
>    line that hold the full text. Read the body before acting on a summary.
> 2. **Close it by moving it.** Fix the item, move its entry to [`archive/DONE.md`](archive/DONE.md)
>    under the same section number with its proof, and add the changelog row there.
> 3. **Nothing here is a place to argue a decision.** The argument is in the archived body. A new
>    decision goes in the entry and says it supersedes.
> 4. **Line numbers are as of `885e144`** and stable, because the archived files no longer change.
>    If one is ever off, the ID is the truth.

| Section | What | Open | Closed, in `archive/DONE.md` |
|---|---|---|---|
| 1 | `archive/PLAN.md` boxes, Phases 23–25 | 1 | 32 |
| 3 | `archive/STUCK.md` blockers | 2 | 1 |
| 6 | Conditional work — triggers, not tasks | 5 | — |
| 10 | Code review of 2026-09-25 — [`archive/REVIEW-2026-09-25.md`](archive/REVIEW-2026-09-25.md) | 1 | 48 |
| 11 | Communication features — [`archive/COMMUNICATION.md`](archive/COMMUNICATION.md) | 8 | 1 |
| 13 | Access and visibility plan, what is left — [`archive/ACCESS-AND-VISIBILITY-PLAN.md`](archive/ACCESS-AND-VISIBILITY-PLAN.md) | 1 | 8 |
| 14 | Code review of 2026-09-28, and the plan's review before it starts | 1 | 15 |
| 15 | The docs capability, what is left — [`packages/application/docs/reference/doc.md`](../packages/application/docs/reference/doc.md) | 2 | 7 |
| 16 | The UI stack from lite — Tailwind, Base UI and `cn` — [`packages/ui/docs/index.md`](../packages/ui/docs/index.md) | 1 | 1 |
| 17 | Lite's docs system and the platform organization — [`packages/permissions/docs/reference/platform-scope.md`](../packages/permissions/docs/reference/platform-scope.md) | 2 | 1 |
| 19 | Review of 2026-10-10 | 1 | 22 |
| 22 | AI assistant — [`AI-CHAT-PLAN.md`](AI-CHAT-PLAN.md) | 2 | — |

Sections 2, 4, 5, 7, 8, 9, 12, 18, 20 and 21 are closed in full: 45 defects, 6 buried items, 9
verifications, 3 ledger rows, 6 doc fixes, 8 performance items, `CP7.9`, `BL.1`, the final
check's 17 and `WC.1`. Their entries are in `archive/DONE.md` under the same numbers.

**Sections 1, 3 and 6 cannot be closed by writing code today.** `24.7` and the triggers wait for
a number no node has reached. `S.2` waits for real traffic. `S.3` waits for a provisioned server.
**Section 10 is down to one narrowed remainder** of the 2026-09-25 review; the other forty-eight,
the shipped security defects among them, are closed. **Section 11 is the next work**: the
communication features, which waited on the performance plan and are built on top of it now.
**Sections 13 to 17 are down to a trigger, hand walks, a benchmark and one deferred design**
(`RV.3`, `DC.2`); the rest of each closed on 2026-10-10 and is in `archive/DONE.md`. **Section 19**
holds what the 2026-10-10 review found and did not fix.

---

## 1. `archive/PLAN.md` — the one open box

- [ ] `24.7` **A pooled partition for the long tail** — small tenants share one `<table>_pool`
  list partition and graduate on a size line. **Its gate is relation count now, measured by
  `PF.0`**: a tenant-level attach grows with siblings (~3 ms at 100 tenants, ~27 ms at 2 000), and
  one unpruned read of `notifications` at full retention exhausts the lock table at ~1 800 tenants
  (`PF.7`). Plan time is flat and the runway is 1.6 s at 2 000, so the old triggers would never
  fire. — `archive/PLAN.md:4015`

## 3. `archive/STUCK.md` — what a session could not do, and why

- [ ] `S.2` **Check the analytics projection and `/analytics` against real traffic.**
  - **Narrowed 2026-09-25.** The reader was built against seeded data, decided with the user, so
    nothing waits on this any more. What is left is the check: run the worker on real traffic for
    a few days, let the reconciliation come back clean, and look at `/analytics` against it.
  - Its history, and why `23.21` had to come first, is in `archive/DONE.md`, "Moved out of
    `BACKLOG.md`". — `archive/STUCK.md`
- [ ] `S.3` **Phase 24 wants a second node that is provisioned**, not a second container on one
  machine. Everything Phase 24 built is proved against the two-node compose profile, including
  `24.6`'s load test. What only a real server gives is numbers a capacity plan can use: the
  commit time here is Docker Desktop's `fsync`, about 100 ms. — `archive/STUCK.md`

---

## 6. Conditional work — "reopen when"

Not open today. Each is a trigger written into a ticked item, so the next person does not decide on
a feeling.

- `24.7` **pooled partition** — ~~when planning passes 5 ms or the runway passes ten minutes~~;
  **re-stated 2026-09-24**: when a node heads past ~1 800 tenants, the point where one unpruned
  read exhausts the lock table, or a tenant-level attach passes ~50 ms. Section 1 has the numbers.
  — `archive/PLAN.md:1349`
- `21.1` **per-user object layout for `notifications`** — when p95 on the archived view passes
  500 ms; every page turn gunzips the whole tenant-month object today. — `archive/PLAN.md:2691`
- `16.7` **`unreadCounts` pruning assertion** — reopen if the read changes; its floor is
  `last_read_at`, a correlated subquery. — `archive/PLAN.md:1235`
- `24.1` **user delete as a maintenance job** — at a few thousand tenants on a node, under either
  option. — `archive/PLAN.md:3968`
- **Two policy-shaped constants** — the two-month runway and the thirty-day cold grace could move
  onto `platform_policy` in an afternoon if an operator asks. — `archive/PLAN.md:1745`

**`max_locks_per_transaction` stays 1 024** until a node heads toward `24.7`'s ~1 800 tenants. Past
that, one unpruned read of `notifications` at full retention exhausts the lock table. Nothing in the
application issues one. — `PF.7`, `archive/DONE.md` §9

---

## 10. Code review of 2026-09-25 — what is left of it

Forty-eight of the forty-nine findings are closed and in [`archive/DONE.md`](archive/DONE.md) §10,
each with its proof. This one was fixed in its main part and keeps a smaller one; the body is in
[`archive/REVIEW-2026-09-25.md`](archive/REVIEW-2026-09-25.md) at the line given.

- [~] `CR.20` **A caught-up tenant still costs the projection three round trips.** The run now
  rotates its start, passes a failing tenant and stops paging once its budget is spent, so no
  tenant starves. What is left is that a run is O(tenants) for tenants with nothing to project.
  — `archive/REVIEW-2026-09-25.md:157`

---

## 11. Communication features — `archive/COMMUNICATION.md`

Deferred whole on 2026-09-22 because they shared one unstated requirement — messaging, email and
notifications must not slow the app down. That requirement is the performance plan, and it is
built; what it changed for each item is on the item. The decisions reached for them are
`archive/COMMUNICATION.md:51`, and three things their older entries get wrong are `:71`.
The full original text is in `archive/PLAN.md` under the same IDs.

### Messaging

- [ ] `26.1` **Threads, reactions, attachments.** `messages` is partitioned, so a thread's
  `parent_id` cannot reference `id` alone; `StorageGateway.presignPost` already signs a bounded
  upload (`DC.4`). Thread reads should take the first page's `upTo` bound (`CP2.2`). — `archive/COMMUNICATION.md:25`
- [ ] `26.6` **A cluster-wide stream cap, and presence from open streams.** The per-person cap now
  counts every stream a tab opens (`CP7.4`), per process; presence lives naturally in
  `apps/realtime`. — `archive/COMMUNICATION.md:28`
- [ ] `26.4` **Old `messages` partitions archived to S3.** Parked pending a discussion: it reopens
  decision D47. The reads that grew with it are bounded now (`CP2.2`, `CP2.3`), which weakens the
  case. — `archive/COMMUNICATION.md:29`
- [ ] `26.8` **The 250 000-recipient fan-out load test.** Needs a machine that can hold a `users`
  row per recipient. Measures the paged fan-out and batched suppression from `CP4.3`, `CP4.6`.
  — `archive/COMMUNICATION.md:32`

### Email

- [ ] `26.11` **SMTP configurable from the dashboard** — a platform default plus a per-tenant
  override, `auth.*` always on the platform sender, passwords under `MAIL_SECRET_KEY`. The pooled
  sender (`CP4.7`) becomes one pool per sender. — `archive/COMMUNICATION.md:37`
- [ ] `26.10` **A delivery log.** Today the record is the log lines, and a failed send is kept a
  week in the queue's failed set with `pnpm queue:replay` (`CP3.1`, `CP3.7`). The trigger is still
  "was this sent?" becoming unanswerable — tenant SMTP makes it likely. — `archive/COMMUNICATION.md:39`

### Notifications

- [ ] `26.3` **Web push** — whole or not at all, a third channel in the preference grid.
  — `archive/COMMUNICATION.md:45`
- [ ] `26.7` **Per-tenant digest hour, channel mentions, grouping**, plus the recipient list, count
  and opt-out `23.4` called product work. The digest fan-out is per tenant now (`CP4.5`), which is
  the shape a per-tenant hour needs. — `archive/COMMUNICATION.md:46`

---

## 13. Access and visibility plan — what is left

Built 2026-09-28 to 2026-09-30 and archived; every body is on its item in
[`archive/ACCESS-AND-VISIBILITY-PLAN.md`](archive/ACCESS-AND-VISIBILITY-PLAN.md), by ID and line. The hand walk (`AX11.3`) passed every Exit line
on 2026-09-30.

### Waiting on a trigger

- [ ] `AX11.2` **Retire `widget.dismissal`** — remove the flag's entry, the `flag` field on
  `core.hidden-widgets`, both `assertOn` calls and the `DISMISSAL` checks in `feature` and
  `apps/web`. **Trigger:** the flag is on for every org, and in any case before its `expiresOn` of
  2027-03-31. It is off everywhere today. — `archive/ACCESS-AND-VISIBILITY-PLAN.md:1373`

---

## 14. Code review of 2026-09-28 — and the plan's review before it starts

A review of the code changed since the 2026-09-25 review (`14d49db..2ee420a`), and of
`ACCESS-AND-VISIBILITY-PLAN.md` before its first box is ticked. IDs are `RV.<n>`, new. Each body is
here rather than in an archived file, because there is no archived file for it yet; line numbers
are as of `2ee420a`. Each was checked against the code, and the scenario says what triggers it.

### Code

- [ ] `RV.3` **Every fanned-out frame writes a replay log per member.** `MessagingRealtimeSubscriber`
  publishes one `conversation.changed` per member to each user channel, and
  `RedisRealtimePublisher.publish` turns each one into `XADD` + `EXPIRE` on
  `realtime:log:<user channel>`. A message to a 25 000-member channel creates or extends 25 000
  streams, each kept an hour, on the cache instance. `RealtimeLog.since` then reads and zod-parses
  the whole stream (`XRANGE - +`) on every resume. After a drain that is every stream at once.
  **Fix:** skip the log for user-channel fan-out frames, which are only list invalidations, or
  measure the cost first at `26.8`'s scale.

### The access and visibility plan — improvements before Phase 1

All seven, `RV.10`–`RV.16`, were folded into `ACCESS-AND-VISIBILITY-PLAN.md` on 2026-09-28,
before its first box was ticked. They are in [`archive/DONE.md`](archive/DONE.md) §14.

---

## 15. The docs capability — what is left

Built 2026-09-30: public, granted and organization docs as one slice, with a Fumadocs-style
reader, drafts and revisions, search, images and the `graphite` theme. The reasoning is in
[`packages/application/docs/reference/doc.md`](../packages/application/docs/reference/doc.md) and
[`packages/infrastructure/docs/reference/doc-renderer.md`](../packages/infrastructure/docs/reference/doc-renderer.md).
IDs are `DC.<n>`, new, and each body is here because no archived plan holds it. `DC.3` and
`DC.8` came built with §17's port from lite; `DC.1` and `DC.4`–`DC.7` were built 2026-10-10. All
seven are in [`archive/DONE.md`](archive/DONE.md) §15.

### Not built

- [ ] `DC.2` **No semantic search over docs** — required before `AI.1`. Search is full text plus trigram titles. **Fix:**
  a `doc.page.published` domain event, a subscriber that queues the page's sections into the
  existing embedding pipeline with `sourceType: "doc"`, and a hybrid rank in `DocSearch`.
  Organization docs only: `VectorStore` is tenant-scoped, and the platform's are one tenant.
  Declare the event and its subscriber together, or §24 fails.

### Not checked

- [ ] `DC.9` **The editing screens have not been walked by hand.** `/doc/manage`, a space's page
  tree, the editor with autosave, preview, image upload and restore, and the grant panel are
  covered by specs and typecheck but were never driven in a browser, because that needs a signed-in
  user. The reader, search, theme switching, the 404s for private spaces and the cache headers were.
  **Walk it** with the `HANDOFF.md` recipe: alice as platform admin with the platform organization
  active, then bob in his own organization.

---

## 16. The UI stack from lite — what is left

Ported 2026-10-01 from lite (`loadbearing_mini`, commits `192c27d..86d6637`, with the CI fixes
`b4263aa`, `2890e0b`, `295014e`, `192c27d` and `24f8a04`). `packages/ui` styles every component
with Tailwind utilities through `cn`, takes its behaviour from Base UI, and is grouped into
`component/`, `theme/` and `style/`. The reasoning is in
[`packages/ui/docs/index.md`](../packages/ui/docs/index.md). IDs are `UI.<n>`, new.

- [ ] `UI.1` **Not walked by hand.** Specs, typecheck and `check:contrast` pass, but no browser
  has looked. **Walk** `/kitchen-sink` in all six themes, light and dark; the keyboard on `Select`,
  `Menu`, the popover, the command palette, `ThemeToggle`, `Dialog` and `AlertDialog`; the widget
  dashboard and its zones; the messaging screens; the platform retention and restore panels; and
  the doc reader in a space with its own theme, whose popovers must keep that theme.

## 17. Lite's docs system and the platform organization — what is left

Ported 2026-10-03 from lite (`loadbearing_mini`), as `cdb88c15..3f5bcf1b`, 28 commits each ending
", from lite". The docs half is lite's `6dad856..8955fbb`: the owner audience, one process per
core, large-space reads, access links, grouped search, reading aids, doc blocks, the repository
link and Open in AI, renderer fixes, one React in the SSR build, HTML sent once and glass-scroll.
The platform half is lite's `3046dc6..5468d6a`: `platform_admin` holds the whole catalog, so the
platform organization is run like any other, behind the guards in
[`platform-scope.md`](../packages/permissions/docs/reference/platform-scope.md). Lite's migrations
`0001` and `0003` are `0052` and `0053` here. IDs are `LP.<n>`, new.

**Where the big kit differs.** `PLATFORM_ROUTE_PERMISSION` and the platform menu name all eight
pages, retention, analytics, cold storage and shards included, and every page's guard reads its key
from the table. `QueueName` joined `infrastructure`'s import surface for `doc-rerender.ts`.

**Checked by hand through the API, 2026-10-03.** As the platform admin: create a role, grant it
`doc.*` keys, invite a member into it. As that member: write, publish and delete a platform page;
refused the status page, invites and opening a space. Moved to `member`, the same person loses
doc writes. The last platform admin cannot demote themselves. An outsider gets `NOT_FOUND` on
another organization's space. Server-rendered, `/platform` forwards to its first page, the menu
lists all eight pages plus Team, Roles and Docs, and the reader renders blocks.

- [ ] `LP.1` **Not walked in a browser.** **Walk** the platform menu, Change role on Members, the
  role grid's platform column, the reader's sidebar scrollbar inside a themed space, and the
  owner audience in the space form.
- [ ] `LP.3` **`pnpm doc:bench` and `pnpm bench` not run here.** The figures in `doc.md` are
  lite's, from one node. **Measure** on the sharded profile before quoting them.

## 19. Review of 2026-10-10 — what is left

Two reviewers read the code both kits share after the 2026-10-10 fixes. One finding was false
(oRPC's fetch `RPCHandler` already adds `StrictGetMethodPlugin`, so no cross-site GET reaches a
mutation). Of the twenty-three logged as `RW.<n>`, twenty-two are fixed, in
[`archive/DONE.md`](archive/DONE.md) §19, and lite has each shared one too. One is left.

- [ ] `RW.3` **An archived `doc_revision` month makes its images look unlinked.** `DocImageOrphans`
  reads only revisions still in Postgres, and `doc_revision` is a partitioned table the retention
  pass can archive. Once a month is in cold storage, the next orphan sweep in that space deletes
  the images only those revisions named, and restoring the month brings back broken links. Big
  kit only: lite archives nothing. **Fix:** read `partition_archive` for the space's archived
  months and keep every image key under them, or keep a space's images until its revisions'
  retention expires.

## 22. AI assistant — a plan not started

- [ ] `AI.0` **Bring lite's AI search modes up.** `EMBEDDING_PROVIDER=none|openai|gemini` in place
  of `OPENAI_API_KEY`, lexical search through `VectorStore.searchText`, the Gemini embedding
  adapter and `pnpm ai:reindex`. Lite is the source here. Chat needs it to run without a paid key.
- [ ] `AI.1` **Build [`AI-CHAT-PLAN.md`](AI-CHAT-PLAN.md) — the AI Assistant.** Ask OpenAI,
  OpenRouter or Gemini about permission-checked search, generated on the `assistant` worker lane
  and streamed through realtime. Named Assistant because Messaging owns "chat". After `AI.0` and
  `DC.2` (`WC.1` is done); designed around `RV.3`. Lite ports a simpler version once it closes.

---

## Changelog

**In [`archive/DONE.md`](archive/DONE.md)**, beside the entries it explains. New rows go there, at
the top.
