export const role = {
  "role.title": "Roles",
  "role.subtitle": "What each role in this organization is allowed to do.",
  "role.column.permission": "Permission",
  "role.column.name": "Role",
  "role.column.actions": "Actions",
  "role.badge.system": "Built in",
  // The one row of copy that exists to prevent a support ticket: `owner` is seeded with
  // every permission in the catalog, so its column is entirely green and looks broken.
  "role.hint.owner": "The owner role is granted every permission, including new ones.",
  "role.hint.system": "Built-in roles are rewritten on every deploy, so they cannot be edited.",
  "role.hint.readOnly": "You can see these grants but not change them.",
  // The grant is kept, so moving back to a plan that includes it restores it.
  "role.blocked": "Not included in your plan",
  "role.empty": "No roles yet. Run `pnpm db:seed` to create the built-in four.",
  "role.create.title": "New role",
  "role.create.key": "Key",
  "role.create.keyHint": "Lowercase letters, digits, dashes. Permanent once created.",
  "role.create.name": "Name",
  "role.create.description": "Description",
  "role.create.submit": "Create role",
  "role.rename.title": "Rename {name}",
  "role.action.rename": "Rename",
  "role.action.delete": "Delete",
  "role.action.save": "Save",
  "role.action.cancel": "Cancel",
  "role.error.reserved": "That key belongs to a built-in role. Choose another.",
  "role.error.duplicate": "A role with that key already exists here.",
  "role.error.system": "Built-in roles cannot be edited or deleted.",
  "role.error.inUse": "Someone still holds this role. Move them to another role first.",
  // The refusal a generic 403 describes badly: the caller may grant, just not this.
  "role.error.escalate": "You cannot grant a permission you do not hold yourself.",
} as const;
