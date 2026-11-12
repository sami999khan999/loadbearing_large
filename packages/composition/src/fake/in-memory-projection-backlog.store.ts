import { type OrganizationId, ProjectionBacklogStore } from "../import.js";

// The sorted set as a Map of tenant to latest mark. `failing` makes `pending` throw, as an
// unreachable Redis does, so a spec can show the run falling back to the sweep.
export class InMemoryProjectionBacklogStore extends ProjectionBacklogStore {
  public readonly marks = new Map<OrganizationId, number>();
  public failing = false;

  public override mark(organizationId: OrganizationId, at: Date): Promise<void> {
    const current = this.marks.get(organizationId) ?? Number.NEGATIVE_INFINITY;
    this.marks.set(organizationId, Math.max(current, at.getTime()));
    return Promise.resolve();
  }

  public override pending(limit: number): Promise<readonly OrganizationId[]> {
    if (this.failing) return Promise.reject(new Error("backlog unreachable"));
    const ordered = [...this.marks].sort((a, b) => a[1] - b[1]).map(([id]) => id);
    return Promise.resolve(ordered.slice(0, limit));
  }

  public override clear(organizationId: OrganizationId, through: Date): Promise<void> {
    const at = this.marks.get(organizationId);
    if (at !== undefined && at <= through.getTime()) this.marks.delete(organizationId);
    return Promise.resolve();
  }
}
