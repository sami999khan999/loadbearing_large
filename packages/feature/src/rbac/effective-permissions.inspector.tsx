import { useCapabilities } from "../auth/index.js";
import { useMessages } from "../i18n/index.js";
import { PermissionRegistry, StatusBadge } from "../import.js";

export interface EffectivePermissionsInspectorProps {
  // Scopes the answer for goal-scoped permissions. Without one, `can()` denies every
  // goal-scoped key — which is correct, and worth showing rather than hiding.
  readonly goalId?: string;
}

// "What can this principal actually do, right now." Answered entirely from the catalog
// and the session's `CapabilitySet` — no query, no round trip — because both halves are
// already in the browser. That is what makes it useful for support: it is the client's
// own view of the permissions the server will enforce.
//
// Doc 23 names this component and specifies no body.
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
                  {/* The scope is shown beside the answer on purpose: a goal-scoped key
                      reading "denied" with no goal selected is not a permission problem,
                      and this is exactly where that gets misread. */}
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
