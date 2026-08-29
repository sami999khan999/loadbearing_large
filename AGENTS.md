# AGENTS.md

`loadbearing` — pnpm workspace, TanStack Start web app + standalone worker, layered
port-and-adapter package graph.

**Every rule lives in `docs/ai/`. Read this before writing code here:**

> **[`docs/ai/index.md`](docs/ai/index.md)** — the task router. One row per thing you might be
> about to do, pointing at the one file that answers it. None is over ~650 tokens.

The rulebook's own contents are [`docs/ai/rules/index.md`](docs/ai/rules/index.md), if you want the
whole list rather than one task's answer.

Do not work from the surrounding code's example. This repository's conventions are stated, and a
convention you infer will be wrong in the ways that matter.
