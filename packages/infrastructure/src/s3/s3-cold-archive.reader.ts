import {
  ColdArchiveReader,
  type ColdPage,
  ConflictError,
  createHash,
  type PartitionArchiveEntry,
  type StorageGateway,
  type UserId,
} from "../import.js";
import { NdjsonLines } from "./ndjson-lines.js";
import { OrdinalCursor } from "./ordinal-cursor.js";

// The bound `21.1` states, with headroom. Past it the object is refused rather than
// read into memory: "it was slow" is a worse failure than "it said no".
const MAX_BYTES = 50 * 1024 * 1024;

// Rows parsed per step of that whole read. Any size works; it only bounds one push.
const MAX_BATCH = 5_000;

export class S3ColdArchiveReader extends ColdArchiveReader {
  public constructor(private readonly storage: StorageGateway) {
    super();
  }

  // Two passes over the object: the first proves it, the second parses it. One pass would
  // hand out rows from an object found to be corrupt only at its end.
  public async *batches(
    entry: PartitionArchiveEntry,
    size: number,
  ): AsyncGenerator<readonly Readonly<Record<string, unknown>>[]> {
    await this.verify(entry);

    let batch: Readonly<Record<string, unknown>>[] = [];
    for await (const line of NdjsonLines.of(this.storage.getStream(entry.objectKey))) {
      batch.push(JSON.parse(line) as Readonly<Record<string, unknown>>);
      if (batch.length < size) continue;
      yield batch;
      batch = [];
    }
    if (batch.length > 0) yield batch;
  }

  // **Against the compressed bytes**, because that is what the gateway hashed on the way
  // up. The count is the other half: a clean rewrite that is short hashes as itself.
  private async verify(entry: PartitionArchiveEntry): Promise<void> {
    const hash = createHash("sha256");
    let count = 0;
    for await (const _ of NdjsonLines.of(this.storage.getStream(entry.objectKey), hash)) {
      count += 1;
    }

    if (hash.digest("hex") !== entry.checksum) throw new ConflictError("cold", "checksum");
    if (count !== entry.rowCount) throw new ConflictError("cold", "row-count");
  }

  // Whole, and capped: the request path's read, one user's slice of a tenant-month.
  private async rows(
    entry: PartitionArchiveEntry,
  ): Promise<readonly Readonly<Record<string, unknown>>[]> {
    if (entry.bytes > MAX_BYTES) {
      throw new ConflictError("cold", "too-large");
    }

    const rows: Readonly<Record<string, unknown>>[] = [];
    for await (const batch of this.batches(entry, MAX_BATCH)) rows.push(...batch);
    return rows;
  }

  // Reads and gunzips the **whole** tenant-month to serve one user's slice, because the
  // cursor is an ordinal inside it. The cost is stated in the plan's `21.1`.
  public async page(
    entry: PartitionArchiveEntry,
    userId: UserId,
    cursor: string | null,
    limit: number,
  ): Promise<ColdPage> {
    const from = OrdinalCursor.decode(cursor) ?? 0;
    const mine = (await this.rows(entry)).filter((row) => row.user_id === userId);

    const items = mine.slice(from, from + limit);
    const next = from + items.length;

    return { items, nextCursor: next < mine.length ? OrdinalCursor.encode(next) : null };
  }
}
