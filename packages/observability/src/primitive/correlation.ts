import { Uuid } from "../import.js";

// A plain string, not a branded id: `contracts` deliberately refuses to own "a UUID
// that is genuinely just a UUID", and a diagnostic handle is exactly that. It also
// has to survive arriving from a proxy that minted its own, in whatever shape.
export type TraceId = string;

export class Correlation {
  private constructor() {}

  // The de-facto header. A load balancer or CDN usually sets it already, and
  // adopting theirs is what makes their access log and ours one trace.
  public static readonly HEADER = "x-request-id";

  // Bounded and character-checked. An upstream id arrives from the network and
  // then rides every log line for the life of the request.
  public static sanitise(value: string | null | undefined): TraceId | null {
    if (!value) return null;
    const trimmed = value.trim().slice(0, 128);
    return trimmed.length > 0 && /^[\w.:-]+$/.test(trimmed) ? trimmed : null;
  }

  // v7, so a trace id sorts by time — the same reason every id in this repo is v7.
  public static mint(): TraceId {
    return Uuid.v7();
  }

  public static fromHeaders(headers: { get(name: string): string | null }): TraceId {
    return Correlation.sanitise(headers.get(Correlation.HEADER)) ?? Correlation.mint();
  }
}
