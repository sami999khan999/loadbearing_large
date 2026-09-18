import type { OrganizationId } from "../import.js";
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

// Through the worker rather than ClickHouse's `s3()` table function: the convention
// that lifts a subject out of a payload is one function, and SQL would be a second.
export abstract class ColdArchiveReader {
  // Whole-object, at the ~8 MB a tenant-month sits at. **Verified** against the
  // recorded checksum and count: an object that rotted later is what the index cannot see.
  public abstract rows(
    entry: PartitionArchiveEntry,
  ): Promise<readonly Readonly<Record<string, unknown>>[]>;
}
