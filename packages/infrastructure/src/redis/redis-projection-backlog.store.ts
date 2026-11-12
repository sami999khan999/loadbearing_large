import { type Logger, type OrganizationId, ProjectionBacklogStore, type Redis } from "../import.js";

// One sorted set, the tenant scored by its latest write in ms. In the cache instance: losing
// it costs the hourly sweep's delay, and the sweep is what finds a tenant whose mark went.
export class RedisProjectionBacklogStore extends ProjectionBacklogStore {
  private static readonly KEY = "analytics:backlog";

  // Compare and remove in one step, so a write marked between the read and the delete stays.
  private static readonly CLEAR = `local score = redis.call("ZSCORE", KEYS[1], ARGV[1])
if score and tonumber(score) <= tonumber(ARGV[2]) then redis.call("ZREM", KEYS[1], ARGV[1]) end
return 0`;

  public constructor(
    private readonly redis: Redis,
    private readonly logger: Logger,
  ) {
    super();
  }

  // `GT`: a later write moves the mark on and an earlier one never moves it back.
  public override async mark(organizationId: OrganizationId, at: Date): Promise<void> {
    try {
      await this.redis.zadd(RedisProjectionBacklogStore.KEY, "GT", at.getTime(), organizationId);
    } catch {
      this.logger.emit("analytics.backlog.unmarked", { organizationId });
    }
  }

  public override async pending(limit: number): Promise<readonly OrganizationId[]> {
    const members = await this.redis.zrange(RedisProjectionBacklogStore.KEY, 0, limit - 1);
    return members as OrganizationId[];
  }

  public override async clear(organizationId: OrganizationId, through: Date): Promise<void> {
    await this.redis.eval(
      RedisProjectionBacklogStore.CLEAR,
      1,
      RedisProjectionBacklogStore.KEY,
      organizationId,
      through.getTime(),
    );
  }
}
