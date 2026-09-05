import { Env } from "~/env.js";
import { Container } from "./import.js";

// One per process, at module scope. Per request would open a pool per request and
// exhaust Postgres in seconds — see docs/reference/server-functions.md.
export const container = new Container(Env.containerConfig());
