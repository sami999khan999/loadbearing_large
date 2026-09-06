import type { AccountClient, LinkedAccount } from "@loadbearing/api-client";
import { screen, waitFor } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { LinkedAccountList } from "../../src/account/linked-account.list.js";
import { capabilitiesWith, renderWithFakes, TEST_USER } from "../support/render-with-fakes.js";

const account = (providerId: string): LinkedAccount => ({
  id: `id-${providerId}`,
  providerId,
  accountId: `acc-${providerId}`,
  createdAt: "2026-09-01T00:00:00.000Z",
});

const clientWith = (listAccounts: () => Promise<readonly LinkedAccount[]>) =>
  ({ listAccounts, unlinkAccount: vi.fn(), linkGoogle: vi.fn() }) as unknown as AccountClient;

const render = (listAccounts: () => Promise<readonly LinkedAccount[]>) =>
  renderWithFakes(
    <LinkedAccountList
      account={clientWith(listAccounts)}
      googleEnabled={false}
      linkCallbackUrl="/settings/security"
    />,
    capabilitiesWith([]),
    TEST_USER,
    ["account"],
  );

describe("LinkedAccountList", () => {
  // The regression guard: `data` is undefined until the first answer, so the empty state
  // rendered for every account while the request was still in flight.
  it("says it is loading rather than saying there is nothing", async () => {
    await render(() => new Promise(() => undefined));

    expect(screen.getByText("Loading…")).toBeDefined();
    expect(screen.queryByText("Connected accounts")).toBeNull();
  });

  it("says something went wrong rather than saying there is nothing", async () => {
    await render(() => Promise.reject(new Error("nope")));

    await waitFor(() =>
      expect(screen.getByText("Something went wrong. Please try again.")).toBeDefined(),
    );
  });

  it("lists what came back", async () => {
    await render(() => Promise.resolve([account("credential"), account("google")]));

    await waitFor(() => expect(screen.getByText("google")).toBeDefined());
    expect(screen.getByText("credential")).toBeDefined();
  });
});
