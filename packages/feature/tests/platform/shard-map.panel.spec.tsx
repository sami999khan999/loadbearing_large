import { ApiClient, type AppClient } from "@loadbearing/api-client";
import type { ShardMapDto, TenantLocationDto } from "@loadbearing/contracts";
import { fireEvent, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { ShardMapPanel } from "../../src/platform/shard-map.panel.js";
import { capabilitiesWith, renderWithFakes } from "../support/render-with-fakes.js";

const PLACED = new Date("2026-09-01T00:00:00.000Z");

const TENANT = {
  organizationId: "00000000-0000-7000-8000-0000000000a1",
  slug: "loadbearing",
  name: "Loadbearing",
  node: 0,
  assignedAt: PLACED,
  movedAt: null,
  retentionOverrides: 0,
} as ShardMapDto["tenants"][number];

const NODE = { node: 0, tenants: 1, lastAssignedAt: PLACED, lastMovedAt: null };

// One node, one tenant, and `moves: "unavailable"` — the state the single-node compose
// stack is actually in, which is what `25.4`'s Exit line describes.
const map = (node: number | undefined): ShardMapDto => ({
  nodes: [NODE],
  tenants: node === undefined ? [] : [TENANT],
  total: node === undefined ? 0 : 1,
  limit: 25,
  offset: 0,
  moves: "unavailable",
});

// A partial `AppClient`, which is what `inProcess` exists to accept: the panel reaches
// for two procedures and nothing else, and a full one would be the whole contract.
const fakeClient = () =>
  ApiClient.inProcess({
    platform: {
      shardMap: (input: { node?: number }) => Promise.resolve(map(input.node)),
      locateTenant: (input: { term: string }) =>
        Promise.resolve({
          tenant: input.term === TENANT.slug ? TENANT : null,
          moves: "unavailable",
        } as TenantLocationDto),
    },
  } as unknown as AppClient);

const renderPanel = () =>
  renderWithFakes(
    <ShardMapPanel storageHref="/platform/storage" />,
    capabilitiesWith([]),
    undefined,
    ["platform"],
    fakeClient(),
  );

describe("ShardMapPanel", () => {
  it("renders one row per node, with its tenant count", async () => {
    await renderPanel();

    expect(await screen.findByRole("heading", { name: "Shard map" })).toBeTruthy();
    expect(await screen.findByRole("button", { name: "Show tenants" })).toBeTruthy();
  });

  // The tenants are the second read, and it does not happen until a node is expanded.
  it("shows a node's tenants only once it is expanded", async () => {
    await renderPanel();

    expect(screen.queryByText("Loadbearing (loadbearing)")).toBeNull();
    fireEvent.click(await screen.findByRole("button", { name: "Show tenants" }));

    expect(await screen.findByText("Loadbearing (loadbearing)")).toBeTruthy();
    expect(await screen.findByRole("heading", { name: "Tenants on node 0" })).toBeTruthy();
  });

  // The move button is rendered and disabled, with the reason beside it. A disabled
  // control with no reason is a screen that looks broken.
  it("disables the move button and says why", async () => {
    await renderPanel();
    fireEvent.click(await screen.findByRole("button", { name: "Show tenants" }));

    const move = await screen.findByRole("button", { name: "Move" });
    expect(move.hasAttribute("disabled")).toBe(true);
    expect(
      await screen.findByText("Tenant moves need the physical split — Phase 24."),
    ).toBeTruthy();
  });

  it("finds a tenant by slug and names the node holding it", async () => {
    await renderPanel();

    fireEvent.change(await screen.findByLabelText("Organization id or slug"), {
      target: { value: TENANT.slug },
    });

    expect(await screen.findByText("Loadbearing (loadbearing) is on node 0.")).toBeTruthy();
  });

  // A miss is what a typed search usually is, so it is a sentence rather than an error.
  it("says so when nothing answers to the term", async () => {
    await renderPanel();

    fireEvent.change(await screen.findByLabelText("Organization id or slug"), {
      target: { value: "nobody" },
    });

    expect(await screen.findByText("No tenant answers to that.")).toBeTruthy();
  });
  // It was `disabled={moves === "unavailable"}` alone, so the day `hasShardMoves` flips
  // it would render live and do nothing. The server saying "available" is not enough.
  it("keeps the move button disabled while no handler is wired", async () => {
    await renderWithFakes(
      <ShardMapPanel storageHref="/platform/storage" />,
      capabilitiesWith([]),
      undefined,
      ["platform"],
      ApiClient.inProcess({
        platform: {
          shardMap: (input: { node?: number }) =>
            Promise.resolve({ ...map(input.node), moves: "available" as const }),
          locateTenant: () => Promise.resolve({ tenant: null, moves: "available" }),
        },
      } as unknown as AppClient),
    );

    fireEvent.click(await screen.findByRole("button", { name: "Show tenants" }));

    const move = await screen.findByRole("button", { name: "Move" });
    expect(move.hasAttribute("disabled")).toBe(true);
  });
});
