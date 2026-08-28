import { z } from "../import.js";

// Decide the list shape once here, and every list procedure inherits it. The
// alternative is a special case per feature in `query` and a different empty state
// per feature in the UI.
export class Envelope {
  private constructor() {}

  public static paginated<T extends z.ZodType>(item: T) {
    return z.object({
      // `.readonly()` so the inferred type is `readonly T[]`, which is what every port
      // and use-case in `application` already returns. Without it every handler in the
      // transport layer has to copy the array to widen it, once per procedure, forever.
      items: z.array(item).readonly(),
      total: z.number().int().nonnegative(),
      limit: z.number().int().positive(),
      offset: z.number().int().nonnegative(),
    });
  }

  public static readonly acknowledged = z.object({
    ok: z.literal(true),
  });
}
