import type { ReactNode } from "../import.js";

// The tones a status can take, named after what they mean rather than what colour they
// are — `danger`, not `red`. A theme that maps danger to something other than red then
// changes one custom property instead of every call site.
export type BadgeTone = "neutral" | "accent" | "success" | "warning" | "danger";

export interface StatusBadgeProps {
  readonly tone?: BadgeTone;
  readonly children: ReactNode;
  readonly className?: string;
}

// No status vocabulary of its own: a caller maps its own state to a tone. That is what
// keeps this component here and its domain-named wrapper in `feature`.
export function StatusBadge({ tone = "neutral", children, className }: StatusBadgeProps) {
  return (
    <span
      className={["ui-status-badge", `ui-status-badge--${tone}`, className]
        .filter(Boolean)
        .join(" ")}
    >
      {children}
    </span>
  );
}
