import { type PlatformHealth, PlatformHealthReader } from "../import.js";
import type { Container } from "./container.js";

// The container already answers this for the liveness probe; the platform screen asks
// the same question through a port, because `application` may not name this package.
export class ContainerHealthReader extends PlatformHealthReader {
  public constructor(private readonly container: Container) {
    super();
  }

  // `HealthReport` carries `pool` too, and this narrows it away: a screen that showed a
  // pool gauge would be reading one process's, which is not the deployment's.
  public async report(): Promise<PlatformHealth> {
    const { database, pool: _pool, ...rest } = await this.container.health();

    // Every node folded into one boolean. Which node is down is an operator's question
    // and the readiness endpoint answers it; the platform screen asks whether to worry.
    return { ...rest, database: Object.values(database).every(Boolean) };
  }
}
