import { defineConfig } from "drizzle-kit";

// A build-time tool config, not package runtime code — the one category allowed to
// read the environment directly. An explicit throw, not `!`: an undefined URL here
// produces a connection error naming nothing.
//
// Direct, never pooled: drizzle-kit introspects and writes DDL, and `db:studio` holds a
// session open. `DATABASE_URL` is the fallback for a deployment running no pooler.
const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required.");

export default defineConfig({
  schema: "./src/pg/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
