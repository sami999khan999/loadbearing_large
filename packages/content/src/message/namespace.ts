import type { common } from "./en/common.js";
import type { error } from "./en/error.js";

// Type-only. `verbatimModuleSyntax` erases the imports above, so the key union stays
// complete while the runtime data splits into one chunk per locale × namespace.
// Partial today: `nav`, `auth` and the server-only `email` join at their own steps.
interface NamespaceShape {
  readonly common: typeof common;
  readonly error: typeof error;
}

// Always present, in every snapshot, from every ContentSource. Never lazy.
export type ShellNamespace = "common" | "error";
// Everything a browser or desktop bundle may load. Gains `nav` and `auth` later.
export type ClientNamespace = ShellNamespace;
// Gains the server-only `email` namespace when the worker's digests land.
export type Namespace = ClientNamespace;

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
export const CLIENT_NAMESPACES: readonly ClientNamespace[] = ["common", "error"];
