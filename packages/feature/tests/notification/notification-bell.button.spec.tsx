import type { ApiClient } from "@loadbearing/api-client";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { NotificationBell } from "../../src/notification/notification-bell.button.js";
import { capabilitiesWith, renderWithFakes } from "../support/render-with-fakes.js";

const clientWith = (count: number) =>
  ({ notification: { unreadCount: () => Promise.resolve({ count }) } }) as unknown as ApiClient;

const render = (count: number) =>
  renderWithFakes(
    <NotificationBell href="/notifications" />,
    capabilitiesWith([]),
    undefined,
    ["notification"],
    clientWith(count),
  );

describe("NotificationBell", () => {
  // A "0" reads as a number worth looking at. An empty bell is the quiet state.
  it("shows no badge when nothing is unread", async () => {
    const { container } = await render(0);

    await waitFor(() => expect(container.querySelector("a")).not.toBeNull());
    expect(container.querySelector(".ui-status-badge")).toBeNull();
  });

  it("shows the count when something is unread", async () => {
    await render(3);

    await waitFor(() => expect(screen.getByText("3")).toBeDefined());
  });

  // The repository caps at 100, so the count comes back as exactly 100 and the badge is
  // what turns that into an honest "99+" rather than a number that is quietly wrong.
  it("renders the cap as 99+", async () => {
    await render(100);

    await waitFor(() => expect(screen.getByText("99+")).toBeDefined());
  });
});
