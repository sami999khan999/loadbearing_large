import { z } from "../import.js";

// Shape 2: long-form editorial. The minimum a database-backed `document()` has to
// parse — an addressable slug, a title, a body, and when it last changed.
export class DocumentContract {
  private constructor() {}

  public static readonly document = z.object({
    // No slashes: a document is addressed, not nested, because nesting is a routing
    // decision and this is content.
    slug: z
      .string()
      .min(1)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "A slug is lowercase words joined by hyphens."),
    title: z.string().min(1),
    // Text, so an editor can change it without a deploy — which is why this shape is
    // separate from a message key.
    body: z.string(),
    updatedAt: z.coerce.date(),
  });

  public static readonly collection = z.array(DocumentContract.document);
}
