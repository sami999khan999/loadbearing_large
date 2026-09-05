import type { z } from "../import.js";
import { DocumentContract } from "./document.schema.js";

export type DocumentRecord = z.infer<typeof DocumentContract.document>;

// Constructed only through `from()`, so an unvalidated row cannot become one.
export class DocumentEntity {
  private constructor(private readonly record: DocumentRecord) {}

  // Throws on a malformed row, with a field path: the failure belongs at the boundary,
  // not in a template that renders `undefined`.
  public static from(raw: unknown): DocumentEntity {
    return new DocumentEntity(DocumentContract.document.parse(raw));
  }

  public get slug(): string {
    return this.record.slug;
  }

  public get title(): string {
    return this.record.title;
  }

  public get body(): string {
    return this.record.body;
  }

  public get updatedAt(): Date {
    return this.record.updatedAt;
  }
}
