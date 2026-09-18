import { Identifiers, type OrganizationId } from "@loadbearing/contracts";
import { ForbiddenError } from "@loadbearing/errors";
import { CapabilitySet, type PermissionKey } from "@loadbearing/permissions";
import { describe, expect, it } from "vitest";
import { InspectPlatformStatusUseCase } from "../../src/platform/inspect-platform-status.use-case.js";
import type { PlatformOrganization, PlatformReader } from "../../src/platform/platform.reader.js";
import type {
  PlatformHealth,
  PlatformHealthReader,
} from "../../src/platform/platform-health.reader.js";
import { Authorizer } from "../../src/primitive/authorizer.js";
import { Principal } from "../../src/primitive/principal.js";

const TENANT = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-000000000010");
const TIER = Identifiers.organizationId.parse("018f8c00-0000-7000-8000-0000000000ff");
const ACTOR = Identifiers.userId.parse("018f8c00-0000-7000-8000-000000000011");

const HEALTH: PlatformHealth = {
  healthy: true,
  database: true,
  cache: true,
  queue: true,
  // The third state, and the one this page exists to show honestly.
  analytics: null,
  realtime: null,
};

class StubPlatformReader implements PlatformReader {
  public organizationId(): Promise<OrganizationId> {
    return Promise.resolve(TIER);
  }

  public organization(): Promise<PlatformOrganization> {
    return Promise.resolve({ id: TIER, slug: "loadbearing", name: "Loadbearing" });
  }
}

class StubHealthReader implements PlatformHealthReader {
  public report(): Promise<PlatformHealth> {
    return Promise.resolve(HEALTH);
  }
}

// The actor's *active* tenant is a customer one throughout: a platform admin switched
// into a customer tenant is still a platform admin, and that is the case worth pinning.
function actor(platform: readonly PermissionKey[]): Principal {
  return new Principal(
    TENANT,
    ACTOR,
    CapabilitySet.from({
      wildcard: false,
      org: { grants: [], denies: [] },
      goals: {},
      platform: { grants: platform, denies: [] },
    }),
  );
}

const useCase = () =>
  new InspectPlatformStatusUseCase(
    new Authorizer(),
    new StubPlatformReader(),
    new StubHealthReader(),
  );

describe("InspectPlatformStatusUseCase", () => {
  it("answers for a holder whose active tenant is a customer one", async () => {
    const status = await useCase().execute(actor(["platform.status.read"]));

    expect(status.organization.slug).toBe("loadbearing");
    expect(status.health).toEqual(HEALTH);
  });

  // Decision D31 arriving at a call site: `wildcard` is every tenant owner's, and if it
  // reached this key every owner of every customer tenant would be a platform admin.
  it("refuses a tenant owner holding the wildcard", async () => {
    const owner = new Principal(
      TENANT,
      ACTOR,
      CapabilitySet.from({ wildcard: true, org: { grants: [], denies: [] }, goals: {} }),
    );

    await expect(useCase().execute(owner)).rejects.toBeInstanceOf(ForbiddenError);
  });

  it("refuses a principal holding no platform key at all", async () => {
    await expect(useCase().execute(actor([]))).rejects.toBeInstanceOf(ForbiddenError);
  });
});
