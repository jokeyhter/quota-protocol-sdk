// Smoke test for the PUBLISHED npm package `quota-protocol-sdk`.
//
// Proves the package installs and works end to end without a live backend
// (a mock `fetch` stands in for the gateway).
//
// Run:
//   mkdir qp-smoke && cd qp-smoke
//   npm init -y
//   npm install quota-protocol-sdk
//   curl -o smoke-test.mjs https://raw.githubusercontent.com/quota-protocol/quota-protocol/main/quota-sdk/examples/smoke-test.mjs
//   node smoke-test.mjs
//
// Requires Node 18+ (global fetch / Response).

import { QuotaClient, QuotaError } from "quota-protocol-sdk";

const ok = (m) => console.log("  \x1b[32m✓\x1b[0m " + m);

// 1) Construct a client. Inject a mock fetch so no real gateway is needed.
const quota = new QuotaClient({
  baseUrl: "https://gateway.demo.quota.xyz",
  apiKey: "qk_devnet_demo",
  tier: "gpt-4o-mini-standard",
  fetch: async () =>
    new Response(
      JSON.stringify({ id: "cmpl_123", choices: [{ text: "hello" }] }),
      {
        status: 200,
        headers: {
          "content-type": "application/json",
          "x-quota-debited": "1",
          "x-quota-remaining": "4999999",
        },
      }
    ),
});
ok("client constructed");
console.log("    gatewayUrl ->", quota.gatewayUrl);

// 2) A metered call returns the vendor data plus the quota it consumed.
const res = await quota.post("/v1/chat/completions", {
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "hi" }],
});
ok(
  `metered POST -> HTTP ${res.status} | debited ${res.quota.debited} | remaining ${res.quota.remaining}`
);
console.log("    vendor data ->", JSON.stringify(res.data));

// 3) Typed error handling when the quota is exhausted (HTTP 429).
const drained = new QuotaClient({
  baseUrl: "https://gateway.demo.quota.xyz",
  apiKey: "qk_devnet_demo",
  tier: "gpt-4o-mini-standard",
  fetch: async () =>
    new Response(JSON.stringify({ error: "quota_exhausted" }), {
      status: 429,
      headers: { "content-type": "application/json" },
    }),
});
try {
  await drained.post("/v1/chat/completions", {});
  throw new Error("expected a QuotaError");
} catch (e) {
  if (!(e instanceof QuotaError)) throw e;
  ok(
    `error mapped -> code="${e.code}" status=${e.status} isQuotaExhausted=${e.isQuotaExhausted}`
  );
}

console.log(
  "\n\x1b[1m\x1b[32mALL CHECKS PASSED\x1b[0m — quota-protocol-sdk installed from npm and working.\n"
);
