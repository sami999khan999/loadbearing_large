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
  public report(): Promise<PlatformHealth> {
    return this.container.health();
  }
}
