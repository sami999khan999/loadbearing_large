import { UnitOfWork } from "../../import.js";
import type { Database } from "../primitive/index.js";
import type { TransactionScope } from "./transaction-scope.js";

export class PgUnitOfWork extends UnitOfWork {
  public constructor(
    private readonly database: Database,
    private readonly scope: TransactionScope,
  ) {
    super();
  }

  // A nested run() joins the outer transaction rather than opening a second one:
  // `storage.run` replaces the handle only for the inner callback's duration.
  public override async run<T>(work: () => Promise<T>): Promise<T> {
    return this.database.client.transaction((tx) => this.scope.within(tx, work));
  }
}
