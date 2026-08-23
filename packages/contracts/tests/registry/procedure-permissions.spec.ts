import { isContractProcedure, oc } from "@orpc/contract";
import { describe, expect, it } from "vitest";
import { z } from "zod";
import { contract } from "../../src/procedure/index.js";
import { ProcedurePermissions } from "../../src/registry/procedure-permissions.js";

// Flattens a contract router to the dotted paths a procedure is reachable at.
// `isContractProcedure` is oRPC's own predicate — doc 10 walked the internal
// `~orpc` marker instead, which is the kind of thing that changes in a minor.
class ContractWalker {
  public static paths(node: unknown, prefix: readonly string[] = []): string[] {
    if (isContractProcedure(node)) return [prefix.join(".")];
    if (!node || typeof node !== "object") return [];
    return Object.entries(node).flatMap(([key, child]) =>
      ContractWalker.paths(child, [...prefix, key]),
    );
  }
}

// A stand-in for the first real slice. The kit ships no feature slices, so without
// this the two coverage tests below would pass over an empty contract and prove
// nothing about the walker that enforces them.
const fixture = {
  task: {
    list: oc
      .route({ method: "GET", path: "/goals/{goalId}/tasks" })
      .input(z.object({ goalId: z.uuid() }))
      .output(z.object({ items: z.array(z.string()) })),
    reactivate: oc
      .route({ method: "POST", path: "/tasks/{taskId}/reactivate" })
      .input(z.object({ taskId: z.uuid() }))
      .output(z.object({ ok: z.literal(true) })),
  },
};

describe("ContractWalker", () => {
  it("finds every procedure, at its dotted path", () => {
    expect(ContractWalker.paths(fixture).sort()).toEqual(["task.list", "task.reactivate"]);
  });

  it("recognises an oRPC procedure as a leaf, not as a record to descend into", () => {
    // The failure this guards: if the predicate stops matching, a procedure is
    // walked as a plain object and yields its internal keys as paths instead.
    expect(ContractWalker.paths(fixture.task.list, ["task", "list"])).toEqual(["task.list"]);
  });

  it("returns nothing for an empty router", () => {
    expect(ContractWalker.paths({})).toEqual([]);
  });
});

describe("ProcedurePermissions", () => {
  it("gates every procedure the contract router declares", () => {
    const declared = ContractWalker.paths(contract);
    const missing = declared.filter((path) => ProcedurePermissions.required(path) === undefined);
    expect(missing).toEqual([]);
  });

  it("has no entries for procedures that no longer exist", () => {
    const declared = new Set(ContractWalker.paths(contract));
    const orphans = ProcedurePermissions.paths().filter((path) => !declared.has(path));
    expect(orphans).toEqual([]);
  });

  it("answers undefined for an inherited key", () => {
    // A bare index would resolve these up the prototype chain and gate a procedure
    // on `Object.prototype.toString`.
    expect(ProcedurePermissions.required("toString")).toBeUndefined();
    expect(ProcedurePermissions.required("constructor")).toBeUndefined();
  });

  it("answers undefined for a path nobody declared", () => {
    expect(ProcedurePermissions.required("task.list")).toBeUndefined();
  });
});
