import type { ApiClient } from "@loadbearing/api-client";
import type { MemberDto } from "@loadbearing/contracts";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MemberList } from "../../src/member/member-list.js";
import { capabilitiesWith, renderWithFakes } from "../support/render-with-fakes.js";

const MEMBER: MemberDto = {
  userId: "00000000-0000-7000-8000-000000000001" as MemberDto["userId"],
  name: "Ada",
  email: "ada@example.test",
  roleId: "00000000-0000-7000-8000-0000000000c1" as MemberDto["roleId"],
  roleKey: "owner",
  roleName: "Owner",
  joinedAt: new Date("2026-09-01T00:00:00.000Z"),
  deactivated: false,
};

const clientWith = (list: () => Promise<unknown>) => ({ member: { list } }) as unknown as ApiClient;

const render = (list: () => Promise<unknown>) =>
  renderWithFakes(<MemberList />, capabilitiesWith([]), undefined, ["member"], clientWith(list));

describe("MemberList", () => {
  it("shows a skeleton rather than a list it does not have", async () => {
    const { container } = await render(() => new Promise(() => undefined));

    expect(container.querySelector(".ui-data-table__skeleton-cell")).not.toBeNull();
  });

  // The regression guard: a failed list fell through to the empty state, so a members
  // page that could not load said the organization had no members.
  it("says something went wrong rather than saying there are no members", async () => {
    await render(() => Promise.reject(new Error("nope")));

    await waitFor(() => expect(screen.getByText("Something went wrong")).toBeDefined());
    expect(screen.queryByText("Nobody here yet.")).toBeNull();
  });

  it("says the organization is empty only when it is", async () => {
    await render(() => Promise.resolve({ items: [], total: 0 }));

    await waitFor(() => expect(screen.getByText("Nobody here yet.")).toBeDefined());
    expect(screen.queryByText("Something went wrong")).toBeNull();
  });

  it("lists what came back", async () => {
    await render(() => Promise.resolve({ items: [MEMBER], total: 1 }));

    await waitFor(() => expect(screen.getByText("Ada")).toBeDefined());
    expect(screen.getByText("ada@example.test")).toBeDefined();
  });
});
