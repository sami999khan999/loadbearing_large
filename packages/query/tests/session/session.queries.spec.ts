import type { AuthClient } from "@loadbearing/api-client";
import { describe, expect, it, vi } from "vitest";
import { QueryKeys } from "../../src/key/query-key.js";
import { SessionQueries } from "../../src/session/session.queries.js";

const authWith = (session: unknown): AuthClient =>
  ({ session: vi.fn().mockResolvedValue(session) }) as unknown as AuthClient;

describe("SessionQueries.current", () => {
  it("is a plain options object, so a loader can prefetch the same definition", () => {
    // `queryOptions` rather than a useQuery wrapper: a route loader calls
    // `ensureQueryData(...)` and the component calls `useQuery(...)` on the same object,
    // which is what guarantees the cache hit.
    const options = SessionQueries.current(authWith(null));

    expect(options.queryKey).toEqual(QueryKeys.session);
    expect(typeof options.queryFn).toBe("function");
  });

  it("reads through the auth client", async () => {
    const auth = authWith({ user: { id: "u1" } });
    const options = SessionQueries.current(auth);

    // biome-ignore lint/suspicious/noExplicitAny: queryFn's context is irrelevant here.
    await expect((options.queryFn as any)()).resolves.toEqual({ user: { id: "u1" } });
  });

  it("never retries", () => {
    // A signed-out user is an answer, not a failure to retry.
    expect(SessionQueries.current(authWith(null)).retry).toBe(false);
  });

  it("holds the session for a minute", () => {
    expect(SessionQueries.current(authWith(null)).staleTime).toBe(60_000);
  });
});
