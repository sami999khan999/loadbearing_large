import type { ReactNode } from "../../import.js";

export interface ZoneItem {
  // React's key, and nothing else: the zone never reads it, so any stable id will do.
  readonly key: string;
  readonly title: string;
  readonly content: ReactNode;
  readonly action?: ReactNode;
}

export interface ZoneProps {
  // Names the region for a screen reader. A zone has no visible heading of its own.
  readonly label: string;
  readonly items: readonly ZoneItem[];
  readonly empty?: ReactNode;
}

// A place a page puts units side by side, and nothing more: no registry, no session, no
// permission. `items`, not children, so nothing can be dropped in beside the units unwrapped.
export function Zone({ label, items, empty }: ZoneProps) {
  if (items.length === 0) {
    return empty ? (
      <section className="ui-zone ui-zone--empty block" aria-label={label}>
        {empty}
      </section>
    ) : null;
  }

  return (
    // As many columns as fit; `min(100%, …)` keeps one column from overflowing a phone.
    <section
      className="ui-zone grid grid-cols-[repeat(auto-fill,minmax(min(100%,18rem),1fr))] gap-4"
      aria-label={label}
    >
      {items.map((item) => (
        // Block, not a flex column: a column stretched an inline badge to the whole card.
        <article
          key={item.key}
          className="ui-zone__item block min-w-0 rounded-lg border border-border bg-surface p-5 text-fg"
        >
          <header className="ui-zone__header mb-3 flex items-center justify-between gap-2">
            <h2 className="ui-zone__title m-0 font-semibold text-base text-fg">{item.title}</h2>
            {item.action ? <div className="ui-zone__action shrink-0">{item.action}</div> : null}
          </header>
          {item.content}
        </article>
      ))}
    </section>
  );
}
