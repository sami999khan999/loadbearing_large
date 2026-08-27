// Everything this package takes from outside itself, in one place. No relative
// re-exports live here — that is what keeps it cycle-free.
//
// The longest `import.ts` in the repository, because this package holds every
// concrete adapter: Postgres, Redis, S3, BullMQ, and the embedding provider.

// ── node ─────────────────────────────────────────────────────────────────────
export { AsyncLocalStorage } from "node:async_hooks";
export { Buffer } from "node:buffer";
export { createHash } from "node:crypto";
export { Readable } from "node:stream";
export { createGzip } from "node:zlib";

// ── @aws-sdk/client-s3 ───────────────────────────────────────────────────────
export {
  DeleteObjectCommand,
  GetObjectCommand,
  HeadObjectCommand,
  PutObjectCommand,
  S3Client,
} from "@aws-sdk/client-s3";

// ── @aws-sdk/lib-storage ─────────────────────────────────────────────────────
export { Upload } from "@aws-sdk/lib-storage";

// ── @aws-sdk/s3-request-presigner ────────────────────────────────────────────
export { getSignedUrl } from "@aws-sdk/s3-request-presigner";

// ── @loadbearing/application ─────────────────────────────────────────────────
export {
  ActivityArchiveGateway,
  type ActivityLogger,
  type ActivityRecord,
  type ActivityReplayReader,
  type AnalyticsProjector,
  type AnalyticsReader,
  type ArchivedPartition,
  CacheStore,
  type CapabilityRepository,
  type DailyCount,
  type DateRange,
  type DocumentChunk,
  EmbeddingProvider,
  type JobOptions,
  type LogEntry,
  type LogQuery,
  type LogReader,
  type MaintenanceGateway,
  type Principal,
  type ProjectionCheckpoint,
  QueuePublisher,
  type RiskScore,
  type SearchHit,
  StorageGateway,
  type StoredObject,
  type SweepOutcome,
  type TrendPoint,
  UnitOfWork,
  type VectorStore,
} from "@loadbearing/application";

// ── @loadbearing/contracts ───────────────────────────────────────────────────
export {
  type GoalId,
  Identifiers,
  type OrganizationId,
  type UserId,
} from "@loadbearing/contracts";

// ── @loadbearing/core ────────────────────────────────────────────────────────
export { type Clock, ServerOnly, Uuid } from "@loadbearing/core";

// ── @loadbearing/errors ──────────────────────────────────────────────────────
export { NotFoundError, UnavailableError } from "@loadbearing/errors";

// ── @loadbearing/permissions ─────────────────────────────────────────────────
export {
  CapabilitySet,
  type CapabilitySetDto,
  type PermissionKey,
  PermissionRegistry,
  type ScopedSetDto,
} from "@loadbearing/permissions";

// ── bullmq ───────────────────────────────────────────────────────────────────
export { Queue } from "bullmq";

// ── drizzle-orm ──────────────────────────────────────────────────────────────
export {
  and,
  asc,
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

// ── ioredis ──────────────────────────────────────────────────────────────────
export { Redis, type RedisOptions } from "ioredis";

// ── pg ───────────────────────────────────────────────────────────────────────
export { Pool } from "pg";
