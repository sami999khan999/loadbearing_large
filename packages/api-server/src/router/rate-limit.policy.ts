export interface RateLimit {
  readonly limit: number;
  readonly windowSeconds: number;
}

// The procedures that cost someone else something: a mail from the product's domain to
// any address, a paid embedding call, a message fanned out to a room (`CR.6`).
// ──
// Named, never a default for every path: a limit on everything is a Redis round trip on
// every request, to protect procedures that cost nothing.
const LIMITS: Readonly<Record<string, RateLimit>> = Object.freeze({
  "member.invite": { limit: 30, windowSeconds: 3_600 },
  "member.resendInvitation": { limit: 30, windowSeconds: 3_600 },
  "document.search": { limit: 60, windowSeconds: 60 },
  "document.index": { limit: 30, windowSeconds: 60 },
  "message.send": { limit: 60, windowSeconds: 60 },
  "conversation.create": { limit: 30, windowSeconds: 60 },
});

export class RateLimitPolicy {
  private constructor() {}

  // Null for a procedure nobody limits, which is almost all of them.
  public static for(procedure: string): RateLimit | null {
    return LIMITS[procedure] ?? null;
  }

  public static procedures(): readonly string[] {
    return Object.keys(LIMITS);
  }
}
