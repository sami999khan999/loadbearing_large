import {
  Buffer,
  ColdArchiveReader,
  ConflictError,
  createGunzip,
  createHash,
  type PartitionArchiveEntry,
  pipeline,
  Readable,
  type StorageGateway,
} from "../import.js";

// The bound `21.1` states, with headroom. Past it the object is refused rather than
// read into memory: "it was slow" is a worse failure than "it said no".
const MAX_BYTES = 50 * 1024 * 1024;

// NDJSON is newline-delimited by definition, so the separator is data rather than
// formatting.
const NEWLINE = "\n";

export class S3ColdArchiveReader extends ColdArchiveReader {
  public constructor(private readonly storage: StorageGateway) {
    super();
  }

  public async rows(
    entry: PartitionArchiveEntry,
  ): Promise<readonly Readonly<Record<string, unknown>>[]> {
    if (entry.bytes > MAX_BYTES) {
      throw new ConflictError("cold", "too-large");
    }

    const body = await this.storage.get(entry.objectKey);

    // **Against the compressed bytes**, because that is what the gateway hashed on the
    // way up: `StoredObject.checksum` is computed over the stream as it passes.
    const digest = createHash("sha256").update(body).digest("hex");
    if (digest !== entry.checksum) throw new ConflictError("cold", "checksum");

    const lines = (await S3ColdArchiveReader.gunzip(body))
      .toString("utf8")
      .split(NEWLINE)
      .filter((line) => line.length > 0);

    // The second half of the same check. A truncated object can hash differently *and*
    // be short; one that was rewritten cleanly is short and nothing else would notice.
    if (lines.length !== entry.rowCount) throw new ConflictError("cold", "row-count");

    return lines.map((line) => JSON.parse(line) as Readonly<Record<string, unknown>>);
  }

  private static async gunzip(body: Uint8Array): Promise<Buffer> {
    const chunks: Uint8Array[] = [];
    const out = createGunzip();
    out.on("data", (chunk: Uint8Array) => chunks.push(chunk));
    await pipeline(Readable.from([body]), out);
    return Buffer.concat(chunks);
  }
}
