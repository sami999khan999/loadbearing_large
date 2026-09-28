import type { WidgetMeta } from "../registry/index.js";

// Required and ungated: the nav is the last path to every capability, so hiding a card
// can never remove the only way in. See docs/reference/widget-registry.md.
export const coreWidgets = {
  "core.module-nav": { zone: "dashboard.main", permission: null, order: 10 },
} as const satisfies Record<string, WidgetMeta>;
