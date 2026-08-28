import type { auth } from "./en/auth.js";
import type { common } from "./en/common.js";
import type { email } from "./en/email.js";
import type { error } from "./en/error.js";
import type { nav } from "./en/nav.js";
import type { role } from "./en/role.js";

// Type-only. `verbatimModuleSyntax` erases the imports above, so the key union stays
// complete while the runtime data splits into one chunk per locale × namespace.
interface NamespaceShape {
  readonly common: typeof common;
  readonly nav: typeof nav;
  readonly auth: typeof auth;
  readonly role: typeof role;
  readonly error: typeof error;
  readonly email: typeof email;
}

// Always present, in every snapshot, from every ContentSource. Never lazy.
export type ShellNamespace = "common" | "error";
// Everything a browser or desktop bundle may load. Lazy: a route declares what it needs.
export type ClientNamespace = ShellNamespace | "nav" | "auth" | "role";
// Never reachable from a client catalog — only `SERVER_CATALOG` carries a loader for it.
export type ServerNamespace = "email";
export type Namespace = ClientNamespace | ServerNamespace;

export type NamespaceKeys = { [K in Namespace]: keyof NamespaceShape[K] & string };

// The complete closed union. A typo at a call site is a compile error.
export type MessageKey = NamespaceKeys[Namespace];

// Only the always-loaded keys, so `ERROR_COPY` cannot point at a lazy namespace.
export type ShellMessageKey = NamespaceKeys[ShellNamespace];

// One locale's copy for one namespace. Partial: translations arrive incrementally.
export type NamespaceBundle<N extends Namespace> = Partial<Record<NamespaceKeys[N], string>>;

// A flat slice across whatever namespaces are loaded.
export type MessageBundle = Partial<Record<MessageKey, string>>;

// What `t()` interpolates. `boolean` is here because `ErrorContext` allows it.
export type MessageParams = Readonly<Record<string, string | number | boolean>>;

export const SHELL_NAMESPACES: readonly ShellNamespace[] = ["common", "error"];
export const CLIENT_NAMESPACES: readonly ClientNamespace[] = [
  "common",
  "error",
  "nav",
  "auth",
  "role",
];
