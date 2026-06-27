import type { MeterResult, QuotaClientOptions, QuotaInfo } from "./types.js";
/** A proxied gateway response, plus the quota the call consumed. */
export interface QuotaResponse {
    /** The raw vendor Response (status, headers, body still readable). */
    response: Response;
    status: number;
    quota: QuotaInfo;
}
/** A proxied response whose body has been parsed as JSON. */
export interface QuotaJsonResponse<T> extends QuotaResponse {
    data: T;
}
/**
 * Client for the Quota Protocol gateway.
 *
 * Point it at your gateway, hand it your API key and tier, then call external
 * APIs through it — the gateway meters every call and debits your prepaid,
 * on-chain quota. Drop-in for OpenAI/REST: see `gatewayUrl` for the baseURL to
 * give the official `openai` SDK.
 *
 * @example
 * const quota = new QuotaClient({
 *   baseUrl: "https://gateway.quota.xyz",
 *   apiKey: process.env.QUOTA_KEY!,
 *   tier: "gpt-4o-mini-standard",
 * });
 * const { data, quota: q } = await quota.post("/v1/chat/completions", {
 *   model: "gpt-4o-mini",
 *   messages: [{ role: "user", content: "hi" }],
 * });
 * console.log("calls left:", q.remaining);
 */
export declare class QuotaClient {
    private readonly baseUrl;
    private readonly apiKey;
    readonly tier: string;
    private readonly callsPerRequest;
    private readonly timeoutMs;
    private readonly retries;
    private readonly retryBackoffMs;
    private readonly fetchImpl;
    constructor(opts: QuotaClientOptions);
    /**
     * The base URL to forward through this tier's gateway, i.e.
     * `${baseUrl}/gateway/${tier}`. Append a vendor path to reach the upstream.
     *
     * For the official OpenAI SDK, use `${gatewayUrl}/v1` as `baseURL` and your
     * Quota key as `apiKey`.
     */
    get gatewayUrl(): string;
    /**
     * Drop-in `baseURL` for the official OpenAI SDK:
     * `new OpenAI({ baseURL: quota.openaiBaseUrl, apiKey: "<your qk_ key>" })`.
     * Calls are then metered and debited from your prepaid quota automatically.
     */
    get openaiBaseUrl(): string;
    /**
     * Proxied request with optional retry of transient failures (network errors
     * and `502 upstream_unavailable`). See {@link QuotaClientOptions.retries}.
     */
    request(path: string, init?: RequestInit): Promise<QuotaResponse>;
    /** Whether an error is a transient failure worth retrying. */
    private isRetryable;
    /**
     * Low-level proxied request. `path` is appended to {@link gatewayUrl} and
     * forwarded to the tier's upstream vendor. Throws {@link QuotaError} on
     * gateway-level failures; vendor responses (any status) are returned.
     */
    private doRequest;
    /** Proxied GET, parsing the vendor response as JSON. */
    get<T = unknown>(path: string, init?: RequestInit): Promise<QuotaJsonResponse<T>>;
    /** Proxied POST of a JSON body, parsing the vendor response as JSON. */
    post<T = unknown>(path: string, body?: unknown, init?: RequestInit): Promise<QuotaJsonResponse<T>>;
    /**
     * Metering-only call (no upstream forwarding): debits `calls` against the
     * active position and returns the new balance. Useful when you meter usage
     * yourself instead of proxying through the gateway.
     */
    meter(calls?: number): Promise<MeterResult>;
    private send;
}
//# sourceMappingURL=client.d.ts.map