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
  type EmailMessage,
  EmailSender,
  EmbeddingProvider,
  type JobOptions,
  type LogEntry,
  type LogQuery,
  type LogReader,
  type MaintenanceGateway,
  // A value, not a type: the founder and the invitation claimer construct one to write
  // an audit row as the tenant being created or joined.
  Principal,
  type ProjectionCheckpoint,
  QueuePublisher,
  type RiskScore,
  type RolePage,
  type RoleRecord,
  type RoleRepository,
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
  type PaginationQuery,
  type RoleId,
  type UserId,
} from "@loadbearing/contracts";

// ── @loadbearing/core ────────────────────────────────────────────────────────
export { type Clock, ServerOnly, Uuid } from "@loadbearing/core";

// ── @loadbearing/errors ──────────────────────────────────────────────────────
export { InternalError, NotFoundError, UnavailableError } from "@loadbearing/errors";

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
  type SQL,
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

// ── nodemailer ───────────────────────────────────────────────────────────────
// The only mail client in the repository. Its types ship separately, and the two are
// pinned to the same major in the catalog — a `@types/nodemailer` a major behind
// describes a `sendMail` that is *almost* the one being called.
export { createTransport, type Transporter } from "nodemailer";

// ── pg ───────────────────────────────────────────────────────────────────────
export { Pool } from "pg";
