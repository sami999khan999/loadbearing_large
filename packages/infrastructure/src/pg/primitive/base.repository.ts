import type { OrganizationId, Principal } from "../../import.js";
import type { TransactionScope } from "../transaction/index.js";
import type { Database, DrizzleClient } from "./database.js";

export abstract class BaseRepository {
  public constructor(
    protected readonly database: Database,
    protected readonly scope: TransactionScope,
  ) {}

  // The transaction handle when one is open, the pool otherwise. Every query in
  // every subclass goes through this, which is what makes UnitOfWork real.
  protected get db(): DrizzleClient {
    return this.scope.current() ?? this.database.client;
  }

  // Every tenant-scoped query starts here. A method that cannot narrow by this is
  // a cross-tenant read waiting to happen.
  protected tenant(actor: Principal): OrganizationId {
    return actor.organizationId;
  }
}
