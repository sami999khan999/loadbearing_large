import { z } from "../import.js";

// Decide the list shape once here, and every list procedure inherits it. The
// alternative is a special case per feature in `query` and a different empty state
// per feature in the UI.
export class Envelope {
  private constructor() {}

  public static paginated<T extends z.ZodType>(item: T) {
    return z.object({
      items: z.array(item),
      total: z.number().int().nonnegative(),
      limit: z.number().int().positive(),
      offset: z.number().int().nonnegative(),
    });
  }

  public static readonly acknowledged = z.object({
    ok: z.literal(true),
  });
}
