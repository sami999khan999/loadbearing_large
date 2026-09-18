// One prefix, one expiry. Narrower than what S3 can express on purpose: a rule this
// system writes is always "everything under this prefix, gone after N days".
export interface LifecycleRule {
  readonly prefix: string;
  readonly expireAfterDays: number;
}

// A second port rather than a method on `StorageGateway`: that one says "no bucket, no
// region, no endpoint", and a lifecycle rule is bucket-shaped policy.
export abstract class StoragePolicyGateway {
  // A bucket with no configuration reads as `[]`. `NoSuchLifecycleConfiguration` is the
  // empty case, not an error, and a caller that treated it as one would never converge.
  public abstract lifecycle(): Promise<readonly LifecycleRule[]>;

  // **Replaces the whole configuration.** S3 offers no per-rule write, which is why the
  // composer takes every row and why a failed call has to self-heal on the next run.
  public abstract applyLifecycle(rules: readonly LifecycleRule[]): Promise<void>;
}
