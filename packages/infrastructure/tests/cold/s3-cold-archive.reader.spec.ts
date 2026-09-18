import { createHash } from "node:crypto";
import { gzipSync } from "node:zlib";
import { PartitionedTable } from "@loadbearing/application";
import { describe, expect, it } from "vitest";
import type { OrganizationId, PartitionArchiveEntry, StorageGateway } from "../../src/import.js";
import { S3ColdArchiveReader } from "../../src/s3/s3-cold-archive.reader.js";

const ORG = "01a0b3de-1b12-75e1-9a19-2de75ed70bc0" as OrganizationId;

// Bytes in a Map, and **the real digest**: the whole point of the reader is that it
// verifies, so a fake whose checksum was a placeholder would test nothing.
class FakeStorage {
  private readonly objects = new Map<string, Uint8Array>();

  // Returns the digest rather than a `StoredObject`, because the digest is the only
  // part a caller here stages onto an entry — the shape would be noise.
  public stage(key: string, body: Uint8Array): string {
    this.objects.set(key, body);
    return createHash("sha256").update(body).digest("hex");
  }

  public get(key: string): Promise<Uint8Array> {
    const body = this.objects.get(key);
    if (!body) return Promise.reject(new Error(`no object: ${key}`));
    return Promise.resolve(body);
  }
}

const ndjson = (rows: readonly Readonly<Record<string, unknown>>[]): Uint8Array =>
  gzipSync(Buffer.from(`${rows.map((row) => JSON.stringify(row)).join("\n")}\n`, "utf8"));

const entry = (overrides: Partial<PartitionArchiveEntry> = {}): PartitionArchiveEntry => ({
  organizationId: ORG,
  tableName: PartitionedTable.ACTIVITY_LOG,
  period: "2032-05-01",
  objectKey: `cold/activity_log/2032/05/${ORG}.ndjson.gz`,
  rowCount: 2,
  bytes: 256,
  checksum: "",
  actionCounts: {},
  projectedAt: null,
  ...overrides,
});

const ROWS = [
  { id: "a", action: "task.created" },
  { id: "b", action: "task.archived" },
];

const readerFor = (storage: FakeStorage) =>
  new S3ColdArchiveReader(storage as unknown as StorageGateway);

describe("S3ColdArchiveReader", () => {
  it("gunzips the object and parses one row per line", async () => {
    const storage = new FakeStorage();
    const checksum = storage.stage(entry().objectKey, ndjson(ROWS));

    expect(await readerFor(storage).rows(entry({ checksum }))).toEqual(ROWS);
  });

  // The object survived its own upload check and rotted afterwards, which is exactly
  // what the index cannot tell you about — so the reader checks rather than trusts.
  it("refuses an object whose bytes do not match the recorded checksum", async () => {
    const storage = new FakeStorage();
    storage.stage(entry().objectKey, ndjson(ROWS));

    await expect(readerFor(storage).rows(entry({ checksum: "not-the-digest" }))).rejects.toThrow(
      "CONFLICT",
    );
  });

  // The other half of the same check. An object rewritten cleanly hashes correctly for
  // what it now holds; only the count says it is short.
  it("refuses an object with the wrong number of rows", async () => {
    const storage = new FakeStorage();
    const checksum = storage.stage(entry().objectKey, ndjson(ROWS.slice(0, 1)));

    await expect(readerFor(storage).rows(entry({ checksum }))).rejects.toThrow("CONFLICT");
  });

  // Refused before it is fetched: a 500 MB object read whole would take the worker
  // down, and the index records the size precisely so this can be answered first.
  it("refuses an object past the whole-object bound without fetching it", async () => {
    const storage = new FakeStorage();

    await expect(readerFor(storage).rows(entry({ bytes: 51 * 1024 * 1024 }))).rejects.toThrow(
      "CONFLICT",
    );
  });
});
