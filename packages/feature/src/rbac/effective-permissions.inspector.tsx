import { useCapabilities } from "../auth/index.js";
import { useMessages } from "../i18n/index.js";
import { PermissionRegistry, StatusBadge } from "../import.js";

export interface EffectivePermissionsInspectorProps {
  // Without one, `can()` denies every goal-scoped key — correct, and worth showing
  // rather than hiding.
  readonly goalId?: string;
}

// "What can this principal actually do, right now", answered from the bundled catalog
// and the session's own `CapabilitySet` — no query, no round trip.
export function EffectivePermissionsInspector({ goalId }: EffectivePermissionsInspectorProps) {
  const capabilities = useCapabilities();
  const { t } = useMessages("common");
  const registry = PermissionRegistry.instance;
  const modules = registry.modules();

  if (modules.length === 0) return <p>{t("state.empty")}</p>;

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
