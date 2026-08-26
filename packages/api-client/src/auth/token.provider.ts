// Where the token lives differs by host: the OS keychain reached through a Tauri
// command, a mobile keychain, an in-memory value in a test. None of those belong in
// this package — and all three are asynchronous, which is why `get()` is a promise.
export abstract class TokenProvider {
  public abstract get(): Promise<string | null>;

  // `set(null)` is the clear path. Two methods cover storing, reading and signing
  // out — a third would be one more thing for an implementation to get wrong (30).
  public abstract set(token: string | null): Promise<void>;
}
