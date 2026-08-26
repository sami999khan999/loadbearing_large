import type { ReactNode } from "../import.js";

// A row is anything with a stable identity. `id` is the only field this component knows
// about, and it knows it for one reason: React needs a key and `onRowClick` needs
// something to hand back.
export interface TableRow {
  readonly id: string;
}

export interface TableColumn<TRow extends TableRow> {
  readonly key: string;
  // A node, not a string: the header is copy, and copy comes from the caller.
  readonly header: ReactNode;
  readonly cell: (row: TRow) => ReactNode;
  readonly align?: "start" | "end";
}

export interface DataTableProps<TRow extends TableRow> {
  readonly columns: readonly TableColumn<TRow>[];
  readonly rows: readonly TRow[];
  readonly onRowClick?: (row: TRow) => void;
  readonly caption?: string;
  readonly className?: string;
}

export interface DataTableSkeletonProps {
  readonly rows?: number;
  readonly columns?: number;
}

// The loading shape, exposed as `DataTable.Skeleton` so a caller reaches for it in the
// same place it reached for the table. It takes a row count rather than reading one from
// the table, because the pending render has no data to count.
function DataTableSkeleton({ rows = 5, columns = 3 }: DataTableSkeletonProps) {
  return (
    <div className="ui-data-table__skeleton" aria-busy="true" aria-live="polite">
      {Array.from({ length: rows }, (_, row) => (
        <div className="ui-data-table__skeleton-row" key={row}>
          {Array.from({ length: columns }, (_, column) => (
            <span className="ui-data-table__skeleton-cell" key={column} />
          ))}
        </div>
      ))}
    </div>
  );
}

function DataTableRoot<TRow extends TableRow>({
  columns,
  rows,
  onRowClick,
  caption,
  className,
}: DataTableProps<TRow>) {
  return (
    <table className={["ui-data-table", className].filter(Boolean).join(" ")}>
      {caption ? <caption className="ui-data-table__caption">{caption}</caption> : null}
      <thead>
        <tr>
          {columns.map((column) => (
            <th key={column.key} scope="col" data-align={column.align ?? "start"}>
              {column.header}
            </th>
          ))}
        </tr>
      </thead>
      <tbody>
        {rows.map((row) => (
          <tr
            key={row.id}
            className={onRowClick ? "ui-data-table__row--clickable" : undefined}
            // A clickable row is a control, so it has to be reachable and operable from
            // the keyboard. Without these three attributes the interaction exists only
            // for a mouse, which is the most common accessibility bug in a data table.
            tabIndex={onRowClick ? 0 : undefined}
            role={onRowClick ? "button" : undefined}
            onClick={onRowClick ? () => onRowClick(row) : undefined}
            onKeyDown={
              onRowClick
                ? (event) => {
                    if (event.key !== "Enter" && event.key !== " ") return;
                    event.preventDefault();
                    onRowClick(row);
                  }
                : undefined
            }
          >
            {columns.map((column) => (
              <td key={column.key} data-align={column.align ?? "start"}>
                {column.cell(row)}
              </td>
            ))}
          </tr>
        ))}
      </tbody>
    </table>
  );
}

// `Object.assign` rather than a mutation, so the compound type is inferred rather than
// declared twice.
export const DataTable = Object.assign(DataTableRoot, { Skeleton: DataTableSkeleton });
