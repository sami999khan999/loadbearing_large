import {
  index,
  type OrganizationId,
  pgTable,
  text,
  timestamp,
  type UserId,
  uniqueIndex,
  uuid,
} from "../../import.js";
import { users } from "./auth.schema.js";
import { organizations, roles } from "./rbac.schema.js";

// Only *pending* invitations live here. Accepting one deletes the row and writes a
// membership; revoking one deletes the row. The audit log carries the history, so the
// table never needs a status column and a listing is never filtered by one.
export const invitations = pgTable(
  "invitations",
  {
    id: uuid("id").primaryKey(),
    organizationId: uuid("organization_id")
      .$type<OrganizationId>()
      .notNull()
      .references(() => organizations.id, { onDelete: "cascade" }),
    // Stored lowercased. The claim compares it against the *verified* address on the
    // user row, which is what makes the token below a locator rather than a credential.
    email: text("email").notNull(),
    roleId: uuid("role_id")
      .notNull()
      .references(() => roles.id),
    token: text("token").notNull(),
    invitedBy: uuid("invited_by")
      .$type<UserId>()
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    expiresAt: timestamp("expires_at", { withTimezone: true }).notNull(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (t) => [
    // One pending invitation per address per tenant; a re-invite replaces it.
    uniqueIndex("invitations_email_uq").on(t.organizationId, t.email),
    // The landing page and the accept endpoint arrive holding a token and no tenant, so
    // this is the second unique index in the schema that does not lead with
    // `organization_id` — the same exemption `organizations_slug_uq` records.
    uniqueIndex("invitations_token_uq").on(t.token),
    // `claimPending` finds a brand-new user's invitation by address alone.
    index("invitations_email_idx").on(t.email),
    index("invitations_role_idx").on(t.roleId),
    index("invitations_inviter_idx").on(t.invitedBy),
  ],
);
