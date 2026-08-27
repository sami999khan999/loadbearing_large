import {
  index,
  jsonb,
  pgTable,
  text,
  timestamp,
  type UserId,
  uniqueIndex,
  uuid,
} from "../../import.js";
import { users } from "./auth.schema.js";
import { organizations } from "./rbac.schema.js";

// Your own table, not Better Auth's API-key plugin. The plugin mints a session for a key,
// which means a leaked key impersonates a full user with that user's live permissions. A
// key here is a principal with its own capability set that cannot exceed its issuer's,
// re-intersected on every request (16.6).
export const apiKeys = pgTable(
  "api_keys",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    name: text("name").notNull(),
    issuerId: uuid("issuer_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),

    // First 8 characters of the token. Turns authentication into an indexed lookup
    // instead of a scan-and-compare over every key ever issued.
    prefix: text("prefix").notNull(),
    // sha256(token). The token itself is never stored, anywhere, ever — so a database
    // dump contains no usable credential.
    tokenHash: text("token_hash").notNull(),

    // Scopes as declared at creation, already intersected with the issuer's capabilities.
    // Raw strings: `PermissionRegistry.isKnown()` filters them before they are trusted,
    // so a stale row cannot grant a permission the registry no longer defines.
    scopes: jsonb("scopes").$type<string[]>().notNull().default([]),

    expiresAt: timestamp("expires_at", { withTimezone: true }),
    revokedAt: timestamp("revoked_at", { withTimezone: true }),
    lastUsedAt: timestamp("last_used_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("api_keys_hash_uq").on(t.tokenHash),
    index("api_keys_prefix_idx").on(t.prefix),
    index("api_keys_issuer_idx").on(t.organizationId, t.issuerId),
  ],
);
