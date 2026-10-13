---
title: AI assistant plan — ask OpenAI, OpenRouter or Gemini about permitted data, sized for 100K concurrent users
updated: 2026-10-10
owner: sami
schema: plan/v1
source: owner request 2026-10-10; three read-only surveys (AI and docs search, streaming and scale seams, worker and platform admin); the owner chose large first, then a simpler port to lite; checked against the open backlog the same day
---

# AI assistant

## Context

People ask an AI model about the data they may read: Docs pages through their space visibility,
and AI documents through their goal scope. The owner asked for it to serve about 100K concurrent
users, and to scale by adding processes and config, never by changing the architecture. Lite takes
a simpler port once this is built — its plan is `docs/plans/AI-CHAT-PLAN.md` there.

**It is called the Assistant, never chat.** Messaging (`packages/application/src/messaging/`) is
person-to-person chat — its nav entry uses the `chat` icon and its copy says chat — and it keeps
the word. Every name below is `assistant`.

**Order:** `WC.1` → `AI.0` → `DC.2` → `AI.1`.
1. [`WORKER-CONTROL-PLAN.md`](WORKER-CONTROL-PLAN.md) (`WC.1`). The assistant runs on its
   `assistant` lane.
2. `AI.0` (done 2026-10-14). Large's AI search predated lite's: OpenAI alone, with no lexical
   mode. Lite's search modes came up first.
3. `DC.2` (semantic search over Docs). Without it, Docs passages are found by keyword only.
4. `AI.1`, the rest of this file.

## Sizing for 100K concurrent users
**Assumptions:** about 5% are generating at once, so 5K concurrent answers, with a planning peak of
10K. Each answer runs 10–30 s, and there are about 1.5K questions a second.

| Resource | Peak | Answer |
|---|---|---|
| Provider | 10K streams | The `assistant` queue makes excess wait instead of failing. A BullMQ limiter caps requests a minute. OpenRouter or several keys spread the load. **The provider contract is the real ceiling.** |
| Generation | 10K slow I/O calls | Worker services with `WORKER_QUEUES=assistant`. The dashboard autoscales lane concurrency between a min and a max. The host adds replicas. |
| Browser streams | +10K SSE, open only while generating | `apps/realtime` replicas behind the proxy. |
| Redis fan-out | About 100K frames a second (chunks every ~100 ms) | `REDIS_ASSISTANT_URL`, falling back to `REDIS_REALTIME_URL`, then the cache Redis. Keys use hash tags (`assistant:{messageId}`), so moving to Redis Cluster with `SPUBLISH` is an adapter change. |
| Postgres | About 3K writes a second, never one per token | No connection is held during generation. Retrieval goes to the replica. Assistant tables are `routed` and partitioned, so shard nodes apply unchanged. |
| Vectors | 1.5K searches a second | pgvector HNSW on the replica. `VECTOR_DRIVER` swaps the store. |
| Usage reporting | Cross-tenant | Projected to ClickHouse and never queried across tenants in Postgres (`docs/ai/rules/data.md`). |

## Flow
1. **`assistant.message.send`** (web):
   - Checks: `ai.assistant.use` → rate limit → the person's active-generation cap → the org's daily
     token budget (Redis).
   - In one short transaction it inserts the user message and a `pending` assistant message, and
     publishes an `assistant` job with `inFlightId = messageId` and `attempts: 1`.
   - **No activity row per message.** This follows Messaging
     (`packages/application/src/messaging/send-message.use-case.ts:124`): message volume isn't an
     audit trail. Only `ai.assistant.thread.created|deleted` are recorded. Metering is the
     `ai_usage` row.
   - Returns `{threadId, messageId}`.
2. **`assistant.stream({messageId})`** (realtime) is an oRPC event iterator.
   - It checks the message's org and author.
   - It replays from the answer's log after `lastEventId`, then follows live frames until `done` or
     `error`.
