import { describe, expect, it } from "vitest";
import { QueryKeys } from "../../src/key/query-key.js";

describe("QueryKeys", () => {
  it("mirrors the procedure path, parameters last", () => {
    expect(QueryKeys.rbac.roles()).toEqual(["rbac", "role", "list"]);
    expect(QueryKeys.rbac.effective("u1")).toEqual(["rbac", "effective", "u1"]);
  });

  // TanStack matches by prefix, so `all()` catching everything below it is the property
  // that makes a broad invalidation one call rather than a grep for `invalidateQueries`.
  it("makes all() a prefix of every key in its namespace", () => {
    const all = QueryKeys.rbac.all();
    const keys = [QueryKeys.rbac.roles(), QueryKeys.rbac.effective("u1")];

    for (const key of keys) {
      expect(key.slice(0, all.length)).toEqual([...all]);
    }
  });

  it("keys the session as a bare namespace", () => {
    expect(QueryKeys.session).toEqual(["session"]);
  });

  // Positional parameters shift every key when a filter is added later, which
  // invalidates the whole namespace on deploy. An object does not.
  it("puts parameters in an object rather than spreading them", () => {
    const key = QueryKeys.rbac.effective("u1");

    expect(key).toHaveLength(3);
    expect(typeof key[2]).toBe("string");
  });
});
