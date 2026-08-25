import type { UserId } from "../import.js";

// Structurally satisfied by a Web `Headers`, so `resolve(request.headers)` just works.
// Declared rather than named: `lib: ["ES2024"]` has no `Headers`, and adding @types/node
// to borrow one method would put Node's globals in a runtime-neutral package.
export interface RequestHeaders {
  get(name: string): string | null;
}

export interface ResolvedSession {
  readonly userId: UserId;
  readonly sessionId: string;
  readonly expiresAt: Date;
}

export abstract class SessionResolver {
  public abstract resolve(headers: RequestHeaders): Promise<ResolvedSession | null>;
}
