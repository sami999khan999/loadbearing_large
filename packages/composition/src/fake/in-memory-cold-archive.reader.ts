import { ColdArchiveReader, ConflictError, type PartitionArchiveEntry } from "../import.js";

// Rows staged by object key, checking the **row count** and not the checksum: the
// in-memory gateway's checksum is `fake-<key>`, so verifying it would test the fake.
export class InMemoryColdArchiveReader extends ColdArchiveReader {
  private readonly objects = new Map<string, readonly Readonly<Record<string, unknown>>[]>();

  public stage(objectKey: string, rows: readonly Readonly<Record<string, unknown>>[]): void {
    this.objects.set(objectKey, rows);
  }

  public override rows(
    entry: PartitionArchiveEntry,
  ): Promise<readonly Readonly<Record<string, unknown>>[]> {
    const rows = this.objects.get(entry.objectKey);
    if (!rows) return Promise.reject(new ConflictError("cold", "missing"));
    if (rows.length !== entry.rowCount) {
      return Promise.reject(new ConflictError("cold", "row-count"));
    }

    return Promise.resolve(rows);
  }
}
