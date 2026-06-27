/** Error codes the Quota gateway returns in `{ "error": <code> }` bodies. */
export type QuotaErrorCode = "missing_api_key" | "invalid_key" | "no_position" | "quota_exhausted" | "no_upstream" | "upstream_unavailable";
/** Remaining/debited quota reported by the gateway after a metered call. */
export interface QuotaInfo {
    /** Calls debited by this request, or null if the gateway didn't report it. */
    debited: number | null;
    /** Calls left on the active position, or null if not reported. */
    remaining: number | null;
}
/** Result of the metering-only endpoint (`POST /gateway/:tier`). */
export interface MeterResult {
    ok: true;
    tier: string;
    requested: number;
    debited: number;
    remaining: number;
}
export interface QuotaClientOptions {
    /**
     * Gateway base URL, e.g. `https://gateway.quota.xyz` (no trailing
     * `/gateway/...`). The SDK appends `/gateway/<tier>` for you.
     */
    baseUrl: string;
    /** Your gateway API key, e.g. `qk_devnet_...`. */
    apiKey: string;
    /** Tier slug the key buys against, e.g. `gpt-4o-mini-standard`. */
    tier: string;
    /** Override the number of calls a single proxied request meters (default 1). */
    callsPerRequest?: number;
    /** Per-request timeout in ms (default 30000). */
    timeoutMs?: number;
    /**
     * Retry transient failures (network errors and `502 upstream_unavailable`)
     * up to this many times with exponential backoff. Default 0 (no retries).
     * Never retries `quota_exhausted`, auth, or other deterministic errors —
     * those would just fail again.
     */
    retries?: number;
    /** Base backoff between retries in ms; doubles each attempt (default 300). */
    retryBackoffMs?: number;
    /** Inject a custom fetch (testing / non-global-fetch runtimes). */
    fetch?: typeof fetch;
}
//# sourceMappingURL=types.d.ts.map