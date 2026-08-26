// `lib.dom`'s `RequestCredentials`, restated. This package deliberately does not load
// the DOM lib — it has to typecheck in a plain Node script too — and the union is
// three strings that have not changed since fetch shipped.
export type RequestCredentials = "omit" | "same-origin" | "include";

// How a request proves who is making it. Web sends a cookie, desktop sends a bearer
// token, and this seam is the entire difference between the two clients.
export abstract class AuthStrategy {
  public abstract headers(): Promise<Record<string, string>>;

  public abstract get credentials(): RequestCredentials;
}
