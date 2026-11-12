-- Hand-written: this is data, not DDL. The seed grants the digest key on tenants created
-- from here on; this backfills the roles that already exist.
--
-- Selected by what a role holds rather than by its key: whoever manages the tenant's roles,
-- which the seed gives the administrator, chooses when its digest goes out.
INSERT INTO "role_permissions" ("organization_id", "role_id", "permission")
SELECT r."organization_id", r."id", 'notification.digest.manage'
FROM "roles" r
WHERE EXISTS (
  SELECT 1 FROM "role_permissions" existing
  WHERE existing."role_id" = r."id"
    AND existing."organization_id" = r."organization_id"
    AND existing."permission" = 'rbac.role.manage'
)
ON CONFLICT DO NOTHING;
