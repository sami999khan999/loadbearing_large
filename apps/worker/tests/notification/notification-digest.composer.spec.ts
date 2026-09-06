import { SERVER_CATALOG, StaticContentSource } from "@loadbearing/content";
import { describe, expect, it } from "vitest";
import { DigestComposer } from "../../src/notification/notification-digest.composer.js";

// `SERVER_CATALOG`, not the client one: `email` is reachable through it and nothing
// else, so a composer on the client source renders raw keys.
const composer = new DigestComposer(new StaticContentSource(SERVER_CATALOG));

describe("DigestComposer", () => {
  it("says how many updates there were", async () => {
    expect(await composer.subject("en", 4)).toContain("4");
  });

  it("uses a different subject when nothing changed", async () => {
    const empty = await composer.subject("en", 0);

    // Not "0 updates". A digest saying zero reads as a broken digest.
    expect(empty).not.toContain("0");
    expect(empty).not.toBe(await composer.subject("en", 4));
  });

  it("interpolates the recipient's name", async () => {
    expect(await composer.greeting("en", "Ada")).toContain("Ada");
  });

  it("renders in the recipient's locale, not the sender's", async () => {
    const en = await composer.greeting("en", "Ada");
    const bn = await composer.greeting("bn", "Ada");

    // The locale is a parameter, so a per-recipient subject line is a second call rather
    // than a second system.
    expect(bn).toContain("Ada");
    expect(bn).not.toBe(en);
  });

  it("names the organization in the body", async () => {
    const body = await composer.body("en", "Acme", 2);

    expect(body).toContain("Acme");
    // Never a raw key: a missing namespace shows up here as `email.digest.footer`.
    expect(body).not.toContain("email.digest.");
  });
});
