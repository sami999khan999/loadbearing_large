export class ServerOnly {
  private constructor() {}

  public static assert(packageName: string): void {
    if (typeof (globalThis as { window?: unknown }).window !== "undefined") {
      throw new Error(
        `${packageName} was imported into a client bundle. This is a leak, not a bundle-size problem — ` +
          `it means database or credential code is reachable from the browser.`,
      );
    }
  }
}
