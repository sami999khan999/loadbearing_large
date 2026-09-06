import { CapabilitySet, PermissionRegistry } from "@loadbearing/permissions";
import { screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { PermissionMatrix } from "../../src/rbac/permission-matrix.js";
import {
  CORE_KEYS,
  capabilitiesWith,
  GRANTABLE,
  renderWithFakes,
} from "../support/render-with-fakes.js";

const ALL = PermissionRegistry.instance.all();
const FIRST = GRANTABLE[0];

describe("PermissionMatrix", () => {
  // The same component, two capability fixtures, a different answer — which exercises the
  // DTO round-trip, the session context and `CapabilitySet.can` at once.
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

    // One cell for the grant, plus both subjects' `core.*` rows: every principal holds
    // those, which is exactly what the matrix should show.
    expect(screen.getAllByText("Allowed")).toHaveLength(1 + CORE_KEYS.length * 2);
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
