import type { ReactNode } from "../import.js";

export interface FieldProps {
  readonly label: string;
  // Required, not optional: a label not tied to a control is decoration, and the input
  // is announced as unlabelled.
  readonly htmlFor: string;
  readonly hint?: string;
  readonly error?: string;
  readonly children: ReactNode;
}

export function Field({ label, htmlFor, hint, error, children }: FieldProps) {
  const hintId = hint ? `${htmlFor}-hint` : undefined;
  const errorId = error ? `${htmlFor}-error` : undefined;

  return (
    <div className="ui-field" data-invalid={error ? "true" : undefined}>
      <label className="ui-field__label" htmlFor={htmlFor}>
        {label}
      </label>
      {children}
      {hint ? (
        <p className="ui-field__hint" id={hintId}>
          {hint}
        </p>
      ) : null}
      {
        // `role="alert"` so the message is announced when it appears, not only when the
        // input is next focused.
      }
      {error ? (
        <p className="ui-field__error" id={errorId} role="alert">
          {error}
        </p>
      ) : null}
    </div>
  );
}
