import type { OrganizationId } from "../import.js";

// Every tenant, a page at a time: each per-tenant loop the worker runs exists for a
// tenant count at which reading them all into memory is the thing that stops working.
export abstract class OrganizationReader {
  // Keyset on `id`, exclusive, and `null` is the first page. The id is a v7 uuid, so
  // that ordering is also creation order and a tenant added mid-loop lands at the end.
  public abstract page(
    after: OrganizationId | null,
    limit: number,
    // The tenants placed on one physical node, for a per-shard sweep. Absent is every
    // tenant, which is what a loop that resolves each tenant's node itself wants.
    onNode?: number,
  ): Promise<readonly OrganizationId[]>;

  // A page of the tenants whose digest is due this UTC hour (`26.7`), on one node: a
  // tenant with no setting is due at `defaultHour`.
  public abstract pageDueForDigest(
    after: OrganizationId | null,
    limit: number,
    onNode: number,
    hour: number,
    defaultHour: number,
  ): Promise<readonly OrganizationId[]>;

  // For the copy a person reads. The digest's footer said "you belong to
  // 018f8c00-0000-…" because the id was the only thing the use-case held.
  public abstract nameOf(organizationId: OrganizationId): Promise<string | null>;

  // The batch form, for a report naming many tenants: one catalog read, never one per row.
  // An id with no tenant is absent from the map.
  public abstract namesOf(
    organizationIds: readonly OrganizationId[],
  ): Promise<ReadonlyMap<OrganizationId, string>>;
}
