import { z } from "~/import.js";

// Validated so the sign-in page cannot become an open redirect: `//evil.test` has a host
// once a browser resolves it, so a single leading slash is the only safe shape.
export class RedirectSearch {
  private constructor() {}

  public static readonly schema = z.object({
    redirect: z
      .string()
      .regex(/^\/(?!\/)/)
      .optional(),
  });

  public static target(search: { readonly redirect?: string | undefined }): string {
    return search.redirect ?? "/";
  }
}
