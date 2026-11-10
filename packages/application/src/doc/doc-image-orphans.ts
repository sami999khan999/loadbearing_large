import type { DocSpaceId, OrganizationId } from "../import.js";
import type { ColdArchiveReader, PartitionArchiveGateway, StorageGateway } from "../port/index.js";
import { PartitionedTable } from "../primitive/index.js";
import { DocImageKey } from "./doc-image-key.js";
import type { DocPageRepository } from "./doc-page.repository.js";

// Deletes the images of one space that no text links any more. A page's delete leaves its
// images because another page may link them; this is the pass that decides, later.
export class DocImageOrphans {
  // An upload is signed before the text that links it is saved. Younger than this, an
  // image may belong to a draft nobody has saved yet, so it is never touched.
  public static readonly GRACE_MS = 60 * 60 * 1000;

  private static readonly COLD_BATCH = 500;

  public constructor(
    private readonly pages: DocPageRepository,
    private readonly storage: StorageGateway,
    private readonly clock: { now(): Date },
    // Archived revision months still link images: without them, restoring a month brings
    // back broken links (`RW.3`). Absent in a test that archives nothing.
    private readonly archive: PartitionArchiveGateway | null = null,
    private readonly cold: ColdArchiveReader | null = null,
  ) {}

  // Returns how many objects went. The references are read before the listing, so an
  // image uploaded in between is young and skipped rather than judged on a stale read.
  public async run(organizationId: OrganizationId, spaceId: DocSpaceId): Promise<number> {
    const linked = new Set(
      (
        await this.pages.listImageLinks(
          organizationId,
          DocImageKey.urlPrefix(organizationId, spaceId),
        )
      ).map((link) => DocImageKey.fileOfLink(link)),
    );
    for (const file of await this.archivedLinks(organizationId, spaceId)) linked.add(file);
    const prefix = DocImageKey.spacePrefix(organizationId, spaceId);
    const cutoff = this.clock.now().getTime() - DocImageOrphans.GRACE_MS;

    let deleted = 0;
    for await (const keys of this.storage.listPages(prefix)) {
      for (const key of keys) {
        const file = key.slice(prefix.length);
        // A key this class would not have written is not this class's to delete.
        if (DocImageKey.typeOf(file) === null || linked.has(file)) continue;
        const uploadedAt = DocImageKey.uploadedAt(file);
        if (uploadedAt === null || uploadedAt.getTime() > cutoff) continue;
        await this.storage.delete(key);
        deleted += 1;
      }
    }
    return deleted;
  }

  // Every image an archived `doc_revision` month links, streamed out of cold storage. A month
  // the index has forgotten has expired, and its images may go with it.
  private async archivedLinks(
    organizationId: OrganizationId,
    spaceId: DocSpaceId,
  ): Promise<readonly string[]> {
    if (!this.archive || !this.cold) return [];
    const prefix = DocImageKey.urlPrefix(organizationId, spaceId);
    const pattern = new RegExp(
      `${prefix.replace(/[\\^$.*+?()[\]{}|/]/g, "\\$&")}[a-z]+/[0-9a-f-]{36}`,
      "g",
    );

    const files: string[] = [];
    const months = await this.archive.monthsOf(PartitionedTable.DOC_REVISION, organizationId);
    for (const entry of months) {
      for await (const rows of this.cold.batches(entry, DocImageOrphans.COLD_BATCH)) {
        for (const row of rows) {
          const body = typeof row.markdown === "string" ? row.markdown : "";
          for (const link of body.match(pattern) ?? []) {
            const file = DocImageKey.fileOfLink(link);
            if (file !== null) files.push(file);
          }
        }
      }
    }
    return files;
  }
}
