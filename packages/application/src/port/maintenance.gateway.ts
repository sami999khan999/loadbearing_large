export interface SweepOutcome {
  readonly sessions: number;
  readonly verifications: number;
}

// Platform housekeeping, with no `Principal` on any method: nothing here belongs to a
// tenant. See docs/reference/ports.md.
export abstract class MaintenanceGateway {
  // Bounded by expiry rather than partitioned, which is the trade `sessions` documents
  // in its own schema comment. This sweep is what makes that trade hold.
  public abstract sweepExpired(now: Date): Promise<SweepOutcome>;

  // Several months ahead on purpose: a partitioned table with no partition for today
  // rejects every insert, so one month of runway is an outage at midnight on the first.
  public abstract ensureActivityPartitions(
    from: Date,
    monthsAhead: number,
  ): Promise<readonly string[]>;
}
