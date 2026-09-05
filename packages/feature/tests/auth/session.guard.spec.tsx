import { screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { SessionGuard } from "../../src/auth/session.guard.js";
import { capabilitiesWith, GRANTABLE, renderWithFakes } from "../support/render-with-fakes.js";

const FIRST = GRANTABLE[0];

describe("SessionGuard", () => {
  it("renders children for a signed-in user with no permission required", async () => {
    await renderWithFakes(
      <SessionGuard onUnauthenticated={vi.fn()} onForbidden={vi.fn()}>
        <p>inside</p>
      </SessionGuard>,
      capabilitiesWith([]),
    );

    expect(screen.getByText("inside")).toBeDefined();
  });

  it("calls back rather than navigating when signed out", async () => {
    // The router ban in practice: the component knows *that* it should redirect, never
    // *how*. `apps/web` passes a navigate call; the desktop shell passes its own.
    const onUnauthenticated = vi.fn();
    await renderWithFakes(
      <SessionGuard onUnauthenticated={onUnauthenticated} onForbidden={vi.fn()}>
        <p>inside</p>
      </SessionGuard>,
      capabilitiesWith([]),
      null,
    );

    expect(onUnauthenticated).toHaveBeenCalled();
    expect(screen.queryByText("inside")).toBeNull();
  });

  it("calls onForbidden when the capability is missing", async () => {
    if (!FIRST) throw new Error("the permission catalog is empty");
    const onForbidden = vi.fn();

    await renderWithFakes(
      <SessionGuard permission={FIRST} onUnauthenticated={vi.fn()} onForbidden={onForbidden}>
        <p>inside</p>
      </SessionGuard>,
      capabilitiesWith([]),
    );

    expect(onForbidden).toHaveBeenCalled();
    expect(screen.queryByText("inside")).toBeNull();
  });

  it("lets a holder of the permission through", async () => {
    if (!FIRST) throw new Error("the permission catalog is empty");
    const onForbidden = vi.fn();

    await renderWithFakes(
      <SessionGuard permission={FIRST} onUnauthenticated={vi.fn()} onForbidden={onForbidden}>
        <p>inside</p>
      </SessionGuard>,
      capabilitiesWith([FIRST]),
    );

    expect(onForbidden).not.toHaveBeenCalled();
    expect(screen.getByText("inside")).toBeDefined();
  });
});
