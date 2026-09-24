import type { Container } from "../import.js";
import { SystemPrincipal } from "./system-principal.js";

// The worker's half of `shardMiddleware`: a job that names a tenant is placed before
// its use-case runs. A platform consumer walks every tenant and places nothing.
// ──
// `recheck`, because a job can still be opening transactions after a move's settle.
export const withShard = async <T>(
  container: Container,
  organizationId: string,
  work: () => Promise<T>,
): Promise<T> =>
  container.placed(SystemPrincipal.forOrganization(organizationId), work, { recheck: true });
