import { PermissionRegistry } from "@loadbearing/permissions";
import { describe, expect, it } from "vitest";
import { SystemPrincipal } from "../src/system-principal.js";

const ORG = "018f8c00-0000-7000-8000-000000000010";

describe("SystemPrincipal", () => {
  it("carries the organization it was asked for", () => {
    // There is no global system principal, because there is no global data — a job that
    // processes rows must know whose rows.
    expect(SystemPrincipal.forOrganization(ORG).organizationId).toBe(ORG);
  });

  it("acts as a system principal under a reserved actor id", () => {
    const principal = SystemPrincipal.forOrganization(ORG);

    expect(principal.kind).toBe("system");
    // Not the organization's own id: an actor column holding a tenant id reads as a user
    // to everyone who later queries the audit trail.
    expect(principal.userId).toBe(SystemPrincipal.USER_ID);
    expect(principal.userId).not.toBe(ORG);
  });

  it("holds exactly the three named grants and nothing else", () => {
    const principal = SystemPrincipal.forOrganization(ORG);

    expect(principal.can("ai.embedding.write")).toBe(true);
    expect(principal.can("ai.embedding.read")).toBe(true);
    expect(principal.can("core.activity.write")).toBe(true);

    // Never `PermissionRegistry.instance.all()`. A job that can do anything eventually
    // does something it should not, and this is the assertion that keeps the list narrow
    // as the catalog grows.
    const ungranted = PermissionRegistry.instance
      .all()
      .filter(
        (key) => !["ai.embedding.write", "ai.embedding.read", "core.activity.write"].includes(key),
      );

    expect(ungranted.length).toBeGreaterThan(0);
    for (const key of ungranted) expect(principal.can(key)).toBe(false);
  });

  it("is not a wildcard", () => {
    expect(SystemPrincipal.forOrganization(ORG).capabilities.toJSON().wildcard).toBe(false);
  });
});
