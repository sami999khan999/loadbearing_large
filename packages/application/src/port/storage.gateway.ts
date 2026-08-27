export interface StoredObject {
  readonly key: string;
  readonly size: number;
  readonly contentType: string;
  readonly checksum: string;
}

// No bucket, no region, no endpoint — those are adapter configuration. Key layout is
// `<subject>/<yyyy>/<mm>/<uuid>.<ext>`, because lifecycle rules work on prefixes.
export abstract class StorageGateway {
  public abstract put(key: string, body: Uint8Array, contentType: string): Promise<StoredObject>;

  // The same write, for a body that must not be held in memory. An archived
  // `activity_log` partition is tens of gigabytes at the scale this system plans for,
  // so `put` cannot serve it — and buffering would fail only once the data is large
  // enough that failing is expensive. The checksum on `StoredObject` is computed over
  // the stream as it passes, which is what lets the archive be verified afterwards.
  public abstract putStream(
    key: string,
    body: AsyncIterable<Uint8Array>,
    contentType: string,
  ): Promise<StoredObject>;
  public abstract get(key: string): Promise<Uint8Array>;
  public abstract delete(key: string): Promise<void>;
  public abstract exists(key: string): Promise<boolean>;

  // In the port because "the browser uploads directly and the server never sees the
  // bytes" is an architectural choice: the use-case authorizes, then issues the URL.
  public abstract presignUpload(
    key: string,
    contentType: string,
    expiresInSeconds: number,
  ): Promise<string>;

  // Time-limited. Never a permanent public URL.
  public abstract presignDownload(key: string, expiresInSeconds: number): Promise<string>;
}
