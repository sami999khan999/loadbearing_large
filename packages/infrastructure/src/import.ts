// Everything this package takes from outside itself. No relative re-exports, which is
// what keeps it cycle-free.

// ── node ─────────────────────────────────────────────────────────────────────
export { AsyncLocalStorage } from "node:async_hooks";
export { Buffer } from "node:buffer";
export { createHash } from "node:crypto";
export { once } from "node:events";
export { Readable } from "node:stream";
export { pipeline } from "node:stream/promises";
export { createGunzip, createGzip } from "node:zlib";

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
  type ActivityLogger,
  type ActivityRecord,
  type ActivityReplayReader,
  type AnalyticsProjector,
  type ApiKeyPage,
  type ApiKeyRecord,
  type ApiKeyRepository,
  type ApiKeySummary,
  type ArchivedObject,
  type ArchivedPartition,
  CacheStore,
  type CancellationSignal,
  type CapabilityRepository,
  type ConversationMemberRecord,
  type ConversationPage,
  type ConversationRecord,
  ConversationRepository,
  type DailyCount,
  type DocumentChunk,
  type DomainEventPublisher,
  type EmailMessage,
  type EmailReceipt,
  EmailSender,
  EmbeddingProvider,
  type InvitationPage,
  type InvitationRecord,
  type InvitationRepository,
  type JobOptions,
  type LogEntry,
  type LogQuery,
  LogReader,
  type MaintenanceGateway,
  type MemberPage,
  type MemberRecord,
  type MemberRepository,
  type MessagePageResult,
  type MessageQuery,
  type MessageRecord,
  MessageRepository,
  type NewApiKey,
  type NewConversation,
  type NewInvitation,
  type NewMessage,
  type NewNotification,
  type NotificationPage,
  type NotificationPreferenceRepository,
  type NotificationRecipientReader,
  type NotificationRecord,
  type NotificationRepository,
  type OrganizationReader,
  type OutboxGateway,
  PartitionArchiveGateway,
  type PartitionEstimate,
  // A value, not a type: the seed and the maintenance gateway both walk the allowlist.
  PartitionedTable,
  type PartitionedTableEntry,
  type PartitionedTableName,
  type PreferenceRecord,
  // A value, not a type: the founder and the invitation claimer construct one to write
  // an audit row as the tenant being created or joined.
  Principal,
  type ProjectionCheckpoint,
  QueuePublisher,
  type RealtimeChannel,
  RealtimeChannels,
  type RealtimePublisher,
  RealtimeSubscriber,
  type Recipient,
  type RestoredMonth,
  type RolePage,
  type RoleRecord,
  type RoleRepository,
  type SearchHit,
  StorageGateway,
  type StoredObject,
  type SweepOutcome,
  UnitOfWork,
  type UnreadCount,
  type UnreadQuery,
  type VectorStore,
} from "@loadbearing/application";

// ── @loadbearing/content ─────────────────────────────────────────────────────
// The locale type only. A recipient row carries the language its message will be
// composed in, and `content` sits left of every package that reads one.
export type { Locale } from "@loadbearing/content";

// ── @loadbearing/contracts ───────────────────────────────────────────────────
export {
  type ApiKeyId,
  type ConversationId,
  type ConversationKind,
  type ConversationMemberRole,
  type DomainEvent,
  type DomainEventInput,
  type DomainEventName,
  type GoalId,
  Identifiers,
  type InvitationId,
  type KeysetQuery,
  type MessageId,
  type NotificationCategory,
  type NotificationId,
  type NotificationKind,
  type OrganizationId,
  type PaginationQuery,
  RealtimeContract,
  type RealtimeMessage,
  type RoleId,
  type UserId,
} from "@loadbearing/contracts";

// ── @loadbearing/core ────────────────────────────────────────────────────────
export { type Clock, ServerOnly, Token, Uuid } from "@loadbearing/core";

// ── @loadbearing/errors ──────────────────────────────────────────────────────
export {
  ConflictError,
  InternalError,
  NotFoundError,
  RateLimitedError,
  UnavailableError,
  ValidationError,
} from "@loadbearing/errors";

// ── @loadbearing/observability ───────────────────────────────────────────────
export { Logger } from "@loadbearing/observability";

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
  count,
  desc,
  eq,
  exists,
  gt,
  gte,
  inArray,
  isNull,
  type Logger as DrizzleLogger,
  lt,
  not,
  or,
  type SQL,
  sql,
} from "drizzle-orm";
export { drizzle, type NodePgDatabase } from "drizzle-orm/node-postgres";
export { migrate } from "drizzle-orm/node-postgres/migrator";
export {
  bigint,
  boolean,
  date,
  foreignKey,
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
// Its types ship separately and are pinned to the same major: a `@types/nodemailer` a
// major behind describes a `sendMail` that is *almost* the one being called.
export { createTransport, type Transporter } from "nodemailer";

// ── pg ───────────────────────────────────────────────────────────────────────
export { Pool } from "pg";
