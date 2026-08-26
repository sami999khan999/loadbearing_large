import { StorageGateway, type StoredObject } from "../import.js";

interface StoredEntry {
  readonly body: Uint8Array;
  readonly contentType: string;
}

// Bytes in a Map. `presign*` returns a fake URL rather than throwing, because a
// use-case that issues one and returns it should be testable without S3.
export class InMemoryStorageGateway extends StorageGateway {
  private readonly objects = new Map<string, StoredEntry>();

  public override put(key: string, body: Uint8Array, contentType: string): Promise<StoredObject> {
    this.objects.set(key, { body, contentType });
    return Promise.resolve({
      key,
      size: body.byteLength,
      contentType,
      // Not a real digest. Deterministic and unique per key, which is all an
      // assertion needs — computing sha256 here would test the fake.
      checksum: `fake-${key}`,
    });
  }

  public override get(key: string): Promise<Uint8Array> {
    const entry = this.objects.get(key);
    if (!entry) return Promise.reject(new Error(`storage.object:${key}`));
    return Promise.resolve(entry.body);
  }

  public override delete(key: string): Promise<void> {
    this.objects.delete(key);
    return Promise.resolve();
  }

  public override exists(key: string): Promise<boolean> {
    return Promise.resolve(this.objects.has(key));
  }

  public override presignUpload(
    key: string,
    contentType: string,
    expiresInSeconds: number,
  ): Promise<string> {
    return Promise.resolve(
      `https://fake.storage/put/${key}?type=${encodeURIComponent(contentType)}&expires=${expiresInSeconds}`,
    );
  }

  public override presignDownload(key: string, expiresInSeconds: number): Promise<string> {
    return Promise.resolve(`https://fake.storage/get/${key}?expires=${expiresInSeconds}`);
  }

  public keys(): readonly string[] {
    return [...this.objects.keys()];
  }
}
