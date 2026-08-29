# CLAUDE.md

`loadbearing` — pnpm workspace, TanStack Start web app + standalone worker, layered
port-and-adapter package graph.

**Every rule lives in `docs/ai/`. Read one of these before writing code here.**

- **[`docs/ai/rules/index.md`](docs/ai/rules/index.md)** — the rules. Start here. It routes by task:
  one row per thing you might be about to do, pointing at the one file that answers it. None is
  over ~650 tokens.
- **[`docs/ai/index.md`](docs/ai/index.md)** — everything written for agents: the rules above, and
  the skill run books beside them.

Do not work from the surrounding code's example. This repository's conventions are stated, and a
convention you infer will be wrong in the ways that matter.
