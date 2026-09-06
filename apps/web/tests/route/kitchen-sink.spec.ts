import { describe, expect, it, vi } from "vitest";
import { Route } from "../../src/route/(dev)/kitchen-sink.js";

// `(dev)` is a route group: it organises files and contributes nothing to the URL, so
// nothing about the directory name keeps this page out of a production build.
describe("/kitchen-sink is a development surface", () => {
  it("throws notFound when the build is not a development one", () => {
    vi.stubEnv("DEV", false);

    expect(() => Route.options.loader?.({} as never)).toThrow();

    vi.unstubAllEnvs();
  });

  it("renders in development, which is the only place it is useful", () => {
    vi.stubEnv("DEV", true);

    expect(() => Route.options.loader?.({} as never)).not.toThrow();

    vi.unstubAllEnvs();
  });
});
