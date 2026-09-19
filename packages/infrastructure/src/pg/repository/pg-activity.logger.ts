import type { ActivityLogger, Clock, Placement, Principal } from "../../import.js";
import { Uuid } from "../../import.js";
import { BaseRepository, type DatabaseCluster } from "../primitive/index.js";
import { activityLog } from "../schema/index.js";
import type { ShardScope, TransactionScope } from "../transaction/index.js";

export class PgActivityLogger extends BaseRepository implements ActivityLogger {
  // `activity_log` is on every node, written in whichever transaction is open.
  protected override readonly placement: Placement = "local";

  public constructor(
    cluster: DatabaseCluster,
    scope: TransactionScope,
    shards: ShardScope,
    private readonly clock: Clock,
  ) {
    super(cluster, scope, shards);
  }

  // Writes through `this.db`, so it joins whatever transaction is open. That is what
  // makes the state change and its audit row commit together or not at all.
  public async record(
    actor: Principal,
    action: string,
    payload: Readonly<Record<string, unknown>>,
  ): Promise<void> {
    await this.db.insert(activityLog).values({
      id: Uuid.v7(),
      organizationId: actor.organizationId,
      actorId: actor.userId,
      action,
      payload: { ...payload },
      occurredAt: this.clock.now(),
    });
  }
}