3. **`GenerateAssistantAnswerUseCase`** (worker, `assistant` lane):
   1. Rebuild **the user's own principal** with current grants, so the search runs as them. A
      non-member gets nothing.
   2. Load history up to a token budget.
   3. Run `SearchDocsUseCase` and `SearchDocumentsUseCase` in parallel and take the top K within a
      token budget.
      - Docs passages come only through `SearchDocsUseCase`. After `DC.2` it ranks
        full-text + vector **inside** the visible-space filter.
      - There is no second doc-vector path, so space visibility is enforced in one place.
   4. Build the prompt: a fixed system prompt first, for provider prompt caching; passages fenced
      as untrusted data; history; then the question.
   5. Call `AssistantModel.stream`. Coalesce text every ~100 ms or 64 characters, then `XADD` and
      `PUBLISH`.
   6. Finish in one short transaction: update the message, insert an `ai_usage` row, settle the
      budget, and publish `done`. One realtime invalidation goes to the author's own channel, so
      their other tabs refresh the thread list.
   - **Cancel:** a Redis flag, checked between chunks; the partial answer is saved as `cancelled`.
   - **Drain:** a cut-off answer is saved as `interrupted`. A nightly sweep moves `pending`
     messages older than 10 minutes to `failed`.
4. **Reopen:** `assistant.thread.get` re-checks each saved source. One the reader can't see any
   more shows as unavailable.

### The answer's stream log (this avoids `RV.3`)
`RV.3` is open: every realtime frame writes a per-channel replay log, and a resume reads the
**whole** stream (`XRANGE - +`). The assistant must not inherit either.
- **One log per answer** (`assistant:{messageId}`). Never per member, and never on a user channel.
- **Resume reads only what's new** (`XRANGE key (lastId +`). Never `- +`.
- **A 10-minute TTL**, on `REDIS_ASSISTANT_URL`. Never on the cache instance.
- **The end-of-answer invalidation is a single frame** to the author.

## Steps
- **AI.0, search modes up from mini** (mini is the source here):
  - `EMBEDDING_PROVIDER` / `EMBEDDING_API_KEY`, which replaces `OPENAI_API_KEY`, with a note in
    the env docs.
  - `SearchMode`.
  - `VectorStore.searchText` with its pg migration.
  - `gemini/gemini-embedding.provider.ts`.
  - `Container.buildSearchMode`.
  - `pnpm ai:reindex`.
  - Run large's own verification, and add a row to the changelog in `archive/DONE.md` when it
    closes.
- **DC.2, semantic search over Docs** (its backlog entry is the spec):
  - a `doc.page.published` event;
  - a subscriber that queues sections into the embedding pipeline with `sourceType: "doc"`;
  - a hybrid rank in `DocSearch`.
