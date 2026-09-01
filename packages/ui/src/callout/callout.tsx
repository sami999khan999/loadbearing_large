import type { ReactNode } from "../import.js";

// Named after what they mean rather than what colour they are, exactly as `BadgeTone`
// is — a theme that maps danger to something other than red changes one custom
// property rather than every call site.
export type CalloutTone = "info" | "success" | "warning" | "danger";

export interface CalloutProps {
  readonly tone?: CalloutTone;
  readonly title?: string;
  readonly children: ReactNode;
  readonly className?: string;
}

// The block every "we sent you a link", "that code was wrong" and "save these codes"
// state in the auth flows renders through, so those messages look like one system
// rather than eleven ad-hoc paragraphs.
export function Callout({ tone = "info", title, children, className }: CalloutProps) {
  return (
    <div
      className={["ui-callout", `ui-callout--${tone}`, className].filter(Boolean).join(" ")}
      // Announced when it appears rather than when something is next focused, which is
      // the whole point of a message that replaces a form the user just submitted.
      // `status` and not `alert` for the calm tones: an assertive live region
      // interrupts whatever a screen reader is currently saying.
      role={tone === "danger" ? "alert" : "status"}
    >
      {title ? <p className="ui-callout__title">{title}</p> : null}
      <div className="ui-callout__body">{children}</div>
    </div>
  );
}
