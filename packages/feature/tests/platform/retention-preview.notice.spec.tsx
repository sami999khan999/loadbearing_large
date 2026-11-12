import type { ApiClient } from "@loadbearing/api-client";
import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { RetentionPreviewNotice } from "../../src/platform/retention-preview.notice.js";
import { capabilitiesWith, renderWithFakes } from "../support/render-with-fakes.js";

const mount = (hotMonths: string) =>
  renderWithFakes(
    <RetentionPreviewNotice tableName="messages" hotMonths={hotMonths} onReady={vi.fn()} />,
    capabilitiesWith([]),
    undefined,
    ["platform", "common"],
    {} as unknown as ApiClient,
  );

// `WK.4`. A never-dropped table has no months, and its untouched form said "Enter a whole
// number of months" before anyone typed.
describe("RetentionPreviewNotice", () => {
  it("says nothing for a blank value, which is the table's default", async () => {
    const { container } = await mount("");
    expect(container.textContent).toBe("");
  });

  it("still asks for a whole number when something else was typed", async () => {
    await mount("1.5");
    expect(await screen.findByText("Enter a whole number of months, at least one.")).toBeDefined();
  });
});