- **1, model interface and adapters** — **done 2026-10-14**, see
  [`assistant.md`](../packages/infrastructure/docs/reference/assistant.md). The fake is
  `CannedAssistantModel` in `canned/`; the shared stream code is `sse/`. The budget and concurrency
  env vars below arrive with the steps that read them:
  - Port `application/src/port/assistant.model.ts`:
    `stream(req, signal): AsyncIterable<AssistantDelta>`, with `model` and `contextTokens`.
  - Adapters, `fetch`-based with no SDK:
    - `openai/openai-assistant.model.ts` serves both OpenAI and OpenRouter (`endpoint` plus
      OpenRouter's headers).
    - `gemini/gemini-assistant.model.ts` uses `streamGenerateContent?alt=sse`.
    - A shared SSE line parser.
    - A first-byte timeout and an idle timeout.
    - 429 maps to `RateLimitedError`; other failures to `UnavailableError`.
    - `fake` streams canned text.
  - Env: `ASSISTANT_PROVIDER=none|fake|openai|openrouter|gemini`, `ASSISTANT_API_KEY`,
    `ASSISTANT_MODEL`, `ASSISTANT_ENDPOINT`, `ASSISTANT_MAX_OUTPUT_TOKENS`,
    `ASSISTANT_ORG_DAILY_TOKENS`, `ASSISTANT_ACTIVE_PER_USER`, `REDIS_ASSISTANT_URL`,
    `WORKER_ASSISTANT_CONCURRENCY`, `WORKER_ASSISTANT_RATE_PER_MINUTE`.
  - `Container.buildAssistantModel`.
- **2, data** — **tables done 2026-10-14**, migration `0056_assistant`: retention is 12 months for
  messages and 25 for usage. `ai.assistant.use` comes with step 5, because the architecture check
  refuses a permission no procedure asserts:
  - `assistant_threads` (list by org).
  - `assistant_messages` (list by org, range by month).
  - `ai_usage` (append-only, list by org, range by month).
  - Every index leads with the tenant. The primary key includes the partition key.
  - Add them to `PartitionedTable.ALL`, so seeding, export, purge and **retention archive** cover
    them. Large has retention, so give them real `retentionMonths`.
  - A migration that seeds `ai.assistant.use`.
- **3, application** (`application/src/assistant/`):
  - Use cases: send, cancel, list, get (with source re-checks), rename, delete, and generate.
  - Helpers: `AssistantRetrieval`, `AssistantPromptBuilder`, `AssistantBudget`.
  - Ports:
    - `AssistantStreamPublisher` / `AssistantStreamSubscriber`. These give complete delivery,
      unlike realtime's lossy frames.
    - `AssistantBudgetStore`.
- **4, infrastructure:**
  - `redis-assistant-stream.publisher|subscriber`. They copy the realtime `MULTI XADD+PUBLISH` and
    the per-process demux, with no drop-oldest and with the stream-log rules above.
  - `redis-assistant-budget.store`.
  - `QueueName.ASSISTANT`.
  - A `QueueLimits` entry and a **`LaneRegistry` entry**, so the worker dashboard can pause, move
    and autoscale the assistant.
- **5, transport:**
  - Contracts in `contracts/src/assistant/`, with permissions and actions catalogs. The actions are
    `ai.assistant.thread.created|deleted` only.
  - `ai.assistant.use`, with a route and nav gate. Plans enable it through `EntitlementMask`.
  - `RateLimitPolicy` entries.
  - The web `assistant.router.ts`, and `assistant.stream` in `api-server/src/router/` beside
    `realtime.router.ts`.
  - The worker `assistant.consumer.ts` with a BullMQ limiter.
- **6, usage reporting (large only):**
  - Project `ai_usage` into ClickHouse beside `clickhouse-analytics.projector.ts`.
  - A platform **AI usage** panel on the analytics page: tokens and cost by organization, model and
    day.
  - Org admins see their own org's usage, a tenant-scoped Postgres read.
- **7, client and UI:**
  - `api-client`, plus `query/src/assistant/` with a `useAssistantStream` hook on
    `RealtimeStream.run`.
  - Copy in English and Bengali.
  - `feature/src/assistant/`: thread list, streamed markdown, source chips, stop button, and
    queued, interrupted and failed states.
  - The route `_authenticated/assistant/`. The menu label is "Assistant", with its own icon rather
    than Messaging's `chat` icon.
- **8, docs:**
  - An assistant reference covering the flow, permissions, source re-checks, and what is sent to
    the provider.
  - A `docs/scale/` assistant section.
  - A load-test script (`tooling/scripts/assistant-load.mjs` with `ASSISTANT_PROVIDER=fake`). Its
    measured per-process ceilings are recorded in the scale doc.

## Backlog items this touches
- **`RV.3`:** the stream log is designed around it (above). Fixing `RV.3` later changes nothing
  here.
- **`DC.2`:** required before `AI.1`, and the only source of Docs vectors.
- **`26.6`:** an answer stream counts towards `REALTIME_MAX_STREAMS_PER_USER` (8, per process).
  The cluster-wide cap covers it when built.
- **`24.7`:** if pooled partitions land, the three assistant tables join the pool like every other
  partitioned table.

## Security
- The model sees only the user's own permission-checked results. It has no tools and no database
  access.
- Passages are fenced as data.
- Threads are private to their author and org.
- No message content is logged.
- `ASSISTANT_PROVIDER=none` hides the feature.

## Verification
- **Unit:**
  - the prompt builder;
  - the budget;
  - adapter SSE parsing against OpenAI, OpenRouter and Gemini fixtures (errors, 429, idle
    timeout);
  - generate: cancel, interrupted, and a member removed mid-flight.
- **Permission specs:** the fake model's prompt never contains text from a space or goal the user
  can't read, and sources are re-checked on reopen.
- **Integration:**
  - partitions, export, purge and retention;
  - a resume reads only entries after `lastEventId`;
  - `inFlightId` dedupe;
  - the assistant lane pausing and autoscaling from the worker dashboard.
- **Repo checks and load test:** `build:packages`, `typecheck`, `lint`, `test`,
  `check:architecture`, `check:contrast` and boot smokes. Then the load test with `fake`.
- **Browser:**
  - send, stream, stop, reload mid-answer, and two tabs;
  - a private-space leak test;
  - the usage panel;
  - one real run per provider, with keys supplied by the owner.
