import { defineConfig } from "vitest/config";

export default defineConfig({
  // Resolve workspace siblings to their `src/`. Without it a spec runs against a
  // sibling's stale `dist/` and a green suite proves nothing about the code just edited.
  resolve: { conditions: ["development"] },
  test: { include: ["tests/**/*.spec.ts"] },
});
