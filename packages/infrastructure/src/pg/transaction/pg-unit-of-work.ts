import { sql, UnitOfWork } from "../../import.js";
import type { Database, DrizzleClient } from "../primitive/index.js";
import type { TransactionScope } from "./transaction-scope.js";

export interface PgUnitOfWorkConfig {
  // The ceiling for work inside `run`, when it differs from the role floor migration
  // `0022` sets. The worker's batch budget; absent in the web app, which wants the floor.
  readonly statementTimeoutMs?: number;
}

export class PgUnitOfWork extends UnitOfWork {
  public constructor(
    private readonly database: Database,
    private readonly scope: TransactionScope,
    private readonly config: PgUnitOfWorkConfig = {},
  ) {
    super();
  }

  // `this.db`, never `database.client`: inside an open transaction this is a savepoint on
  // the same connection. Off the pool it is a second one, which cannot roll back with it.
  public override async run<T>(work: () => Promise<T>): Promise<T> {
    return this.db.transaction(async (tx) => {
      await this.applyStatementTimeout(tx);
      return this.scope.within(tx, work);
    });
  }

  // `SET LOCAL`, never `SET`: it dies with the transaction, so it survives a transaction
  // pooler handing this server connection to somebody else. See docs/reference/unit-of-work.md.
  private async applyStatementTimeout(tx: DrizzleClient): Promise<void> {
    const ms = this.config.statementTimeoutMs;
    if (ms === undefined) return;

    // Skipped when a transaction is already open, because this is a savepoint and the
    // outer `run` has set it — and `SET LOCAL` here would outlive the savepoint's rollback.
    if (this.scope.current()) return;

    // `sql.raw`, because Postgres accepts no bind parameter in a `SET` — the same trap
    // the partition DDL documents. Truncated to an integer, which is the whole grammar.
    await tx.execute(sql.raw(`set local statement_timeout = ${Math.trunc(ms)}`));
  }

  // The open handle when there is one, the pool otherwise — the same accessor
  // `BaseRepository` exposes, so a nested run sees what the repositories see.
  private get db(): DrizzleClient {
    return this.scope.current() ?? this.database.client;
  }
}
