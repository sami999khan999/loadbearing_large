import type { CapabilitySet, FlagKey, WidgetFacts } from "../import.js";

// No preference can hide anything yet: the rows arrive with the zone's route in Phase 9, and
// an inline widget is required, so it never reads them at all.
const NO_PREFERENCES: ReadonlySet<string> = new Set<string>();

// The facts a render or a loader has in hand, in the shape `visibilityOf` reads. One place,
// so the header's bell and its loader's prefetch cannot answer differently.
export function widgetFacts(
  capabilities: CapabilitySet,
  flags: Iterable<FlagKey>,
  goalId?: string,
): WidgetFacts {
  return {
    capabilities,
    flags: new Set(flags),
    hiddenByAdmin: NO_PREFERENCES,
    hiddenByUser: NO_PREFERENCES,
    ...(goalId === undefined ? {} : { goalId }),
  };
}
