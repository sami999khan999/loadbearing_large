export { CapabilityRepository } from "./capability.repository.js";
export { type CreateRoleInput, CreateRoleUseCase } from "./create-role.use-case.js";
export { type DeleteRoleInput, DeleteRoleUseCase } from "./delete-role.use-case.js";
export { GetEntitlementUseCase } from "./get-entitlement.use-case.js";
export { type GrantPermissionInput, GrantPermissionUseCase } from "./grant-permission.use-case.js";
export {
  type InspectEffectivePermissionsInput,
  InspectEffectivePermissionsUseCase,
} from "./inspect-effective-permissions.use-case.js";
export { type ListRolesResult, ListRolesUseCase } from "./list-roles.use-case.js";
export {
  type RevokePermissionInput,
  RevokePermissionUseCase,
} from "./revoke-permission.use-case.js";
export { type RolePage, type RoleRecord, RoleRepository } from "./role.repository.js";
export { RoleRules } from "./role.rules.js";
export { type UpdateRoleInput, UpdateRoleUseCase } from "./update-role.use-case.js";
