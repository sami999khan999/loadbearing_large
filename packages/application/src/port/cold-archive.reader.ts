import type { OrganizationId, UserId } from "../import.js";
import type { PartitionedTableName } from "../primitive/index.js";

// One row of `partition_archive`. Everything needed to fetch the object **and to prove
// it is the one the index names**, which is why `checksum` and `rowCount` ride along.
export interface PartitionArchiveEntry {
  readonly organizationId: OrganizationId;
  readonly tableName: PartitionedTableName;
  readonly period: string;
  readonly objectKey: string;
  readonly rowCount: number;
  readonly bytes: number;
  readonly checksum: string;
  readonly actionCounts: Readonly<Record<string, number>>;
  readonly projectedAt: Date | null;
}

// One page of one user's rows out of one archived object. The cursor is opaque here
// and a line ordinal inside the adapter, as `KeysetCursor`'s encoding is.
export interface ColdPage {
  readonly items: readonly Readonly<Record<string, unknown>>[];
  // Null is the last page, and it is not the same as an empty page: a full page can
  // still be the last one.
  readonly nextCursor: string | null;
}

// Through the worker rather than ClickHouse's `s3()` table function: the convention
// that lifts a subject out of a payload is one function, and SQL would be a second.
export abstract class ColdArchiveReader {
  // Whole-object, at the ~8 MB a tenant-month sits at. **Verified** against the
  // recorded checksum and count: an object that rotted later is what the index cannot see.
  public abstract rows(
    entry: PartitionArchiveEntry,
  ): Promise<readonly Readonly<Record<string, unknown>>[]>;

  // The same object, filtered to one user. The caller takes `userId` off the
  // principal, never the input: the object on disk holds the whole tenant.
  public abstract page(
    entry: PartitionArchiveEntry,
    userId: UserId,
    cursor: string | null,
    limit: number,
  ): Promise<ColdPage>;
}
