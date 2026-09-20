import type { OrganizationId } from "../import.js";
import type { Principal } from "../primitive/index.js";
import type { NotificationRepository } from "./notification.repository.js";

// How far back a digest looks, which is also how far back the fan-out has to look to
// know a tenant has anything to send. One day, matching the schedule's own cadence.
const WINDOW_MS = 24 * 60 * 60 * 1000;

// Cross-tenant, and reachable only from the worker's digest fan-out. It asserts no
// permission, for the reason `SendMailUseCase` gives in docs/reference/ports.md.
export class ListDigestOrganizationsUseCase {
  public constructor(private readonly notifications: NotificationRepository) {}

  // Asks which tenants have unread notifications, not which have a stored `digest`
  // preference: on the shipped defaults nobody stores one, so the second answered none.
  public execute(actor: Principal, now: Date): Promise<readonly OrganizationId[]> {
    void actor;
    return this.notifications.organizationsWithUnreadSince(new Date(now.getTime() - WINDOW_MS));
  }
}
