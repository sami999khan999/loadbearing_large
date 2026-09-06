// What the running stack is, resolved once in `vitest.smoke.config.ts` and injected. Read
// there and not here: `noProcessEnv` and assertion 3 both walk `tests/`. See doc 15.
export interface Stack {
  readonly redis: { readonly cacheUrl: string; readonly queueUrl: string };
  readonly storage: {
    readonly endpoint: string;
    readonly region: string;
    readonly bucket: string;
    readonly accessKey: string;
    readonly secretKey: string;
    readonly forcePathStyle: boolean;
  };
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
