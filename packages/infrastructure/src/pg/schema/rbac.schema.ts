import {
  boolean,
  index,
  type OrganizationId,
  pgTable,
  text,
  timestamp,
  type UserId,
  uniqueIndex,
  uuid,
} from "../../import.js";
import { users } from "./auth.schema.js";

export const organizations = pgTable(
  "organizations",
  {
    id: uuid("id").$type<OrganizationId>().primaryKey(),
    slug: text("slug").notNull(),
    name: text("name").notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  // The seed and every enroller resolve a slug with `.limit(1)`, so a duplicate is a
  // silent coin flip about which tenant a new member lands in.
  (t) => [uniqueIndex("organizations_slug_uq").on(t.slug)],
);

export const roles = pgTable(
  "roles",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    key: text("key").notNull(),
    name: text("name").notNull(),
    description: text("description"),
    scope: text("scope", { enum: ["org", "goal"] }).notNull(),
    isSystem: boolean("is_system").notNull().default(false),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("roles_key_uq").on(t.organizationId, t.key),
    index("roles_organization_idx").on(t.organizationId),
  ],
);

export const rolePermissions = pgTable(
  "role_permissions",
  {
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id, { onDelete: "cascade" }),
    // A raw string. Validated through PermissionRegistry.isKnown() before it is trusted.
    permission: text("permission").notNull(),
  },
  (t) => [
    uniqueIndex("role_permissions_uq").on(t.roleId, t.permission),
    // The unique index leads with `role_id`, so it does not cover this FK: without it,
    // deleting an organization scans every grant.
    index("role_permissions_organization_idx").on(t.organizationId),
  ],
);

export const memberships = pgTable(
  "memberships",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    // Declared here rather than in a hand-authored migration: drizzle-kit diffs this file
    // against the history, so a constraint it cannot see is one the next migration drops.
    userId: uuid("user_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One membership per person per tenant, leading with the tenant column: `(user_id,
    // role_id)` let one person hold two roles and the switcher render a tenant twice.
    uniqueIndex("memberships_uq").on(t.organizationId, t.userId),
    // The `user_id` foreign key's own index: every by-user read starts from here.
    index("memberships_user_idx").on(t.userId),
    index("memberships_role_idx").on(t.roleId),
  ],
);

export const goalMembers = pgTable(
  "goal_members",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    goalId: uuid("goal_id").notNull(),
    userId: uuid("user_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("goal_members_uq").on(t.goalId, t.userId, t.roleId),
    index("goal_members_user_idx").on(t.organizationId, t.userId),
    index("goal_members_goal_idx").on(t.goalId),
    index("goal_members_role_idx").on(t.roleId),
  ],
);

// Per-user overrides. effect='deny' beats every grant, including the wildcard.
export const permissionOverrides = pgTable(
  "permission_overrides",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .notNull()
      .references(() => organizations.id),
    userId: uuid("user_id")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    goalId: uuid("goal_id"), // null = org scope
    permission: text("permission").notNull(),
    effect: text("effect", { enum: ["grant", "deny"] }).notNull(),
    reason: text("reason"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    index("permission_overrides_user_idx").on(t.organizationId, t.userId),
    index("permission_overrides_goal_idx").on(t.goalId),
    uniqueIndex("permission_overrides_uq").on(t.userId, t.goalId, t.permission),
  ],
);
