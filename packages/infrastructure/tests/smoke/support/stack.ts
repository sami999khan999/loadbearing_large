// What the running stack is, resolved once in `vitest.smoke.config.ts` and injected. Read
// there and not here: `noProcessEnv` and assertion 3 both walk `tests/`. See doc 15.
export interface Stack {
  // Two URLs for one server. `url` goes through pgBouncer in transaction mode; `directUrl`
  // does not, and is what DDL a transaction pooler cannot carry uses.
  readonly database: { readonly url: string; readonly directUrl: string };
  readonly redis: { readonly cacheUrl: string; readonly queueUrl: string };
  readonly storage: {
    readonly endpoint: string;
    readonly region: string;
    readonly bucket: string;
    readonly accessKey: string;
    readonly secretKey: string;
    readonly forcePathStyle: boolean;
  };
  // Tenant counts the ceiling measurement runs at, from `TENANT_CEILING=100,500`. Absent
  // is the normal case: it creates tens of thousands of partitions and takes minutes.
  readonly tenantCeiling?: readonly number[];
  // Absent when the stack is not running one, which is the case the two `skipIf` blocks
  // are about — not a missing variable, a service nobody started.
  readonly loki?: { readonly url: string; readonly tenantId?: string };
  readonly clickhouse?: {
    readonly url: string;
    readonly database: string;
    readonly username: string;
    readonly password: string;
  };
}

declare module "vitest" {
  interface ProvidedContext {
    stack: Stack;
  }
}
