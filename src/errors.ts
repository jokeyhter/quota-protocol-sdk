import type { QuotaErrorCode } from "./types.js";

/**
 * Raised for gateway-level failures (bad key, no position, quota exhausted,
 * upstream not wired / unreachable). Vendor responses — including a vendor's
 * own 4xx/5xx — are returned to the caller, NOT thrown.
 */
export class QuotaError extends Error {
  readonly code: QuotaErrorCode | "http_error";
  readonly status: number;

  constructor(
    code: QuotaErrorCode | "http_error",
    status: number,
    message?: string
  ) {
    super(message ?? defaultMessage(code, status));
    this.name = "QuotaError";
    this.code = code;
    this.status = status;
    // Restore prototype chain (TS targeting ES5/ES2015 transpile safety).
    Object.setPrototypeOf(this, QuotaError.prototype);
  }

  /** No quota left on the active position (HTTP 429). Time to top up. */
  get isQuotaExhausted(): boolean {
    return this.code === "quota_exhausted";
  }

  /** The API key is missing or invalid (HTTP 401). */
  get isAuthError(): boolean {
    return this.code === "invalid_key" || this.code === "missing_api_key";
  }

  /** The caller holds no active position for this tier (HTTP 404). */
  get isNoPosition(): boolean {
    return this.code === "no_position";
  }

  /** Tier has no vendor wired, or the vendor was unreachable (no quota spent). */
  get isUpstreamProblem(): boolean {
    return this.code === "no_upstream" || this.code === "upstream_unavailable";
  }
}

function defaultMessage(
  code: QuotaErrorCode | "http_error",
  status: number
): string {
  switch (code) {
    case "missing_api_key":
      return "No API key supplied to the gateway.";
    case "invalid_key":
      return "The gateway API key is invalid or revoked.";
    case "no_position":
      return "No active quota position for this tier — buy a forward first.";
    case "quota_exhausted":
      return "Quota exhausted for this position — top up to keep calling.";
    case "no_upstream":
      return "This tier has no upstream vendor wired yet (metering-only).";
    case "upstream_unavailable":
      return "The upstream vendor was unreachable — no quota was consumed.";
    default:
      return `Gateway request failed with HTTP ${status}.`;
  }
}

const KNOWN_CODES: QuotaErrorCode[] = [
  "missing_api_key",
  "invalid_key",
  "no_position",
  "quota_exhausted",
  "no_upstream",
  "upstream_unavailable",
];

/** Maps a gateway error body/status to a typed QuotaError. */
export function toQuotaError(status: number, body: unknown): QuotaError {
  const code =
    body && typeof body === "object" && "error" in body
      ? (body as { error?: unknown }).error
      : undefined;
  if (typeof code === "string" && (KNOWN_CODES as string[]).includes(code)) {
    return new QuotaError(code as QuotaErrorCode, status);
  }
  return new QuotaError("http_error", status);
}
