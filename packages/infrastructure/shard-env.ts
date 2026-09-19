// The physical nodes, in index order, for the scripts above `src/`. A second reader of
// `DATABASE_SHARD_<n>_URL` beside each app's `env.ts`, and deliberately so: a script is
// the one category allowed to read the environment directly, and importing an app's
// `Env` from here would make `pnpm db:migrate` parse the web app's whole schema.

export interface ShardUrls {
  readonly url: string;
  readonly directUrl: string;
}

// Node 0 is `DATABASE_URL`, and every node after it is `DATABASE_SHARD_<n>_URL` with an
// optional `_DIRECT_URL` beside it. Absent is one node, which is every deployment
// until the split.
export const shardUrls = (): readonly ShardUrls[] => {
  const url = process.env.DATABASE_URL;
  if (!url) throw new Error("DATABASE_URL is required.");

  const nodes: ShardUrls[] = [{ url, directUrl: process.env.DATABASE_DIRECT_URL ?? url }];

  // Contiguity-checked, the same rule each app's `env.ts` applies: the cluster indexes
  // this array, so a gap puts node 3 at index 2 and every tenant on it in the wrong
  // database.
  for (let index = 1; ; index += 1) {
    const shard = process.env[`DATABASE_SHARD_${index}_URL`];
    if (!shard) break;

    nodes.push({
      url: shard,
      directUrl: process.env[`DATABASE_SHARD_${index}_DIRECT_URL`] ?? shard,
    });
  }

  const orphan = Object.keys(process.env)
    .map((name) => /^DATABASE_SHARD_(\d+)_URL$/.exec(name)?.[1])
    .filter((index): index is string => index !== undefined)
    .map(Number)
    .find((index) => index >= nodes.length);

  if (orphan !== undefined) {
    throw new Error(`DATABASE_SHARD_${orphan}_URL has no shard ${nodes.length} before it.`);
  }

  return nodes;
};
