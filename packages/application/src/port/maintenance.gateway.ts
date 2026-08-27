export interface SweepOutcome {
  readonly sessions: number;
  readonly verifications: number;
}

// Platform housekeeping, and the one port with no `Principal` on any method.
//
// That is not an oversight and not a hole in the authorization story. Every other port
// reads or writes a tenant's rows, so `Authorizer.assert()` inside a use-case is the
// gate. Nothing here belongs to a tenant: an expired session is expired for everybody,
// and a partition is a property of a table rather than of an organization. There is no
// organization that could be asked to authorize either, which is exactly why
// `SystemPrincipal.forOrganization` cannot express this work.
//
// The guard is instead that nothing reachable from a request can call it — it is wired
// for the worker and invoked only from a schedule.
export abstract class MaintenanceGateway {
  // Bounded by expiry rather than partitioned, which is the trade `sessions` documents
  // in its own schema comment. This sweep is what makes that trade hold.
  public abstract sweepExpired(now: Date): Promise<SweepOutcome>;

  // Returns the partitions it created, empty when they all already existed. Runs
  // several months ahead on purpose: a partitioned table with no partition for the
  // current date rejects every insert, so the failure mode of running exactly one
  // month ahead is a total write outage at midnight on the first.
  public abstract ensureActivityPartitions(
    from: Date,
    monthsAhead: number,
  ): Promise<readonly string[]>;
}
