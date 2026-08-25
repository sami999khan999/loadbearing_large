// Everything this package takes from outside itself, in one place. No relative
// re-exports live here — that is what keeps it cycle-free.

// ── node ─────────────────────────────────────────────────────────────────────
export { AsyncLocalStorage } from "node:async_hooks";

// ── @loadbearing/application ─────────────────────────────────────────────────
export {
  type ActivityLogger,
  type AnalyticsReader,
  type CapabilityRepository,
  type DateRange,
  type DocumentChunk,
  type Principal,
  type RiskScore,
  type SearchHit,
  type TrendPoint,
  UnitOfWork,
  type VectorStore,
} from "@loadbearing/application";

// ── @loadbearing/contracts ───────────────────────────────────────────────────
export { type GoalId, Identifiers, type OrganizationId } from "@loadbearing/contracts";

// ── @loadbearing/core ────────────────────────────────────────────────────────
export { type Clock, ServerOnly, Uuid } from "@loadbearing/core";

// ── @loadbearing/permissions ─────────────────────────────────────────────────
export {
  CapabilitySet,
  type CapabilitySetDto,
  type PermissionKey,
  PermissionRegistry,
  type ScopedSetDto,
} from "@loadbearing/permissions";

// ── drizzle-orm ──────────────────────────────────────────────────────────────
export {
  and,
  cosineDistance,
  desc,
  eq,
  gt,
  gte,
  inArray,
  isNull,
  type Logger,
  lt,
  or,
  sql,
} from "drizzle-orm";
export { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
export { migrate } from "drizzle-orm/node-postgres/migrator";
export {
  boolean,
  date,
  index,
  integer,
  jsonb,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  uniqueIndex,
  uuid,
  vector,
} from "drizzle-orm/pg-core";

// ── pg ───────────────────────────────────────────────────────────────────────
export { Pool } from "pg";
