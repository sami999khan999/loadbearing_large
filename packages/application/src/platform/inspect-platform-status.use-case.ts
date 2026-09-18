import type { Authorizer, Principal } from "../primitive/index.js";
import type { PlatformOrganization, PlatformReader } from "./platform.reader.js";
import type { PlatformHealth, PlatformHealthReader } from "./platform-health.reader.js";

export interface PlatformStatus {
  readonly organization: PlatformOrganization;
  readonly health: PlatformHealth;
}

// The proof page. It reads nothing a tenant screen could not, and that is the point: it
// is here to show the tier resolves end to end before any policy depends on it.
export class InspectPlatformStatusUseCase {
  public constructor(
    private readonly authorizer: Authorizer,
    private readonly platform: PlatformReader,
    private readonly health: PlatformHealthReader,
  ) {}

  public async execute(actor: Principal): Promise<PlatformStatus> {
    // The key is platform-scoped, so this denies a tenant owner holding the wildcard —
    // which is the whole of decision D31 arriving at a call site.
    this.authorizer.assert(actor, "platform.status.read");

    const [organization, health] = await Promise.all([
      this.platform.organization(),
      this.health.report(),
    ]);

    return { organization, health };
  }
}
