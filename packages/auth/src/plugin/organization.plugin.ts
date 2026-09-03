import {
  APIError,
  type BetterAuthPlugin,
  createAuthEndpoint,
  type GenericEndpointContext,
  type OrganizationId,
  sessionMiddleware,
  setSessionCookie,
  type User,
  type UserId,
  z,
} from "../import.js";
import type { InvitationClaimer } from "../session/invitation.claimer.js";
import type { MembershipReader } from "../session/membership.reader.js";
import type { OrganizationFounder } from "../session/organization.founder.js";

// Long enough for any real name, short enough that a pasted paragraph is refused.
const NAME_MAX = 80;

const switchBody = z.object({ organizationId: z.uuid() });
const createBody = z.object({ name: z.string().trim().min(1).max(NAME_MAX) });
const acceptBody = z.object({ token: z.string().min(1) });

// The three actions that end in a session pointing at a different tenant, as Better
// Auth endpoints rather than oRPC procedures — for two reasons, both verified.
//
// They are identity-gated, not permission-gated: "may I switch to a tenant I belong
// to", "may I found one", "may I accept an invitation sent to my address" are answered
// by membership and by the verified mailbox, never by a role held in some *other*
// organization. Nothing in `PROCEDURE_PERMISSIONS` could gate them, and every
// procedure must be gated there.
//
// And only an endpoint holding Better Auth's `ctx` can call `setSessionCookie`. The
// session cookie cache (`session.cookieCache`, sixty seconds) is what most requests
// resolve the tenant from; a switch that updated the row and not the cookie would have
// every RPC for the next minute answering for the tenant just left.
export class OrganizationPlugin {
  private constructor() {}

  public static create(
    memberships: MembershipReader,
    claimer: InvitationClaimer,
    founder: OrganizationFounder,
  ): BetterAuthPlugin {
    return {
      id: "organization",
      endpoints: {
        switchOrganization: createAuthEndpoint(
          "/organization/switch",
          { method: "POST", body: switchBody, use: [sessionMiddleware], requireHeaders: true },
          async (ctx) => {
            const { session, user } = ctx.context.session;
            const organizationId = ctx.body.organizationId as OrganizationId;

            // The whole authorization. A session may only be rebound to a tenant this
            // person holds a membership in, and `isMember` is one indexed lookup.
            if (!(await memberships.isMember(user.id as UserId, organizationId))) {
              throw new APIError("FORBIDDEN", {
                code: "NOT_A_MEMBER",
                message: "Not a member of that organization.",
              });
            }

            await OrganizationPlugin.rebind(ctx, session.token, user, organizationId);
            return ctx.json({ organizationId });
          },
        ),

        createOrganization: createAuthEndpoint(
          "/organization/create",
          { method: "POST", body: createBody, use: [sessionMiddleware], requireHeaders: true },
          async (ctx) => {
            const { session, user } = ctx.context.session;

            // The same founder the personal enroller uses, so an organization created
            // here is indistinguishable from one created at a first sign-in.
            const organizationId = await founder.found(user.id as UserId, ctx.body.name);

            await OrganizationPlugin.rebind(ctx, session.token, user, organizationId);
            return ctx.json({ organizationId });
          },
        ),

        acceptInvitation: createAuthEndpoint(
          "/invitation/accept",
          { method: "POST", body: acceptBody, use: [sessionMiddleware], requireHeaders: true },
          async (ctx) => {
            const { session, user } = ctx.context.session;

            // Null covers every refusal at once — unknown token, expired, revoked, sent
            // to a different address, unverified account. The claimer decides, and the
            // landing page has already told the person which of those it is.
            const organizationId = await claimer.claimByToken(user.id as UserId, ctx.body.token);
            if (!organizationId) {
              throw new APIError("NOT_FOUND", {
                code: "INVITATION_NOT_CLAIMABLE",
                message: "That invitation cannot be accepted by this account.",
              });
            }

            await OrganizationPlugin.rebind(ctx, session.token, user, organizationId);
            return ctx.json({ organizationId });
          },
        ),
      },
    };
  }

  // What Better Auth's own organization plugin does for `setActiveOrganization`, plus
  // the last-active preference: the row in Postgres and the copy in Redis through
  // `updateSession`, then the cookie cache through `setSessionCookie`, so the very
  // next request — RPC or SSR — resolves the new tenant.
  private static async rebind(
    ctx: GenericEndpointContext,
    token: string,
    user: User,
    organizationId: OrganizationId,
  ): Promise<void> {
    const updated = await ctx.context.internalAdapter.updateSession(token, {
      activeOrganizationId: organizationId,
    });
    if (!updated) {
      throw new APIError("INTERNAL_SERVER_ERROR", { message: "The session could not be updated." });
    }

    // Where the next sign-in lands. `MembershipReader.activeOrganizationFor` honours it
    // only while the membership still exists, so nothing here needs to be undone later.
    await ctx.context.internalAdapter.updateUser(user.id, {
      lastActiveOrganizationId: organizationId,
    });

    await setSessionCookie(ctx, { session: updated, user });
  }
}
