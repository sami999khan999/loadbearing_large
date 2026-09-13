import "dotenv/config";
import { migrate } from "./src/import.js";
import { Database } from "./src/pg/primitive/index.js";

// Direct, never pooled. Migrations run DDL and `0022` sets a role default, and a
// transaction pooler is the wrong place for either.
const url = process.env.DATABASE_DIRECT_URL ?? process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_DIRECT_URL or DATABASE_URL is required.");

const database = new Database({ url });
await migrate(database.client, { migrationsFolder: "./migrations" });
await database.close();

console.log("migrations applied");
