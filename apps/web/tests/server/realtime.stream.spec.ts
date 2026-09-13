import { Principal, RealtimeChannels } from "@loadbearing/application";
import type { Container } from "@loadbearing/composition";
import type { OrganizationId, RealtimeMessage, UserId } from "@loadbearing/contracts";
import { SilentLogger } from "@loadbearing/observability";
import { CapabilitySet } from "@loadbearing/permissions";
import { RPCHandler } from "@orpc/server/fetch";
import { describe, expect, it } from "vitest";
import { Cors } from "../../src/server/cors.js";
import { RealtimeRouter } from "../../src/server/orpc/realtime.router.js";

const ORG = "00000000-0000-7000-8000-000000000001" as OrganizationId;
const USER = "00000000-0000-7000-8000-000000000002" as UserId;
const CHANNEL = RealtimeChannels.user(ORG, USER);

// The stream's whole surface of the container: a principal, a logger, and the port. A
// real one would need Postgres and both Redis instances to be constructed at all.
function containerWith(frames: readonly RealtimeMessage[], seen: string[]) {
  return {
    logger: new SilentLogger(),
    principals: {
      fromHeaders: () => Promise.resolve(new Principal(ORG, USER, CapabilitySet.empty())),
    },
    realtimeSubscriber: {
      // eslint-disable-next-line @typescript-eslint/require-await
      subscribe: async function* (channels: readonly string[]) {
        seen.push(...channels);
        for (const frame of frames) yield frame;
      },
    },
  } as unknown as Container;
}

const frame = (id: string): RealtimeMessage => ({
  kind: "event",
  id,
  name: "member.changed",
  at: new Date("2026-01-01T00:00:00Z"),
  payload: {},
});

async function call(container: Container, init: { lastEventId?: string } = {}): Promise<Response> {
  const handler = new RPCHandler({ realtime: RealtimeRouter.all });
  const headers = new Headers({ "content-type": "application/json" });
  if (init.lastEventId) headers.set("last-event-id", init.lastEventId);

  const { response } = await handler.handle(
    new Request("http://localhost/api/rpc/realtime/stream", {
      method: "POST",
      headers,
      body: "{}",
    }),
    { prefix: "/api/rpc", context: { container, headers } },
  );

  if (!response) throw new Error("the stream procedure did not match");
  return response;
}

describe("the realtime stream over RPCHandler", () => {
  it("answers as an event stream, not a JSON body", async () => {
    const response = await call(containerWith([], []));

    expect(response.headers.get("content-type")).toContain("text/event-stream");
  });

  it("carries each published frame", async () => {
    const response = await call(containerWith([frame("00000000-0000-7000-8000-00000000000a")], []));
    const body = await response.text();

    expect(body).toContain("00000000-0000-7000-8000-00000000000a");
    // The id oRPC writes from `withEventMeta`, which is what the client sends back as
    // `Last-Event-ID` and what makes a reconnect a resume rather than a fresh open.
    expect(body).toContain("id: 00000000-0000-7000-8000-00000000000a");
  });

  // The channel comes from the principal and from nothing else. An input that could
  // name one would be the whole of the tenancy hole.
  it("subscribes to the principal's own channel", async () => {
    const seen: string[] = [];
    await (await call(containerWith([], seen))).text();

    expect(seen).toEqual([CHANNEL]);
  });

  it("opens a resumed stream with a resync before anything live", async () => {
    const response = await call(
      containerWith([frame("00000000-0000-7000-8000-00000000000b")], []),
      { lastEventId: "00000000-0000-7000-8000-000000000099" },
    );
    const body = await response.text();

    expect(body.indexOf("resync")).toBeGreaterThan(-1);
    expect(body.indexOf("resync")).toBeLessThan(
      body.indexOf("00000000-0000-7000-8000-00000000000b"),
    );
  });

  // The buffering risk this whole tier exists to rule out: `Cors.apply` must set
  // headers and hand back the same streaming body, never read or replace it.
  it("survives Cors.apply with its body untouched", async () => {
    const response = await call(containerWith([frame("00000000-0000-7000-8000-00000000000c")], []));
    const request = new Request("http://localhost/api/rpc/realtime/stream", { method: "POST" });

    const applied = Cors.apply(request, response);

    expect(applied).toBe(response);
    expect(applied.headers.get("content-type")).toContain("text/event-stream");
    expect(await applied.text()).toContain("00000000-0000-7000-8000-00000000000c");
  });
});
