import { Env } from "~/env.js";
import { Container } from "./import.js";

// Held on `globalThis`: Vite's SSR can evaluate this module again after an edit, and a
// second container would be a second set of pools and Redis sockets beside the first.
const held = globalThis as { loadbearingContainer?: Container };

// One per process, at module scope. Per request would open a pool per request and
// exhaust Postgres in seconds — see docs/reference/server-functions.md.
held.loadbearingContainer ??= new Container(Env.containerConfig());
export const container: Container = held.loadbearingContainer;
