import type { ApiClient } from "@loadbearing/api-client";
import { WidgetRegistry } from "@loadbearing/permissions";
import { QueryClient } from "@tanstack/react-query";
import { screen, waitFor } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { DashboardZone, prefetchDashboard } from "../../src/dashboard/dashboard-zone.js";
import { CapabilitySet } from "../../src/import.js";
import { capabilitiesWith, renderWithFakes } from "../support/render-with-fakes.js";

afterEach(() => {
  vi.restoreAllMocks();
});

function fakeClient() {
  const list = vi.fn().mockResolvedValue({ items: [], total: 4 });
  return { client: { member: { list } } as unknown as ApiClient, list };
}

const renderZone = (grants: readonly string[], client: ApiClient) =>
  renderWithFakes(
    <DashboardZone
      nav={[]}
      renderLink={(route, label) => (
        <a key={route} href={route}>
          {label}
        </a>
      )}
    />,
    capabilitiesWith(grants),
    undefined,
    ["nav", "widget"],
    client,
  );

describe("DashboardZone", () => {
  it("renders a card for every visible widget, titled from the registry's copy", async () => {
    const { client, list } = fakeClient();
    await renderZone(["member.read"], client);

    expect(screen.getByRole("region", { name: "Dashboard" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Go to" })).toBeDefined();
    expect(screen.getByRole("heading", { name: "Members" })).toBeDefined();
    await waitFor(() => expect(screen.getByText("Members: 4")).toBeDefined());
    expect(list).toHaveBeenCalledTimes(1);
  });

  // The point of the zone: a denied card is not rendered hidden, it is never mounted, so its
  // query is never issued.
  it("never mounts a denied widget, and never calls what it would have read", async () => {
    const { client, list } = fakeClient();
    await renderZone([], client);

    expect(screen.getByRole("heading", { name: "Go to" })).toBeDefined();
    expect(screen.queryByRole("heading", { name: "Members" })).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });

  it("never mounts a flag-hidden widget either", async () => {
    const real = WidgetRegistry.instance.visibilityOf.bind(WidgetRegistry.instance);
    vi.spyOn(WidgetRegistry.instance, "visibilityOf").mockImplementation((key, facts) =>
      key === "member.count" ? "hidden-by-flag" : real(key, facts),
    );
    const { client, list } = fakeClient();
    await renderZone(["member.read"], client);

    expect(screen.queryByRole("heading", { name: "Members" })).toBeNull();
    expect(list).not.toHaveBeenCalled();
  });
});

describe("prefetchDashboard", () => {
  it("prefetches for a visible widget, and skips a denied one", async () => {
    const allowed = fakeClient();
    await prefetchDashboard(
      new QueryClient(),
      allowed.client,
      CapabilitySet.from(capabilitiesWith(["member.read"])),
      [],
    );
    expect(allowed.list).toHaveBeenCalledTimes(1);

    const denied = fakeClient();
    await prefetchDashboard(
      new QueryClient(),
      denied.client,
      CapabilitySet.from(capabilitiesWith([])),
      [],
    );
    expect(denied.list).not.toHaveBeenCalled();
  });

  it("skips a flag-hidden widget", async () => {
    vi.spyOn(WidgetRegistry.instance, "visibilityOf").mockReturnValue("hidden-by-flag");
    const { client, list } = fakeClient();

    await prefetchDashboard(
      new QueryClient(),
      client,
      CapabilitySet.from(capabilitiesWith(["member.read"])),
      [],
    );

    expect(list).not.toHaveBeenCalled();
  });

  // A runtime backstop to the `satisfies`: the zone and the map agree on every key.
  it("has a card for exactly the widgets the registry puts in the zone", async () => {
    const { client } = fakeClient();
    await renderZone(["member.read"], client);

    const titles = screen.getAllByRole("heading").map((heading) => heading.textContent);
    expect(titles).toHaveLength(WidgetRegistry.instance.forZone("dashboard.main").length);
  });
});
