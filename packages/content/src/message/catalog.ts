import type { Locale } from "../primitive/index.js";
import type { ClientNamespace, MessageBundle, Namespace } from "./namespace.js";

export type BundleLoader = () => Promise<MessageBundle>;

// The parameter type. A catalog need not cover every namespace — a client one omits `email`.
export type MessageCatalog = Readonly<Record<Locale, Partial<Record<Namespace, BundleLoader>>>>;

// Total over Locale × ClientNamespace, annotated with the precise type rather than
// `MessageCatalog` — widening it gives up exactly that check.
//
// Every `import()` specifier is a string literal. A computed one makes the bundler
// give up on static analysis and inline every match into the parent chunk.
export const CLIENT_CATALOG: Readonly<
  Record<Locale, Readonly<Record<ClientNamespace, BundleLoader>>>
> = {
  en: {
    common: async () => (await import("./en/common.js")).common,
    error: async () => (await import("./en/error.js")).error,
  },
  bn: {
    common: async () => (await import("./bn/common.js")).common,
    error: async () => (await import("./bn/error.js")).error,
  },
};
