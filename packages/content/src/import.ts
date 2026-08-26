// Everything this package takes from outside itself, in one place. No relative
// re-exports live here — that is what keeps it cycle-free.

// ── @loadbearing/asset ────────────────────────────────────────────────
// Type-only for the key union, plus the manifest `StaticMediaResolver` reads. Content
// records hold `"brand.logo"`, never a path, which is what makes a CDN one resolver.
export { type IconName, type ImageKey, ImageManifest } from "@loadbearing/asset";

// ── @loadbearing/errors ───────────────────────────────────────────────
export type { ErrorCode, ErrorEnvelope, FieldViolation } from "@loadbearing/errors";

// ── @loadbearing/permissions ──────────────────────────────────────────
// `ModuleKey` and nothing else. Content references the security surface; it never
// defines it — the two symbols that would let it are banned in ESLint (20.6), and the
// gate greps this tree for their names, so do not write them here either.
export type { ModuleKey } from "@loadbearing/permissions";

// ── zod ───────────────────────────────────────────────────────────────
export { z } from "zod";
