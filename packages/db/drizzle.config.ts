import { defineConfig } from "drizzle-kit";

// A build-time tool config, not package runtime code — the one category allowed to
// read the environment directly. An explicit throw, not `!`: an undefined URL here
// produces a connection error naming nothing.
const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required.");

export default defineConfig({
  schema: "./src/schema/index.ts",
  out: "./migrations",
  dialect: "postgresql",
  dbCredentials: { url },
  strict: true,
  verbose: true,
});
