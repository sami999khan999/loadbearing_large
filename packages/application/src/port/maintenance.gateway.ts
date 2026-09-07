export interface SweepOutcome {
  readonly sessions: number;
  readonly verifications: number;
  // Not housekeeping: `invitations_email_uq` is on `(organization_id, email)`, so an
  // expired row blocks re-inviting that address until something removes it.
  readonly invitations: number;
}

// Platform housekeeping, with no `Principal` on any method: nothing here belongs to a
// tenant. See docs/reference/ports.md.
export abstract class MaintenanceGateway {
  // Bounded by expiry rather than partitioned, which is the trade `sessions` documents
  // in its own schema comment. This sweep is what makes that trade hold.
  public abstract sweepExpired(now: Date): Promise<SweepOutcome>;

  // `months` counts partitions created, starting at the month `from` falls in — so three
  // is the current month and the next two, which is two months of runway.
  public abstract ensureActivityPartitions(from: Date, months: number): Promise<readonly string[]>;
}
