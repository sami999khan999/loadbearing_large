import { UnavailableError } from "../import.js";

export interface ClickHouseConfig {
  // The HTTP interface, not the native port. `http://clickhouse:8123` in compose,
  // `https://…` for ClickHouse Cloud — the same client reaches both.
  readonly url: string;
  readonly database: string;
  readonly username: string;
  readonly password: string;
  // A query that has not answered by now is a query nobody is still waiting for.
  // Analytics reads are allowed to be slow; they are not allowed to be unbounded.
  readonly timeoutMs?: number;
}

// `fetch` over the HTTP interface, not `@clickhouse/client` — the same call the
// embedding provider makes for the same reason. The request shape is stable, the
// dependency count stays where it is, and ClickHouse stays a
// [Tier 0](../../../../docs/opinions/dependencies.md) dependency reached over a
// protocol this runtime already speaks.
//
// Wanting the SDK's connection pooling later is a change inside this one class.
export class ClickHouseConnection {
  private static readonly DEFAULT_TIMEOUT_MS = 30_000;

  public constructor(private readonly config: ClickHouseConfig) {}

  // Reads. `JSONEachRow` rather than `JSON`: one object per line, so a large result
  // streams and the parse cost is proportional to what was asked for.
  public async query<T>(sql: string, params: Readonly<Record<string, unknown>> = {}): Promise<T[]> {
    const body = await this.send(`${sql}\nFORMAT JSONEachRow`, params);
    if (body.length === 0) return [];

    return body
      .split("\n")
      .filter((line) => line.length > 0)
      .map((line) => JSON.parse(line) as T);
  }

  // Writes and DDL. Nothing is returned, and nothing should be — a caller that reads
  // an insert's response is a caller treating the derived store as authoritative.
  public async command(sql: string, params: Readonly<Record<string, unknown>> = {}): Promise<void> {
    await this.send(sql, params);
  }

  // A batch insert, rows serialised as `JSONEachRow` in the request body. Batched
  // rather than row-at-a-time because ClickHouse merges on write: a thousand
  // single-row inserts create a thousand parts and the background merge never
  // catches up, which is the classic way a ClickHouse table gets slow.
  public async insert(
    table: string,
    rows: readonly Readonly<Record<string, unknown>>[],
  ): Promise<void> {
    if (rows.length === 0) return;

    const payload = rows.map((row) => JSON.stringify(row)).join("\n");
    await this.send(`INSERT INTO ${this.qualified(table)} FORMAT JSONEachRow\n${payload}`);
  }

  public async healthy(): Promise<boolean> {
    try {
      await this.query<{ readonly one: number }>("SELECT 1 AS one");
      return true;
    } catch {
      return false;
    }
  }

  // Nothing to release — `fetch` holds no pool. Present so `Container.dispose()`
  // treats every store the same way and adding a pooled client later changes
  // this file rather than the container.
  public async close(): Promise<void> {}

  // Table names are qualified against the configured database on the way out.
  // ClickHouse resolves an unqualified name against the session default, which is
  // `default` unless every request says otherwise — the same trap the init script
  // documents, and the reason a table can look missing while it exists.
  public qualified(table: string): string {
    return table.includes(".") ? table : `${this.config.database}.${table}`;
  }

  private async send(sql: string, params: Readonly<Record<string, unknown>> = {}): Promise<string> {
    const url = new URL(this.config.url);
    url.searchParams.set("database", this.config.database);
    // Server-side bound parameters, never string interpolation. ClickHouse reads
    // `{name:Type}` placeholders out of these — the analytics store holds every
    // tenant's rows, so an injected predicate here is a cross-tenant read.
    for (const [key, value] of Object.entries(params)) {
      url.searchParams.set(`param_${key}`, ClickHouseConnection.encode(value));
    }

    const response = await fetch(url, {
      method: "POST",
      headers: {
        "content-type": "text/plain; charset=utf-8",
        "x-clickhouse-user": this.config.username,
        "x-clickhouse-key": this.config.password,
      },
      body: sql,
      signal: AbortSignal.timeout(this.config.timeoutMs ?? ClickHouseConnection.DEFAULT_TIMEOUT_MS),
    });

    if (!response.ok) {
      // ClickHouse puts the whole error in the body and a bare 500 in the status,
      // so the body is the only part worth reporting. Truncated: a failed INSERT
      // echoes the offending row, and an audit payload does not belong in a log.
      const detail = (await response.text()).slice(0, 500);
      throw new UnavailableError(`ClickHouse request failed (${response.status}): ${detail}`);
    }

    return response.text();
  }

  // `DateTime64(3)`. ClickHouse parses `YYYY-MM-DD HH:MM:SS.mmm`, and rejects the
  // `T` and `Z` of an ISO string — the failure is a 400 with a parse error, which
  // is at least loud, unlike the alternative of a silently wrong hour.
  private static encode(value: unknown): string {
    if (value instanceof Date) return value.toISOString().replace("T", " ").replace("Z", "");
    if (Array.isArray(value)) return `[${value.map((v) => `'${String(v)}'`).join(",")}]`;
    return String(value);
  }
}
