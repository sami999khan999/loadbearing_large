import {
  date,
  type GoalId,
  index,
  integer,
  type OrganizationId,
  pgTable,
  primaryKey,
  real,
  text,
  timestamp,
  type UserId,
  uuid,
} from "../import.js";

// A derived rollup, written only by the projection consumer and rebuildable by
// replaying `activity_log`. The name says daily so it reads as derived at a glance.
export const goalRiskDaily = pgTable(
  "goal_risk_daily",
  {
    organizationId: uuid("organization_id").$type<OrganizationId>().notNull(),
    goalId: uuid("goal_id").$type<GoalId>().notNull(),
    period: date("period", { mode: "string" }).notNull(),

    // What a dashboard reads. `real`, not `numeric` — drizzle's `numeric` returns a
    // string unless given `mode: "number"`, and a 0-1 score needs no exact decimal.
    score: real("score").notNull(),

    // What the score was computed from. Without these, changing the risk formula
    // makes every historical row silently incomparable to every new one.
    tasksTotal: integer("tasks_total").notNull(),
    tasksOverdue: integer("tasks_overdue").notNull(),
    tasksBlocked: integer("tasks_blocked").notNull(),

    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.goalId, t.period] }),
    // `AnalyticsReader.goalRiskScores(goalIds)` carries no tenant, so the primary
    // key's leading column is unavailable to it. This index is what serves it.
    index("goal_risk_daily_goal_idx").on(t.goalId, t.period.desc()),
  ],
);

// The second rollup, for `reliabilityTrend`. Components again, and here they are
// load-bearing: ratios cannot be averaged across goals, only recomputed from sums.
export const userReliabilityDaily = pgTable(
  "user_reliability_daily",
  {
    organizationId: uuid("organization_id").$type<OrganizationId>().notNull(),
    userId: uuid("user_id").$type<UserId>().notNull(),
    goalId: uuid("goal_id").$type<GoalId>().notNull(),
    period: date("period", { mode: "string" }).notNull(),
    commitmentsMet: integer("commitments_met").notNull(),
    commitmentsTotal: integer("commitments_total").notNull(),
    computedAt: timestamp("computed_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    primaryKey({ columns: [t.organizationId, t.userId, t.goalId, t.period] }),
    index("user_reliability_daily_user_idx").on(t.userId, t.period),
  ],
);

// Where a detached `activity_log` partition went. This is what makes a ClickHouse
// replay past the Postgres retention window automatable rather than archaeology.
export const activityArchive = pgTable("activity_archive", {
  period: date("period", { mode: "string" }).primaryKey(),
  objectKey: text("object_key").notNull(),
  // The count the partition held. Reconciliation compares against this for months
  // Postgres no longer has, which is the only check covering the cold window.
  rowCount: integer("row_count").notNull(),
  checksum: text("checksum").notNull(),
  archivedAt: timestamp("archived_at", { withTimezone: true }).notNull().defaultNow(),
});
