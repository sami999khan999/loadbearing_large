# loadbearing

A pnpm-workspace starter kit: a TanStack Start web app, a standalone worker and a stream process
that holds every open browser stream, over a layered, port-and-adapter package graph. Postgres +
pgvector, two Redis instances (cache and queue, deliberately separate), S3, stdout → Loki,
ClickHouse behind a driver flag.

**Start at [`docs/ai/index.md`](docs/ai/index.md)** — one row per task, naming the rule files that
answer it. The whole rulebook is [`docs/ai/rules/index.md`](docs/ai/rules/index.md): fourteen
files, ~8,700 tokens.

**Do not work from the surrounding code's example.** The conventions are stated; an inferred one
will be wrong in the ways that matter.

The four that cost the most when broken:

- **Dependencies point one way**, and `packages/application` names no framework and never logs.
- **`//` comments only, two lines maximum.** No block comments anywhere, JSX included.
- **Every colour is `var(--<name>)`**, from the twelve `packages/ui` declares.
- **Never name yourself as author, co-author, or contributor** — not in a commit message, a pull
  request, or a branch name.

Run `pnpm check:architecture` before claiming a change is done: thirty-two assertions that
typecheck, lint and tests all miss.
