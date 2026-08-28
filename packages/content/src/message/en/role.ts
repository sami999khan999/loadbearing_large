export const role = {
  "role.title": "Roles",
  "role.subtitle": "What each role in this organization is allowed to do.",
  "role.column.permission": "Permission",
  "role.badge.system": "Built in",
  // The one row of copy that exists to prevent a support ticket: `owner` is seeded with
  // every permission in the catalog, so its column is entirely green and looks broken.
  "role.hint.owner": "The owner role is granted every permission, including new ones.",
  "role.empty": "No roles yet. Run `pnpm db:seed` to create the built-in four.",
} as const;
