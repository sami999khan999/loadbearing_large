import {
  boolean,
  index,
  integer,
  pgTable,
  text,
  timestamp,
  type UserId,
  uuid,
} from "../../import.js";
import { organizations } from "./rbac.schema.js";

// Better Auth's models, on this repository's terms: plural tables beside `organizations`
// and `memberships`, uuid primary keys like every other table, and three columns Better
// Auth never heard of. Owned by these migrations from here on.
//
// **The export names and property keys are load-bearing.** The Drizzle adapter resolves a
// column by looking up `schema[modelName][fieldName]`, so each export below must match a
// `modelName` configured in `AuthFactory` and each property must match a Better Auth field
// name. The SQL table and column names underneath are free, which is why they are
// snake_case like everything else. Rename an export and authentication fails at runtime
// with a message about a missing Drizzle schema; rename a column and nothing happens.
//
// Re-derive the field list after an auth upgrade rather than trusting this file:
// `pnpm --filter @loadbearing/auth run auth:tables` prints exactly what the pinned version
// expects, including whatever the enabled plugins contribute. Diff it against what is here.

export const users = pgTable("users", {
  // Not Better Auth's opaque string: `advanced.database.generateId` is set to `Uuid.v7()`,
  // which is what lets `user_id` be a real uuid foreign key on the domain tables and makes
  // the branded `UserId` in contracts — declared `z.uuid()` — actually true.
  id: uuid("id").$type<UserId>().primaryKey(),
  name: text("name").notNull(),
  email: text("email").notNull().unique(),
  emailVerified: boolean("email_verified").notNull().default(false),
  image: text("image"),
  twoFactorEnabled: boolean("two_factor_enabled").default(false),

  // ── ours, not Better Auth's ──
  // Read on the first server render of every request, which is why it is here rather than
  // in a preferences table that would need a join before anything can be rendered.
  locale: text("locale").notNull().default("en"),
  timezone: text("timezone"),
  // Deactivation is a state, not a delete — the activity log points at this row forever.
  // A deactivated user keeps their rows and loses their capabilities.
  deactivatedAt: timestamp("deactivated_at", { withTimezone: true }),

  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// Not partitioned, deliberately. It looks like a third append-only table next to
// `activity_log` and `task_status_history` and is not one: rows are updated on refresh,
// deleted on sign-out, and looked up by id — a predicate carrying no partition key, so
// every lookup would scan every partition. Bounded by expiry instead, swept nightly (25).
export const sessions = pgTable(
  "sessions",
  {
    id: uuid("id").primaryKey(),
    token: text("token").notNull().unique(),
    userId: uuid("user_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // Pinned at sign-in by the session-create hook (16). It is the tenant every request
    // downstream is scoped by, so it is `notNull` with a real foreign key rather than a
    // loose string: a session pointing at a deleted organization is a principal with a
    // tenant that no longer exists.
    activeOrganizationId: uuid("active_organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),

    // Which shell opened this session. Desktop sessions are longer-lived and have to be
    // revocable independently — "sign out all devices" has to reach a machine that may be
    // offline (16.9) — and that query needs a column, not a user-agent guess.
    surface: text("surface", { enum: ["web", "desktop"] }).notNull(),

    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    ipAddress: text("ip_address"),
    userAgent: text("user_agent"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // Every foreign key needs a covering index; Postgres does not create one, and without
    // it each ON DELETE CASCADE scans the whole table.
    index("sessions_user_idx").on(t.userId),
    index("sessions_organization_idx").on(t.activeOrganizationId),
    // What makes the nightly expiry sweep cheap, and the reason partitioning is not needed.
    index("sessions_expires_idx").on(t.expiresAt),
    // "Revoke this person's desktop sessions" as an indexed lookup rather than a scan.
    index("sessions_user_surface_idx").on(t.userId, t.surface),
  ],
);

export const accounts = pgTable(
  "accounts",
  {
    id: uuid("id").primaryKey(),
    accountId: text("account_id").notNull(),
    providerId: text("provider_id").notNull(),
    userId: uuid("user_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    accessToken: text("access_token"),
    refreshToken: text("refresh_token"),
    idToken: text("id_token"),
    accessTokenExpiresAt: timestamp("access_token_expires_at", { withTimezone: true }),
    refreshTokenExpiresAt: timestamp("refresh_token_expires_at", { withTimezone: true }),
    scope: text("scope"),
    // The password hash, for the email-and-password provider. Better Auth owns the
    // hashing; nothing in this repository reads this column.
    password: text("password"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [index("accounts_user_idx").on(t.userId)],
);

// Only exists because `verification.storeInDatabase` is set (16). With secondary storage
// configured and that flag off, Better Auth does not create this table at all and keeps
// email-verification and password-reset tokens in Redis alone — where an eviction is a
// reset link that stops working, silently, on the LRU instance.
export const verifications = pgTable(
  "verifications",
  {
    id: uuid("id").primaryKey(),
    identifier: text("identifier").notNull(),
    value: text("value").notNull(),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("verifications_identifier_idx").on(t.identifier),
    index("verifications_expires_idx").on(t.expiresAt),
  ],
);

export const twoFactors = pgTable(
  "two_factors",
  {
    id: uuid("id").primaryKey(),
    userId: uuid("user_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    secret: text("secret").notNull(),
    backupCodes: text("backup_codes").notNull(),
    verified: boolean("verified").default(false),
    failedVerificationCount: integer("failed_verification_count").default(0),
    lockedUntil: timestamp("locked_until", { withTimezone: true }),
  },
  (t) => [index("two_factors_user_idx").on(t.userId)],
);
