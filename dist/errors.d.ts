import type { QuotaErrorCode } from "./types.js";
/**
 * Raised for gateway-level failures (bad key, no position, quota exhausted,
 * upstream not wired / unreachable). Vendor responses — including a vendor's
 * own 4xx/5xx — are returned to the caller, NOT thrown.
 */
export declare class QuotaError extends Error {
    readonly code: QuotaErrorCode | "http_error";
    readonly status: number;
    constructor(code: QuotaErrorCode | "http_error", status: number, message?: string);
    /** No quota left on the active position (HTTP 429). Time to top up. */
    get isQuotaExhausted(): boolean;
    /** The API key is missing or invalid (HTTP 401). */
    get isAuthError(): boolean;
    /** The caller holds no active position for this tier (HTTP 404). */
    get isNoPosition(): boolean;
    /** Tier has no vendor wired, or the vendor was unreachable (no quota spent). */
    get isUpstreamProblem(): boolean;
}
/** Maps a gateway error body/status to a typed QuotaError. */
export declare function toQuotaError(status: number, body: unknown): QuotaError;
//# sourceMappingURL=errors.d.ts.map