import tseslint from "typescript-eslint";
import { base } from "./base.js";

export default tseslint.config(
  ...base,
  {
    rules: {
      "no-restricted-imports": [
        "error",
        {
          patterns: [
            {
              group: [
                "@ratchet/db",
                "@ratchet/db/*",
                "@ratchet/infrastructure",
                "@ratchet/infrastructure/*",
                "@ratchet/auth",
                "@ratchet/auth/*",
                "@ratchet/composition",
                "@ratchet/composition/*",
                "@ratchet/application",
                "@ratchet/application/*",
              ],
              message:
                "Server-only. Reachable from src/server/**, src/route/api/**, and *.server.ts only. Cross the boundary via @ratchet/contracts.",
            },
            {
              group: ["drizzle-orm", "drizzle-orm/*", "pg", "ioredis", "bullmq", "better-auth"],
              message: "Server-only dependency. It must never appear in a client bundle.",
            },
          ],
        },
      ],
    },
  },
  {
    // The server-only escape hatch — exactly two directories and one filename suffix.
    files: ["src/server/**", "src/route/api/**", "**/*.server.ts"],
    rules: {
      "no-restricted-imports": "off",
      "no-restricted-properties": "off",
    },
  },
);
