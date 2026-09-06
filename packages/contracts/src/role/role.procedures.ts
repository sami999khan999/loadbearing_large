import { oc } from "../import.js";
import { Envelope } from "../primitive/index.js";
import { RoleContract } from "./role.contract.js";

export class RoleProcedures {
  private constructor() {}

  public static readonly list = oc
    .route({ method: "GET", path: "/roles" })
    .input(RoleContract.listQuery)
    .output(Envelope.paginated(RoleContract.entity));

  // Someone else's effective permissions, which is a different question from the
  // viewer's own — that one is answered from the session with no round trip.
  public static readonly effective = oc
    .route({ method: "GET", path: "/roles/effective/{userId}" })
    .input(RoleContract.inspect)
    .output(RoleContract.capabilities);

  // The object the merge point in `procedure/index.ts` mounts. One place to add a
  // procedure to, rather than two.
  public static readonly all = {
    list: RoleProcedures.list,
    effective: RoleProcedures.effective,
  } as const;
}
