import type { OrganizationClient, OrganizationSwitch } from "../import.js";
import { useAppMutation } from "../runtime/index.js";

// The three actions that end in a session pointing at a different tenant.
//
// None declares `invalidates`, and that is the point rather than an omission. After a
// switch, every cached row in this client belongs to the tenant just left; the only
// correct invalidation is `queryClient.clear()`, and that is a lifecycle decision the
// call site makes — the same one sign-out makes, for the same reason.
export class OrganizationMutations {
  private constructor() {}

  public static useSwitch(organization: OrganizationClient, onDone?: () => void) {
    return useAppMutation<OrganizationSwitch, { organizationId: string }>({
      mutationFn: ({ organizationId }) => organization.switch(organizationId),
      onSuccess: onDone,
    });
  }

  public static useCreate(organization: OrganizationClient, onDone?: () => void) {
    return useAppMutation<OrganizationSwitch, { name: string }>({
      mutationFn: ({ name }) => organization.create(name),
      onSuccess: onDone,
    });
  }

  public static useAcceptInvitation(organization: OrganizationClient, onDone?: () => void) {
    return useAppMutation<OrganizationSwitch, { token: string }>({
      mutationFn: ({ token }) => organization.acceptInvitation(token),
      onSuccess: onDone,
    });
  }
}
