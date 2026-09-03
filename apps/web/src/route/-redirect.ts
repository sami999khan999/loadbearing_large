import { z } from "~/import.js";

// Where a page sends someone after they sign in. Validated so the sign-in page cannot
// be turned into an open redirect: `//evil.test` is a URL with a host once a browser
// resolves it, and an absolute URL is one by construction. A rooted path with a single
// leading slash is the only shape that stays on this origin.
//
// The leading hyphen keeps this file out of the route tree.
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
