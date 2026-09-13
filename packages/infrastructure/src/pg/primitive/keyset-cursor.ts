import { ValidationError } from "../../import.js";

// `<iso>|<uuid>`, base64url. Opaque to the client on purpose: it echoes back what it was
// given, which is what leaves the encoding ours to change without a version field.
export class KeysetCursor {
  private constructor() {}

  public static encode(at: Date, id: string): string {
    return Buffer.from(`${at.toISOString()}|${id}`, "utf8").toString("base64url");
  }

  // A malformed cursor is a `ValidationError`, never a silent first page: a client that
  // reset to the top on every corrupt token would loop through the same rows forever.
  public static decode(cursor: string): { readonly at: Date; readonly id: string } {
    const [iso, id, ...rest] = Buffer.from(cursor, "base64url").toString("utf8").split("|");

    if (!iso || !id || rest.length > 0) throw KeysetCursor.malformed();

    const at = new Date(iso);
    if (Number.isNaN(at.getTime())) throw KeysetCursor.malformed();

    return { at, id };
  }

  private static malformed(): ValidationError {
    return new ValidationError([{ field: "cursor", rule: "invalid" }]);
  }
}
