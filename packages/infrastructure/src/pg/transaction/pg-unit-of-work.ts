import { UnitOfWork } from "../../import.js";
import type { Database, DrizzleClient } from "../primitive/index.js";
import type { TransactionScope } from "./transaction-scope.js";

export class PgUnitOfWork extends UnitOfWork {
  public constructor(
    private readonly database: Database,
    private readonly scope: TransactionScope,
  ) {
    super();
  }

  // `this.db`, never `database.client`: inside an open transaction this is a savepoint on
  // the same connection. Off the pool it is a second one, which cannot roll back with it.
  public override async run<T>(work: () => Promise<T>): Promise<T> {
    return this.db.transaction((tx) => this.scope.within(tx, work));
  }

  // The open handle when there is one, the pool otherwise — the same accessor
  // `BaseRepository` exposes, so a nested run sees what the repositories see.
  private get db(): DrizzleClient {
    return this.scope.current() ?? this.database.client;
  }
}
