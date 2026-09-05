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
  // Paged rather than unbounded: `Pagination.query` caps `limit` at 100, so asking for
  // more is a validation error rather than a slow page.
  readonly limit?: number;
}

// Reads through a defined query rather than calling the client: a raw call is a read
// nothing can invalidate, which the ban on importing `api-client` here prevents.
export function RoleMatrix({ limit = 25 }: RoleMatrixProps) {
  const { t } = useMessages("role");
  // `common` for the shared states, `role` for this screen's copy. The namespace is what
  // makes the key type narrow enough for a typo to be a compile error.
  const shell = useMessages("common");
  const client = useApiClient();
  const roles = useAppQuery(RoleQueries.list(client, { limit, offset: 0 }));

  // The same class and method the server runs inside `Authorizer.assert()`, which is why
  // this screen is not a second model of the rules.
  const subjects = useMemo<readonly MatrixSubject[]>(() => {
    const registry = PermissionRegistry.instance;

    // Annotated rather than inferred: `ApiClient`'s procedure types are reconstructed
    // through two packages, and a break anywhere degrades to `any` silently.
    const items: readonly RoleDto[] = roles.data?.items ?? [];

    return items.map((role) => ({
      id: role.id,
      label: role.name,
      capabilities: CapabilitySet.from({
        // Never a wildcard, even for `owner`: the seed writes every permission as a real
        // grant, so this shows what is stored.
        wildcard: false,
        org: {
          // A permission the catalog no longer knows is a stale row, not a grant. The API
          // returns it unfiltered; this is where it stops being trusted.
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
      {
        // Read-only: no `onToggle`. Editing a grant is a different permission and a
        // different procedure, and a checkbox that does nothing is worse than honesty.
      }
      <PermissionMatrix subjects={subjects} />
      {roles.data?.items.some((role) => role.key === "owner") ? (
        <StatusBadge tone="neutral">{t("role.hint.owner")}</StatusBadge>
      ) : null}
    </section>
  );
}
