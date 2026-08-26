import { z } from "../import.js";

// Shape 2: long-form editorial — a terms page, a help article, a release note. Doc 20
// names this file and its entity but specifies neither, so this is the minimum a
// database-backed `document()` would have to parse: an addressable slug, a title, a
// body, and when it last changed.
export class DocumentContract {
  private constructor() {}

  public static readonly document = z.object({
    // The URL segment. Lowercase, hyphenated, no slashes — a document is addressed, not
    // nested, because nesting is a routing decision and this is content.
    slug: z
      .string()
      .min(1)
      .regex(/^[a-z0-9]+(?:-[a-z0-9]+)*$/, "A slug is lowercase words joined by hyphens."),
    title: z.string().min(1),
    // Markdown, rendered by whoever displays it. Stored as text so an editor can change
    // it without a deploy, which is the entire reason this shape is separate from a
    // message key.
    body: z.string(),
    updatedAt: z.coerce.date(),
  });

  public static readonly collection = z.array(DocumentContract.document);
}
