import { useMessages } from "../i18n/index.js";
import { type CapabilitySet, type PermissionKey, PermissionRegistry } from "../import.js";

export interface MatrixSubject {
  readonly id: string;
  readonly label: string;
  readonly capabilities: CapabilitySet;
}

export interface PermissionMatrixProps {
  // A prop rather than a fetch, deliberately: the rows are the bundled catalog and the
  // columns are whatever the caller is comparing.
  readonly subjects: readonly MatrixSubject[];
  readonly goalId?: string;
  readonly onToggle?: (subjectId: string, permission: PermissionKey) => void;
}

// Rows are every permission in the catalog, grouped by module; columns are subjects.
// Doc 23 names this component and specifies no body.
export function PermissionMatrix({ subjects, goalId, onToggle }: PermissionMatrixProps) {
  const { t } = useMessages("common");
  const registry = PermissionRegistry.instance;
  const permissions = registry.all();

  if (subjects.length === 0 || permissions.length === 0) return <p>{t("state.empty")}</p>;

  return (
    <table className="ui-data-table">
      <thead>
        <tr>
          <th scope="col">
            {
              // The permission column has no heading of its own.
            }
          </th>
          {subjects.map((subject) => (
            <th key={subject.id} scope="col">
              {subject.label}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {permissions.map((permission) => (
          <tr key={permission}>
            {
              // `scope="row"`, or a screen reader reads every cell as a bare "yes"
              // or "no" with no permission attached.
            }
            <th scope="row">
              <code>{permission}</code>
            </th>
            {subjects.map((subject) => {
              const allowed = subject.capabilities.can(permission, goalId);
              return (
                <td key={subject.id} data-allowed={allowed ? "true" : "false"}>
                  {onToggle ? (
                    <input
                      type="checkbox"
                      checked={allowed}
                      aria-label={`${subject.label} — ${permission}`}
                      onChange={() => onToggle(subject.id, permission)}
                    />
                  ) : // A word, not a glyph. The row and column headers already say which
                  // permission and subject a cell is about, so the cell carries only the
                  // answer. A design pass can swap in an icon behind `data-allowed`.
                  allowed ? (
                    t("state.allowed")
                  ) : (
                    t("state.denied")
                  )}
                </td>
              );
            })}
          </tr>
        ))}
      </tbody>
    </table>
  );
}
