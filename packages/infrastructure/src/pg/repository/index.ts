// Every concrete Postgres adapter, one file each, flat: they are all the same kind of
// thing, and the subject that earns a folder is the external system one level up.
export { PgActivityLogger } from "./pg-activity.logger.js";
export { PgActivityArchiveGateway } from "./pg-activity-archive.gateway.js";
export { PgActivityReplayReader } from "./pg-activity-replay.reader.js";
export { PgApiKeyRepository } from "./pg-api-key.repository.js";
export { PgBootstrapMembershipEnroller } from "./pg-bootstrap-membership.enroller.js";
export { PgCapabilityRepository } from "./pg-capability.repository.js";
export { PgConversationRepository } from "./pg-conversation.repository.js";
export { PgInvitationClaimer } from "./pg-invitation.claimer.js";
export { PgInvitationRepository } from "./pg-invitation.repository.js";
export { PgMaintenanceGateway } from "./pg-maintenance.gateway.js";
export { PgMemberRepository } from "./pg-member.repository.js";
export { PgMembershipReader } from "./pg-membership.reader.js";
export { PgMessageRepository } from "./pg-message.repository.js";
export { PgNotificationRepository } from "./pg-notification.repository.js";
export { PgNotificationPreferenceRepository } from "./pg-notification-preference.repository.js";
export { PgNotificationRecipientReader } from "./pg-notification-recipient.reader.js";
export { PgOrganizationFounder } from "./pg-organization.founder.js";
export { PgOrganizationReader } from "./pg-organization.reader.js";
export { PgOutboxGateway } from "./pg-outbox.gateway.js";
export { PgOutboxPublisher } from "./pg-outbox.publisher.js";
export { PgPersonalOrganizationEnroller } from "./pg-personal-organization.enroller.js";
export { PgRoleRepository } from "./pg-role.repository.js";
export { PgVectorStore } from "./pg-vector.store.js";
