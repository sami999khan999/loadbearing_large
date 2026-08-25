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
