export class ServerOnly {
  private constructor() {}

  /** Call at the top of every server-only package barrel. */
  public static assert(packageName: string): void {
    // `library.json` sets lib: ["ES2024"] with no DOM, so a bare `window` is an
    // unresolved identifier (TS2304) even behind `typeof`. Reaching it as an
    // optional property of `globalThis` is the same runtime check, expressed in
    // a way a package that has never heard of a browser can compile.
    if (typeof (globalThis as { window?: unknown }).window !== "undefined") {
      throw new Error(
        `${packageName} was imported into a client bundle. This is a leak, not a bundle-size problem — ` +
          `it means database or credential code is reachable from the browser.`,
      );
    }
  }
}
