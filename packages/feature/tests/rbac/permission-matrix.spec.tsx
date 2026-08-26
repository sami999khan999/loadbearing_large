import { CapabilitySet, PermissionRegistry } from "@loadbearing/permissions";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PermissionMatrix } from "../../src/rbac/permission-matrix.js";
import { capabilitiesWith, renderWithFakes } from "../support/render-with-fakes.js";

const ALL = PermissionRegistry.instance.all();
const FIRST = ALL[0];

describe("PermissionMatrix", () => {
  // The test doc 23 names as the one worth writing first: the same component, two
  // capability fixtures, and a different answer. It exercises the DTO round-trip, the
  // session context, and `CapabilitySet.can` at once — and fails loudly the day the
  // client and server stop agreeing about permissions.
  it("answers differently for two different capability sets", async () => {
    if (!FIRST) throw new Error("the permission catalog is empty");

    await renderWithFakes(
      <PermissionMatrix
        subjects={[
          {
            id: "granted",
            label: "Granted",
            capabilities: CapabilitySet.from(capabilitiesWith([FIRST])),
          },
          { id: "denied", label: "Denied", capabilities: CapabilitySet.from(capabilitiesWith([])) },
        ]}
      />,
      capabilitiesWith([]),
    );

    expect(screen.getAllByText("Allowed")).toHaveLength(1);
    expect(screen.getAllByText("Denied").length).toBeGreaterThan(1);
  });

  it("renders one row per catalog permission", async () => {
    await renderWithFakes(
      <PermissionMatrix
        subjects={[{ id: "a", label: "A", capabilities: CapabilitySet.empty() }]}
      />,
      capabilitiesWith([]),
    );

    // Header row plus one per permission. The rows are the catalog, not data.
    expect(screen.getAllByRole("row")).toHaveLength(ALL.length + 1);
  });

  it("names every column, so a cell is announced with its subject", async () => {
    await renderWithFakes(
      <PermissionMatrix
        subjects={[{ id: "a", label: "Admin", capabilities: CapabilitySet.empty() }]}
      />,
      capabilitiesWith([]),
    );

    expect(screen.getByRole("columnheader", { name: "Admin" })).toBeDefined();
  });

  it("falls back to the empty state with no subjects", async () => {
    await renderWithFakes(<PermissionMatrix subjects={[]} />, capabilitiesWith([]));

    expect(screen.getByText("Nothing here yet")).toBeDefined();
  });
});
