import { useCapabilities } from "../auth/index.js";
import { useErrorMessage } from "../error/index.js";
import { useMessages } from "../i18n/index.js";
import {
  type CapabilitiesDto,
  CapabilitySet,
  PermissionRegistry,
  RoleQueries,
  StatusBadge,
  useApiClient,
  useAppQuery,
  useMemo,
} from "../import.js";

// The API returns raw strings, as `RoleMatrix` also receives them: a permission the
// catalog no longer knows is a stale row, and this is where it stops being trusted.
function fromWire(dto: CapabilitiesDto): CapabilitySet {
  const registry = PermissionRegistry.instance;
  const scoped = (set: CapabilitiesDto["org"]) => ({
    grants: set.grants.filter((key) => registry.isKnown(key)),
    denies: set.denies.filter((key) => registry.isKnown(key)),
  });

  return CapabilitySet.from({
    wildcard: dto.wildcard,
    org: scoped(dto.org),
    goals: Object.fromEntries(Object.entries(dto.goals).map(([id, set]) => [id, scoped(set)])),
  });
}

export interface EffectivePermissionsInspectorProps {
  // Without one, `can()` denies every goal-scoped key — correct, and worth showing
  // rather than hiding.
  readonly goalId?: string;
  // Absent means the viewer's own, answered from the session with no round trip.
  // Present means someone else's, which only the server can resolve.
  readonly userId?: string;
}

// "What can this principal actually do, right now", against the same `CapabilitySet`
// the server calls `can()` on — one implementation, so the answer cannot differ.
export function EffectivePermissionsInspector({
  goalId,
  userId,
}: EffectivePermissionsInspectorProps) {
  const own = useCapabilities();
  const { t } = useMessages("common");
  const describe = useErrorMessage();
  const client = useApiClient();

  // `enabled` on the query rather than a conditional hook: the viewer's own set needs
  // no request, and hooks cannot be called on a branch.
  const other = useAppQuery({ ...RoleQueries.effective(client, userId ?? ""), enabled: !!userId });

  const capabilities = useMemo(
    () => (userId ? (other.data ? fromWire(other.data) : null) : own),
    [userId, other.data, own],
  );

  const registry = PermissionRegistry.instance;
  const modules = registry.modules();

  if (userId && other.isPending) return <p>{t("state.loading")}</p>;
  if (userId && other.isError) return <p>{describe(other.error)?.message}</p>;
  if (!capabilities || modules.length === 0) return <p>{t("state.empty")}</p>;

  return (
    <div className="ui-stack">
      {modules.map((module) => (
        <section key={module}>
          <h3>{module}</h3>
          <ul>
            {registry.byModule(module).map((permission) => {
              const allowed = capabilities.can(permission, goalId);
              return (
                <li key={permission}>
                  <code>{permission}</code>{" "}
                  <StatusBadge tone={allowed ? "success" : "neutral"}>
                    {allowed ? t("state.allowed") : t("state.denied")}
                  </StatusBadge>{" "}
                  {
                    // Beside the answer on purpose: a goal-scoped key reading "denied"
                    // with no goal selected is not a permission problem.
                  }
                  <small>{registry.scopeOf(permission)}</small>
                </li>
              );
            })}
          </ul>
        </section>
      ))}
    </div>
  );
}
