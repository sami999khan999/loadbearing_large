import "dotenv/config";
import { migrate } from "../import.js";
import { Database } from "../primitive/index.js";

const url = process.env.DATABASE_URL;
if (!url) throw new Error("DATABASE_URL is required.");

const database = new Database({ url });
await migrate(database.client, { migrationsFolder: "./migrations" });
await database.close();

console.log("migrations applied");
