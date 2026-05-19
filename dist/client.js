import { QuotaError, toQuotaError } from "./errors.js";
const trimTrailingSlash = (s) => s.replace(/\/+$/, "");
const trimLeadingSlash = (s) => s.replace(/^\/+/, "");
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
export class QuotaClient {
    baseUrl;
    apiKey;
    tier;
    callsPerRequest;
    timeoutMs;
    fetchImpl;
    constructor(opts) {
        if (!opts.baseUrl)
            throw new Error("QuotaClient: `baseUrl` is required");
        if (!opts.apiKey)
            throw new Error("QuotaClient: `apiKey` is required");
        if (!opts.tier)
            throw new Error("QuotaClient: `tier` is required");
        this.baseUrl = trimTrailingSlash(opts.baseUrl);
        this.apiKey = opts.apiKey;
        this.tier = opts.tier;
        this.callsPerRequest = opts.callsPerRequest ?? 1;
        this.timeoutMs = opts.timeoutMs ?? 30_000;
        const f = opts.fetch ?? globalThis.fetch;
        if (typeof f !== "function") {
            throw new Error("QuotaClient: no global `fetch` found — pass `fetch` in options (Node < 18).");
        }
        this.fetchImpl = f;
    }
    /**
     * The base URL to forward through this tier's gateway, i.e.
     * `${baseUrl}/gateway/${tier}`. Append a vendor path to reach the upstream.
     *
     * For the official OpenAI SDK, use `${gatewayUrl}/v1` as `baseURL` and your
     * Quota key as `apiKey`.
     */
    get gatewayUrl() {
        return `${this.baseUrl}/gateway/${this.tier}`;
    }
    /**
     * Low-level proxied request. `path` is appended to {@link gatewayUrl} and
     * forwarded to the tier's upstream vendor. Throws {@link QuotaError} on
     * gateway-level failures; vendor responses (any status) are returned.
     */
    async request(path, init = {}) {
        const url = path ? `${this.gatewayUrl}/${trimLeadingSlash(path)}` : this.gatewayUrl;
        const headers = new Headers(init.headers);
        headers.set("authorization", `Bearer ${this.apiKey}`);
        if (!headers.has("x-quota-calls")) {
            headers.set("x-quota-calls", String(this.callsPerRequest));
        }
        const response = await this.send(url, { ...init, headers });
        // The gateway sets `x-quota-remaining` only on a metered (proxied) response.
        // Its absence means a gateway-level outcome (error or metering-only).
        const remaining = response.headers.get("x-quota-remaining");
        if (remaining === null) {
            const body = await safeJson(response);
            throw toQuotaError(response.status, body);
        }
        return {
            response,
            status: response.status,
            quota: quotaFromHeaders(response.headers),
        };
    }
    /** Proxied GET, parsing the vendor response as JSON. */
    async get(path, init = {}) {
        const r = await this.request(path, { ...init, method: "GET" });
        return { ...r, data: (await safeJson(r.response)) };
    }
    /** Proxied POST of a JSON body, parsing the vendor response as JSON. */
    async post(path, body, init = {}) {
        const headers = new Headers(init.headers);
        if (body !== undefined && !headers.has("content-type")) {
            headers.set("content-type", "application/json");
        }
        const r = await this.request(path, {
            ...init,
            method: "POST",
            headers,
            body: body === undefined ? undefined : JSON.stringify(body),
        });
        return { ...r, data: (await safeJson(r.response)) };
    }
    /**
     * Metering-only call (no upstream forwarding): debits `calls` against the
     * active position and returns the new balance. Useful when you meter usage
     * yourself instead of proxying through the gateway.
     */
    async meter(calls = this.callsPerRequest) {
        const url = this.gatewayUrl;
        const response = await this.send(url, {
            method: "POST",
            headers: {
                authorization: `Bearer ${this.apiKey}`,
                "content-type": "application/json",
            },
            body: JSON.stringify({ calls }),
        });
        const body = await safeJson(response);
        if (!response.ok)
            throw toQuotaError(response.status, body);
        return body;
    }
    async send(url, init) {
        // Honour a caller-provided signal; otherwise apply the configured timeout.
        const signal = init.signal ??
            (typeof AbortSignal !== "undefined" && "timeout" in AbortSignal
                ? AbortSignal.timeout(this.timeoutMs)
                : undefined);
        try {
            return await this.fetchImpl(url, { ...init, signal });
        }
        catch (err) {
            // Network-level failure reaching the gateway itself.
            throw new QuotaError("http_error", 0, `Failed to reach the gateway at ${url}: ${err.message}`);
        }
    }
}
function quotaFromHeaders(h) {
    const d = h.get("x-quota-debited");
    const r = h.get("x-quota-remaining");
    return {
        debited: d === null ? null : Number(d),
        remaining: r === null ? null : Number(r),
    };
}
async function safeJson(res) {
    const text = await res.clone().text();
    if (!text)
        return null;
    try {
        return JSON.parse(text);
    }
    catch {
        return text;
    }
}
//# sourceMappingURL=client.js.map