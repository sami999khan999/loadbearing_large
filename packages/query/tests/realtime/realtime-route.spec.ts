import { QueryClient } from "@tanstack/react-query";
import { describe, expect, it, vi } from "vitest";
import { QueryKeys } from "../../src/key/index.js";
import { RealtimeRoutes } from "../../src/realtime/realtime-route.js";

const spyOn = (client: QueryClient) =>
  vi.spyOn(client, "invalidateQueries").mockResolvedValue(undefined);

describe("RealtimeRoutes", () => {
  it("invalidates the member namespace for a member frame", () => {
    const client = new QueryClient();
    const invalidate = spyOn(client);

    RealtimeRoutes.apply(client, "member.changed");

    expect(invalidate).toHaveBeenCalledWith({ queryKey: QueryKeys.member.all() });
  });

  it("invalidates the notification namespace for a notification frame", () => {
    const client = new QueryClient();
    const invalidate = spyOn(client);

    RealtimeRoutes.apply(client, "notification.created");

    expect(invalidate).toHaveBeenCalledWith({ queryKey: QueryKeys.notification.all() });
  });

  // The point of the table being the source of both: a name added to the contract has
  // to be routed, and its key is then part of the resync sweep for free.
  it("resyncs every key the table names, derived rather than listed twice", () => {
    const client = new QueryClient();
    const invalidate = spyOn(client);

    RealtimeRoutes.resync(client);

    expect(invalidate).toHaveBeenCalledTimes(RealtimeRoutes.names().length);
    expect(invalidate).toHaveBeenCalledWith({ queryKey: QueryKeys.member.all() });
    expect(invalidate).toHaveBeenCalledWith({ queryKey: QueryKeys.notification.all() });
  });

  it("names every event the contract declares", () => {
    // The type already fails the build if the table is not total. This catches the
    // reverse: a route left behind for a name the contract has dropped.
    expect([...RealtimeRoutes.names()].sort()).toEqual([
      "conversation.changed",
      "conversation.read",
      "member.changed",
      "message.deleted",
      "message.edited",
      "message.sent",
      "notification.created",
    ]);
  });
});
