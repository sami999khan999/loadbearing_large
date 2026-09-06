import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolve workspace siblings to their `src/`, the same condition
  // `apps/web/vite.config.ts` sets. Without it a spec runs against a sibling's
  // stale `dist/` and a green suite proves nothing about the code you just edited.
  resolve: { conditions: ["development"] },
  test: {
    include: ["tests/**/*.spec.ts"],
    // `tests/smoke/` needs S3, Loki and ClickHouse as well as the two this suite
    // already assumes. `pnpm smoke` runs it, against a stack that is actually up.
    exclude: ["**/node_modules/**", "tests/smoke/**"],
  },
});
