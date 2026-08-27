import type { ActivityLogger, Clock, Principal } from "../../import.js";
import { Uuid } from "../../import.js";
import { BaseRepository, type Database } from "../primitive/index.js";
import { activityLog } from "../schema/index.js";
import type { TransactionScope } from "../transaction/index.js";

export class PgActivityLogger extends BaseRepository implements ActivityLogger {
  public constructor(
    database: Database,
    scope: TransactionScope,
    private readonly clock: Clock,
  ) {
    super(database, scope);
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
