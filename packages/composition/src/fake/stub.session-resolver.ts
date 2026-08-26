import { type RequestHeaders, type ResolvedSession, SessionResolver } from "../import.js";

// Resolves to whatever it was handed, `null` by default. A use-case test never reaches
// this — it builds a `Principal` directly — which is exactly why the fake is one line:
// it exists so the port has a double, not because anything asserts on it.
export class StubSessionResolver extends SessionResolver {
  public constructor(private readonly session: ResolvedSession | null = null) {
    super();
  }

  public override resolve(_headers: RequestHeaders): Promise<ResolvedSession | null> {
    return Promise.resolve(this.session);
  }
}
