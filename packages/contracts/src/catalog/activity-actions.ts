import { aiActions } from "./ai.actions.js";
import { apiKeyActions } from "./apikey.actions.js";
import { memberActions } from "./member.actions.js";
import { platformActions } from "./platform.actions.js";
import { roleActions } from "./role.actions.js";

// Merged from team-owned fragments, one per slice — the same shape `DOMAIN_EVENTS` has
// and a different vocabulary: an activity is the audit trail, an event is a fan-out.
export const ACTIVITY_ACTIONS = {
  ...roleActions,
  ...memberActions,
  ...apiKeyActions,
  ...aiActions,
  ...platformActions,
} as const;
