import { z } from "../../import.js";

// Shape 3: a repeating record an editor owns. Zod parses it at module load, so a
// malformed entry is a startup error with a field path rather than `undefined.map is
// not a function` in production — and the same schema is the validation boundary the
// day these rows come from a database instead of a file.
export class NavContract {
  private constructor() {}

  public static readonly item = z.object({
    // A `ModuleKey`, and never the thing that gates it: `ModuleRegistry` owns that
    // mapping, and a content edit able to change it would be a privilege escalation.
    // `nav.data.ts` pins the narrow type at authoring time; this stays `string` because
    // a CMS row arrives unvalidated.
    module: z.string(),
    labelKey: z.string(),
    icon: z.string(),
    order: z.number().int(),
  });

  public static readonly collection = z.array(NavContract.item);
}

export type NavItem = z.infer<typeof NavContract.item>;
