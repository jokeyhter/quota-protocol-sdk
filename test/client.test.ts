import { describe, it, expect, vi } from "vitest";
import { QuotaClient, QuotaError } from "../src/index.js";

const BASE = "https://gateway.quota.xyz";
const KEY = "qk_devnet_secret";
const TIER = "gpt-4o-mini-standard";

/** Builds a fake fetch that returns a single canned Response and records calls. */
function fakeFetch(
  status: number,
  body: string,
  headers: Record<string, string> = {}
) {
  return vi.fn((_url: string | URL | Request, _init?: RequestInit) =>
    Promise.resolve(new Response(body, { status, headers }))
  );
}

function makeClient(fetchImpl: typeof fetch, extra = {}) {
  return new QuotaClient({ baseUrl: BASE, apiKey: KEY, tier: TIER, fetch: fetchImpl, ...extra });
}

describe("QuotaClient construction", () => {
  it("requires baseUrl, apiKey and tier", () => {
    expect(() => new QuotaClient({ baseUrl: "", apiKey: KEY, tier: TIER })).toThrow();
    expect(() => new QuotaClient({ baseUrl: BASE, apiKey: "", tier: TIER })).toThrow();
    expect(() => new QuotaClient({ baseUrl: BASE, apiKey: KEY, tier: "" })).toThrow();
  });

  it("derives the gateway URL and trims slashes", () => {
    const c = new QuotaClient({ baseUrl: `${BASE}/`, apiKey: KEY, tier: TIER });
    expect(c.gatewayUrl).toBe(`${BASE}/gateway/${TIER}`);
  });
});

describe("proxied requests", () => {
  it("forwards to gatewayUrl + path with auth + calls headers", async () => {
    const f = fakeFetch(200, '{"data":[]}', {
      "content-type": "application/json",
      "x-quota-debited": "1",
      "x-quota-remaining": "999",
    });
    const c = makeClient(f as unknown as typeof fetch);

    const { data, quota, status } = await c.post<{ data: unknown[] }>(
      "/v1/embeddings",
      { input: "hi" }
    );

    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe(`${BASE}/gateway/${TIER}/v1/embeddings`);
    const headers = new Headers(init!.headers);
    expect(headers.get("authorization")).toBe(`Bearer ${KEY}`);
    expect(headers.get("x-quota-calls")).toBe("1");
    expect(headers.get("content-type")).toBe("application/json");
    expect(init!.body).toBe('{"input":"hi"}');

    expect(status).toBe(200);
    expect(data).toEqual({ data: [] });
    expect(quota).toEqual({ debited: 1, remaining: 999 });
  });

  it("returns a vendor error status as a normal response (does not throw)", async () => {
    // Vendor's own 429 — gateway still set quota headers, so it's a real response.
    const f = fakeFetch(429, '{"error":{"message":"vendor rate limit"}}', {
      "content-type": "application/json",
      "x-quota-debited": "1",
      "x-quota-remaining": "5",
    });
    const c = makeClient(f as unknown as typeof fetch);

    const res = await c.post("/v1/chat/completions", {});
    expect(res.status).toBe(429);
    expect(res.quota.remaining).toBe(5);
  });

  it("honours callsPerRequest override", async () => {
    const f = fakeFetch(200, "{}", { "x-quota-remaining": "10", "x-quota-debited": "4" });
    const c = makeClient(f as unknown as typeof fetch, { callsPerRequest: 4 });
    await c.get("/v1/models");
    const headers = new Headers(f.mock.calls[0]![1]!.headers);
    expect(headers.get("x-quota-calls")).toBe("4");
  });
});

describe("gateway-level errors (thrown)", () => {
  it("maps 429 quota_exhausted (no quota headers) to a typed error", async () => {
    const f = fakeFetch(429, '{"error":"quota_exhausted"}');
    const c = makeClient(f as unknown as typeof fetch);
    const err = await c.post("/v1/embeddings", {}).catch((e) => e);
    expect(err).toBeInstanceOf(QuotaError);
    expect(err.code).toBe("quota_exhausted");
    expect(err.isQuotaExhausted).toBe(true);
    expect(err.status).toBe(429);
  });

  it("maps 401 invalid_key", async () => {
    const f = fakeFetch(401, '{"error":"invalid_key"}');
    const c = makeClient(f as unknown as typeof fetch);
    const err = await c.get("/v1/models").catch((e) => e);
    expect(err.code).toBe("invalid_key");
    expect(err.isAuthError).toBe(true);
  });

  it("maps 404 no_position", async () => {
    const f = fakeFetch(404, '{"error":"no_position"}');
    const c = makeClient(f as unknown as typeof fetch);
    const err = await c.get("/x").catch((e) => e);
    expect(err.code).toBe("no_position");
    expect(err.isNoPosition).toBe(true);
  });

  it("maps 502 upstream_unavailable as an upstream problem", async () => {
    const f = fakeFetch(502, '{"error":"upstream_unavailable"}');
    const c = makeClient(f as unknown as typeof fetch);
    const err = await c.post("/v1/embeddings", {}).catch((e) => e);
    expect(err.code).toBe("upstream_unavailable");
    expect(err.isUpstreamProblem).toBe(true);
  });

  it("wraps a network failure reaching the gateway", async () => {
    const f = vi.fn(() => Promise.reject(new Error("ECONNREFUSED")));
    const c = makeClient(f as unknown as typeof fetch);
    const err = await c.get("/x").catch((e) => e);
    expect(err).toBeInstanceOf(QuotaError);
    expect(err.code).toBe("http_error");
  });
});

describe("metering-only", () => {
  it("POSTs to the tier root with a calls body and returns the balance", async () => {
    const f = fakeFetch(
      200,
      JSON.stringify({ ok: true, tier: TIER, requested: 3, debited: 3, remaining: 97 })
    );
    const c = makeClient(f as unknown as typeof fetch);

    const r = await c.meter(3);
    const [url, init] = f.mock.calls[0]!;
    expect(url).toBe(`${BASE}/gateway/${TIER}`);
    expect(init!.body).toBe('{"calls":3}');
    expect(r).toEqual({ ok: true, tier: TIER, requested: 3, debited: 3, remaining: 97 });
  });

  it("throws a typed error when metering fails", async () => {
    const f = fakeFetch(429, '{"error":"quota_exhausted"}');
    const c = makeClient(f as unknown as typeof fetch);
    await expect(c.meter(1)).rejects.toMatchObject({ code: "quota_exhausted" });
  });
});
