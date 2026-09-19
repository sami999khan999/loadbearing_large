# loadbearing

A pnpm-workspace starter kit: a TanStack Start web app and a standalone worker over a layered,
port-and-adapter package graph. Postgres + pgvector, two Redis instances (cache and queue,
deliberately separate), S3, stdout → Loki, ClickHouse behind a driver flag.

**Start at [`docs/ai/index.md`](docs/ai/index.md).** It is a table, one row per thing you might be
about to do, naming the one or two rule files that answer it. The whole rulebook is
[`docs/ai/rules/index.md`](docs/ai/rules/index.md) — thirteen files, none longer than ~850 tokens.

**Do not work from the surrounding code's example.** This repository's conventions are stated, and a
convention you infer will be wrong in the ways that matter.

Four that cost the most when broken, before you read anything else:

- **Dependencies point one way**, and `packages/application` names no framework and never logs.
- **`//` comments only, two lines maximum.** No block comments anywhere, JSX included.
- **Every colour is `var(--<name>)`**, from the twelve `packages/ui` declares. Nothing else is a
  colour.
- **Never name yourself as author, co-author, or contributor** — not in a commit message, a pull
  request, or a branch name.

Run `pnpm check:architecture` before claiming a change is done: twenty-six assertions that typecheck,
lint and tests all pass without noticing.
