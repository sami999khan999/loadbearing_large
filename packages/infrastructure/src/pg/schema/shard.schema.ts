import { index, pgTable, smallint, text, timestamp } from "../../import.js";

// The directory: which physical node holds a key's rows. A **catalog** table — it is
// read before any shard is known, which is what makes it the one place that can say.
export const shardAssignments = pgTable(
  "shard_assignments",
  {
    // The organization id as text, not a uuid column and not a foreign key: the key is
    // the strategy's to choose, and a fork sharding on region would put a region here.
    shardKey: text("shard_key").primaryKey(),
    // Physical, not virtual — decision D28 removed the level in between. Defaults to
    // zero, which is the only node an unsharded deployment has.
    node: smallint("node").notNull().default(0),
    assignedAt: timestamp("assigned_at", { withTimezone: true }).notNull().defaultNow(),
    // Null until the tenant has been moved. The move job reads it; nothing else does.
    movedAt: timestamp("moved_at", { withTimezone: true }),
  },
  // For the move job and the shard map, both of which ask "what is on node 2".
  (t) => [index("shard_assignments_node_idx").on(t.node)],
);
