import { useMessages } from "../i18n/index.js";
import {
  CapabilitySet,
  EmptyState,
  PermissionRegistry,
  type RoleDto,
  RoleQueries,
  StatusBadge,
  useApiClient,
  useAppQuery,
  useMemo,
} from "../import.js";
import { type MatrixSubject, PermissionMatrix } from "./permission-matrix.js";

export interface RoleMatrixProps {
  // How many roles to show. Paged rather than unbounded because `Pagination.query` caps
  // `limit` at 100 in the schema — a component asking for more gets a validation error
  // from the contract rather than a slow page.
  readonly limit?: number;
}

// The first component in the kit that reads from the server, and it reads through a
// defined query — `RoleQueries.list` — rather than calling the client itself. The
// difference is invalidation: a raw call is a read nothing can invalidate, and the ban
// on importing `@loadbearing/api-client` here is what keeps that from happening quietly.
export function RoleMatrix({ limit = 25 }: RoleMatrixProps) {
  const { t } = useMessages("role");
  // `common` for the states every screen shares, `role` for this screen's own copy.
  // Both are one `t()` over one `Translator`; the namespace is what makes the key type
  // narrow enough for a typo to be a compile error.
  const shell = useMessages("common");
  const client = useApiClient();
  const roles = useAppQuery(RoleQueries.list(client, { limit, offset: 0 }));

  // Each role's grants become the `CapabilitySet` the matrix asks `can()` on — the same
  // class, and the same method, the server runs inside `Authorizer.assert()`. That
  // identity is the whole reason this screen can be trusted: it is not a second model of
  // the rules, it is the rules.
  const subjects = useMemo<readonly MatrixSubject[]>(() => {
    const registry = PermissionRegistry.instance;

    // Annotated rather than inferred. `ApiClient`'s procedure types are reconstructed
    // from the contract through two packages, and a break anywhere along that chain
    // degrades to `any` silently — which is exactly the read this file must not do
    // unchecked. Naming the type here turns that into a compile error.
    const items: readonly RoleDto[] = roles.data?.items ?? [];

    return items.map((role) => ({
      id: role.id,
      label: role.name,
      capabilities: CapabilitySet.from({
        // Never a wildcard, even for `owner`. The seed writes out every permission as a
        // real grant, so this shows what is actually stored rather than a claim the row
        // would be making about itself.
        wildcard: false,
        org: {
          // A permission the catalog no longer knows is a stale row, not a grant. The
          // API returns it unfiltered on purpose; this is where it stops being trusted.
          grants: role.permissions.filter((key) => registry.isKnown(key)),
          denies: [],
        },
        goals: {},
      }),
    }));
  }, [roles.data]);

  if (roles.isPending) return <EmptyState title={shell.t("state.loading")} />;
  if (roles.isError) return <EmptyState title={shell.t("state.error")} />;
  if (subjects.length === 0) return <EmptyState title={t("role.empty")} />;

  return (
    <section>
      <p>{t("role.subtitle")}</p>
      {/* Read-only: no `onToggle`. Editing a grant is `rbac.permission.grant`, which is
          a different permission and a different procedure — and a checkbox that silently
          does nothing is worse than a word that is honest. */}
      <PermissionMatrix subjects={subjects} />
      {roles.data?.items.some((role) => role.key === "owner") ? (
        <StatusBadge tone="neutral">{t("role.hint.owner")}</StatusBadge>
      ) : null}
    </section>
  );
}
