import { createServerFn } from "@tanstack/react-start";
import { z } from "~/import.js";
import { container } from "./container.js";

// What the landing page renders before anyone is signed in. The same three fields
// `InvitationClaimer.preview` returns, restated so the route depends on this file and
// never on the server graph behind it.
export interface InvitationSnapshot {
  readonly organizationName: string;
  readonly email: string;
  readonly expired: boolean;
}

// A server function for the same reason `fetchSession` is one: it resolves what is
// being asked about and decides nothing. No principal, because the person holding the
// link may have no account yet — the claim itself happens through the auth endpoint,
// against a session, and the claimer decides there.
//
// Same import discipline as `session.fn.ts`: `@tanstack/react-start` directly, and the
// container by relative path inside the handler the compiler strips.
export const fetchInvitation = createServerFn({ method: "GET" })
  .inputValidator(z.object({ token: z.string().min(1).max(128) }))
  .handler(async ({ data }): Promise<InvitationSnapshot | null> => {
    return container.invitationClaimer.preview(data.token);
  });
