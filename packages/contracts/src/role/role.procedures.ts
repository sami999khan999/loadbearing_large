import { oc } from "../import.js";
import { Envelope } from "../primitive/index.js";
import { RoleContract } from "./role.contract.js";

export class RoleProcedures {
  private constructor() {}

  public static readonly list = oc
    .route({ method: "GET", path: "/roles" })
    .input(RoleContract.listQuery)
    .output(Envelope.paginated(RoleContract.entity));

  // The object the merge point in `procedure/index.ts` mounts. One place to add a
  // procedure to, rather than two.
  public static readonly all = { list: RoleProcedures.list } as const;
}
