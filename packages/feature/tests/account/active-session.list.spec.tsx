import type { AccountClient, ActiveSession } from "@loadbearing/api-client";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { ActiveSessionList } from "../../src/account/active-session.list.js";
import { capabilitiesWith, renderWithFakes } from "../support/render-with-fakes.js";

const session = (id: string, current: boolean): ActiveSession => ({
  id,
  token: `token-${id}`,
  createdAt: "2026-09-01T00:00:00.000Z",
  userAgent: `agent-${id}`,
  ipAddress: null,
  current,
});

const clientWith = (listSessions: () => Promise<readonly ActiveSession[]>) =>
  ({
    listSessions,
    revokeSession: vi.fn(),
    revokeOtherSessions: vi.fn(),
  }) as unknown as AccountClient;

const render = (listSessions: () => Promise<readonly ActiveSession[]>) =>
  renderWithFakes(<ActiveSessionList account={clientWith(listSessions)} />, capabilitiesWith([]));

describe("ActiveSessionList", () => {
  it("says it is loading rather than showing a list it does not have", async () => {
    await render(() => new Promise(() => undefined));

    expect(screen.getByText("Loading…")).toBeDefined();
  });

  it("says something went wrong rather than showing no sessions", async () => {
    await render(() => Promise.reject(new Error("nope")));

    await waitFor(() => expect(screen.getByRole("alert")).toBeDefined());
    expect(screen.getByText("Something went wrong")).toBeDefined();
  });

  // The regression guard: the badge was rendered once, after the list, attached to no
  // row — so it named no device at all.
  it("marks the current session on its own row", async () => {
    await render(() => Promise.resolve([session("a", false), session("b", true)]));

    await waitFor(() => expect(screen.getByText("agent-b")).toBeDefined());

    const current = screen.getByText("agent-b").closest("li");
    const other = screen.getByText("agent-a").closest("li");

    expect(current?.textContent).toContain("This device");
    expect(other?.textContent).not.toContain("This device");
  });

  // And the other half: revoking it signs you out of the page you are reading, which is
  // what "Sign out on all devices" is for instead.
  it("offers no revoke on the current session", async () => {
    await render(() => Promise.resolve([session("a", false), session("b", true)]));

    await waitFor(() => expect(screen.getByText("agent-b")).toBeDefined());

    expect(screen.getByText("agent-b").closest("li")?.querySelector("button")).toBeNull();
    expect(screen.getByText("agent-a").closest("li")?.querySelector("button")).not.toBeNull();
  });
});
