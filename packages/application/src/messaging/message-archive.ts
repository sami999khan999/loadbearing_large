import type { Clock, OrganizationId } from "../import.js";
import type { PartitionArchiveGateway } from "../port/index.js";
import { PartitionedTable } from "../primitive/index.js";

// Which of a tenant's message months are only in cold storage (`26.4`). A held month was
// restored and is back in Postgres, so it is not one of them until its hold runs out.
export class MessageArchive {
  public constructor(
    private readonly archive: PartitionArchiveGateway,
    private readonly clock: Clock,
  ) {}

  // The first of each cold-only month, oldest first. One catalog read, outside any
  // transaction, as a read that crosses placements must be.
  public async coldMonths(organizationId: OrganizationId): Promise<readonly string[]> {
    const now = this.clock.now().getTime();
    const entries = await this.archive.monthsOf(PartitionedTable.MESSAGES, organizationId);
    return entries
      .filter((entry) => entry.heldUntil === null || entry.heldUntil.getTime() <= now)
      .map((entry) => entry.period);
  }

  // The newest cold month a conversation begun at `since` could have had messages in.
  public async archivedThrough(
    organizationId: OrganizationId,
    since: Date,
  ): Promise<string | null> {
    const months = await this.coldMonths(organizationId);
    const reached = months.filter((period) => MessageArchive.endOf(period) > since.getTime());
    return reached.at(-1) ?? null;
  }

  public async isArchived(organizationId: OrganizationId, at: Date): Promise<boolean> {
    const month = `${at.toISOString().slice(0, 7)}-01`;
    return (await this.coldMonths(organizationId)).includes(month);
  }

  private static endOf(period: string): number {
    const start = new Date(`${period}T00:00:00.000Z`);
    return Date.UTC(start.getUTCFullYear(), start.getUTCMonth() + 1, 1);
  }
}
