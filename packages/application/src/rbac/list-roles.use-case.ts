import type { PaginationQuery } from "../import.js";
import type { Authorizer, Principal } from "../primitive/index.js";
import type { RoleRecord, RoleRepository } from "./role.repository.js";

export interface ListRolesResult {
  readonly items: readonly RoleRecord[];
  readonly total: number;
  readonly limit: number;
  readonly offset: number;
}

// LOAD → AUTHORIZE → WORK → PERSIST, with nothing to persist. The shortest use-case
// the kit has, and it still goes through `Authorizer.assert()` — because that call, not
// the route guard and not the oRPC middleware, is the gate. The other three surfaces
// exist to make the answer visible early; this one is the answer.
export class ListRolesUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly roles: RoleRepository,
  ) {}

  public async execute(actor: Principal, input: PaginationQuery): Promise<ListRolesResult> {
    this.authorizer.assert(actor, "rbac.role.read");

    // The tenant comes off the principal and never off the input. There is no argument
    // a caller could pass that would widen this read to another organization.
    const page = await this.roles.list(actor.organizationId, input);

    return { ...page, limit: input.limit, offset: input.offset };
  }
}
