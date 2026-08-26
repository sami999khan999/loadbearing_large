import type { ButtonHTMLAttributes, ReactNode, Ref } from "../import.js";

export type ButtonVariant = "primary" | "secondary" | "ghost" | "danger";

export interface ButtonProps extends ButtonHTMLAttributes<HTMLButtonElement> {
  readonly variant?: ButtonVariant;
  readonly ref?: Ref<HTMLButtonElement>;
  readonly children: ReactNode;
}

// `type` is required by the DOM spec's default being wrong: an unset `type` inside a
// form is `submit`, so every icon button in a form submits it. Defaulted here rather
// than remembered at each call site.
export function Button({ variant = "primary", type = "button", className, ...rest }: ButtonProps) {
  return (
    <button
      type={type}
      className={["ui-button", `ui-button--${variant}`, className].filter(Boolean).join(" ")}
      {...rest}
    />
  );
}
