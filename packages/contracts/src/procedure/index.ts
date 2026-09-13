import { ApiKeyProcedures } from "../apikey/index.js";
import { DocumentProcedures } from "../document/index.js";
import type { AnyContractRouter } from "../import.js";
import { MemberProcedures } from "../member/index.js";
import { ConversationProcedures, MessageProcedures } from "../messaging/index.js";
import { NotificationProcedures } from "../notification/index.js";
import { RealtimeProcedures } from "../realtime/index.js";
import { RoleProcedures } from "../role/index.js";

// The merge point for every slice's procedures, and registering one here binds three
// files to the same commit: its permissions, its procedure map, and its `apps/web` router.
export const contract = {
  role: RoleProcedures.all,
  member: MemberProcedures.all,
  apiKey: ApiKeyProcedures.all,
  document: DocumentProcedures.all,
  notification: NotificationProcedures.all,
  conversation: ConversationProcedures.all,
  message: MessageProcedures.all,
  realtime: RealtimeProcedures.all,
} as const satisfies AnyContractRouter;

export type AppContract = typeof contract;
