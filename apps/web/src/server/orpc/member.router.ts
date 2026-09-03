import { authed } from "./base.js";

// Three lines per procedure, as `RoleRouter`: pull the use-case off the container, call
// `execute` with the principal and the validated input, return the result. The one
// exception is `revokeInvitation`, whose use-case returns nothing and whose contract
// promises `{ ok: true }` — the acknowledgement is the transport's word, not the domain's.
export class MemberRouter {
  private constructor() {}

  public static readonly list = authed.member.list.handler(({ input, context }) =>
    context.container.member.listMembers.execute(context.principal, input),
  );

  public static readonly listInvitations = authed.member.listInvitations.handler(
    ({ input, context }) =>
      context.container.member.listInvitations.execute(context.principal, input),
  );

  public static readonly invite = authed.member.invite.handler(({ input, context }) =>
    context.container.member.inviteMember.execute(context.principal, input),
  );

  public static readonly revokeInvitation = authed.member.revokeInvitation.handler(
    async ({ input, context }) => {
      await context.container.member.revokeInvitation.execute(context.principal, input);
      return { ok: true as const };
    },
  );

  // The object the merge point in `app.router.ts` mounts, mirroring `MemberProcedures.all`.
  public static readonly all = {
    list: MemberRouter.list,
    listInvitations: MemberRouter.listInvitations,
    invite: MemberRouter.invite,
    revokeInvitation: MemberRouter.revokeInvitation,
  } as const;
}
