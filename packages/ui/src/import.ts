// Everything this package takes from outside itself, in one place. No relative
// re-exports live here — that is what keeps it cycle-free.
//
// Read it as the boundary this package is defined by. Two workspace entries, both
// type-only except the sprite URL, and no cache library, no router, no contracts.

// ── @loadbearing/asset ───────────────────────────────────────────────────────
export type { IconName } from "@loadbearing/asset";
export { default as spriteUrl } from "@loadbearing/asset/sprite.svg";

// ── @loadbearing/permissions ─────────────────────────────────────────────────
// Type-only, both of them. The `CapabilitySet` instance arrives as a prop, so
// `verbatimModuleSyntax` erases these and the emitted JavaScript imports nothing.
export type { CapabilitySet, PermissionKey } from "@loadbearing/permissions";

// ── react ────────────────────────────────────────────────────────────────────
export type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, Ref } from "react";
export { useMemo } from "react";

// ── uqr ──────────────────────────────────────────────────────────────────────
// The only runtime dependency in this package other than the sprite. Zero deps of its
// own, ESM, and it computes a module matrix rather than drawing — so `QrCode` renders
// during SSR like everything else here.
export { encode } from "uqr";
