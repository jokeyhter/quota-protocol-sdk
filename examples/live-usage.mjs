// REAL end-to-end usage of the published `quota-protocol-sdk` — no mocks.
//
// Points the SDK at a RUNNING Quota gateway (the backend), authenticates with a
// real API key, and meters a real position. The remaining balance actually
// decreases across calls, proving live metering against the gateway + database.
//
// Run against your backend:
//   1) start the backend (npm run dev) and seed tiers
//   2) sign in via the app, buy a forward, create an API key (qk_...)
//   3) QUOTA_BASE_URL=http://localhost:4000 \
//      QUOTA_API_KEY=qk_... \
//      QUOTA_TIER=gpt-4o-mini-standard \
//      node live-usage.mjs
//
// Requires Node 18+.
import { QuotaClient, QuotaError } from "quota-protocol-sdk";

const baseUrl = process.env.QUOTA_BASE_URL || "http://localhost:4000";
const apiKey = process.env.QUOTA_API_KEY;
const tier = process.env.QUOTA_TIER || "gpt-4o-mini-standard";

if (!apiKey) {
  console.error("Set QUOTA_API_KEY (a real qk_... gateway key).");
  process.exit(1);
}

const quota = new QuotaClient({ baseUrl, apiKey, tier });
console.log("Gateway :", quota.gatewayUrl);
console.log("Tier    :", tier, "\n");

const fmt = (n) => Number(n).toLocaleString("en-US");

async function meter(calls) {
  const r = await quota.meter(calls);
  console.log(
    `  metered ${fmt(calls).padStart(9)} calls  ->  debited ${fmt(r.debited)}, remaining ${fmt(r.remaining)}`
  );
  return r;
}

try {
  console.log("Live metering against the running gateway:");
  const a = await meter(250_000);
  const b = await meter(250_000);
  const c = await meter(500_000);
  const dropped = Number(a.remaining) + 250_000 - Number(c.remaining); // sanity
  console.log(
    `\n\x1b[1m\x1b[32mLIVE OK\x1b[0m — balance fell by ${fmt(dropped)} calls across real gateway calls (no mocks).`
  );
} catch (e) {
  if (e instanceof QuotaError) {
    console.error(`QuotaError: ${e.code} (HTTP ${e.status})`);
    if (e.isQuotaExhausted) console.error("Quota is exhausted — buy or top up the position.");
    process.exit(2);
  }
  throw e;
}
