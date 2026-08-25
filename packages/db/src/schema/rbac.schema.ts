import {
  boolean,
  index,
  type OrganizationId,
  pgTable,
  text,
  timestamp,
  uniqueIndex,
  uuid,
} from "../import.js";

export const organizations = pgTable("organizations", {
  id: uuid("id").$type<OrganizationId>().primaryKey(),
  slug: text("slug").notNull(),
  name: text("name").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
    // The org FK is not covered by the unique index, whose leading column is
    // `role_id`. Without this, deleting an organization scans every grant.
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
    userId: text("user_id").notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    uniqueIndex("memberships_uq").on(t.userId, t.roleId),
    index("memberships_user_idx").on(t.organizationId, t.userId),
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
    userId: text("user_id").notNull(),
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
    userId: text("user_id").notNull(),
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
