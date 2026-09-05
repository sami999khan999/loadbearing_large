import { UnavailableError } from "@loadbearing/errors";
import { afterEach, describe, expect, it, vi } from "vitest";
import { ClickHouseConnection } from "../../src/clickhouse/clickhouse.connection.js";
import { RecordingLogger } from "../support/recording.logger.js";

const failWith = (status: number, body: string) =>
  vi.fn().mockResolvedValue({ ok: false, status, text: () => Promise.resolve(body) });

const connection = (logger?: RecordingLogger) =>
  new ClickHouseConnection(
    { url: "http://stub:8123", database: "analytics", username: "u", password: "p" },
    logger,
  );

afterEach(() => {
  vi.unstubAllGlobals();
});

describe("ClickHouseConnection", () => {
  // The regression guard: the body was interpolated into the error message, and
  // `AppError.toJSON()` serialises the context straight to the client.
  it("keeps the response body out of the thrown error", async () => {
    vi.stubGlobal("fetch", failWith(500, "Code: 62. DB::Exception: user@example.test"));

    const thrown = await connection()
      .query("SELECT 1")
      .catch((error: unknown) => error);

    expect(thrown).toBeInstanceOf(UnavailableError);
    expect(JSON.stringify((thrown as UnavailableError).toJSON())).not.toContain("example.test");
  });

  it("names the dependency and the status in the error context", async () => {
    vi.stubGlobal("fetch", failWith(503, "unavailable"));

    const thrown = (await connection()
      .query("SELECT 1")
      .catch((error: unknown) => error)) as UnavailableError;

    expect(thrown.context).toMatchObject({ dependency: "clickhouse", status: 503 });
  });

  it("logs the body at the level the catalog gives the event", async () => {
    vi.stubGlobal("fetch", failWith(500, "Code: 62. DB::Exception: bad row"));
    const logger = new RecordingLogger();

    await connection(logger)
      .query("SELECT 1")
      .catch(() => undefined);

    expect(logger.entries).toHaveLength(1);
    expect(logger.entries[0]).toMatchObject({
      level: "warn",
      event: "dependency.request.failed",
      fields: { dependency: "clickhouse", status: 500, detail: "Code: 62. DB::Exception: bad row" },
    });
  });

  it("throws without a logger", async () => {
    vi.stubGlobal("fetch", failWith(500, "boom"));

    await expect(connection().command("INSERT INTO t VALUES")).rejects.toThrow(UnavailableError);
  });
});
