# quota-protocol-sdk

TypeScript client for the [Quota Protocol](../) gateway. Route your external API
calls through a prepaid, on-chain quota: the gateway meters every request and
debits the forward you bought in USDC. Swap your `baseURL`, pass your key, and
handle balance/limit errors with typed exceptions.

> CA: 2PuWgsCjz15ZBrWJNotpKpzUyWwZqbDH5yZ5AhMLpump

## Install

```bash
npm install quota-protocol-sdk
```

Requires Node 18+ (uses the global `fetch`). For older runtimes, pass a `fetch`
implementation in the options.

## Quick start

```ts
import { QuotaClient, QuotaError } from "quota-protocol-sdk";

const quota = new QuotaClient({
  baseUrl: "https://gateway.quota.xyz", // your gateway, not the vendor
  apiKey: process.env.QUOTA_KEY!,        // qk_devnet_...
  tier: "gpt-4o-mini-standard",          // the tier your key buys against
});

try {
  const { data, quota: q } = await quota.post("/v1/chat/completions", {
    model: "gpt-4o-mini",
    messages: [{ role: "user", content: "Hello!" }],
  });
  console.log(data);
  console.log(`debited ${q.debited}, ${q.remaining} calls left`);
} catch (err) {
  if (err instanceof QuotaError && err.isQuotaExhausted) {
    console.warn("Out of quota — buy or top up a forward.");
  } else {
    throw err;
  }
}
```

## Use with the official OpenAI SDK

The gateway is OpenAI/REST-compatible — point the OpenAI client's `baseURL` at
your tier and use your Quota key:

```ts
import OpenAI from "openai";
import { QuotaClient } from "quota-protocol-sdk";

const quota = new QuotaClient({ baseUrl, apiKey, tier: "gpt-4o-mini-standard" });

const openai = new OpenAI({
  apiKey, // your Quota gateway key
  baseURL: quota.openaiBaseUrl, // -> https://.../gateway/<tier>/v1
});

const res = await openai.chat.completions.create({
  model: "gpt-4o-mini",
  messages: [{ role: "user", content: "hi" }],
});
```

The buyer's Quota key never reaches the vendor — the gateway strips it and
injects the protocol's upstream credential server-side.

## API

### `new QuotaClient(options)`

| Option            | Type            | Default | Notes                                              |
| ----------------- | --------------- | ------- | -------------------------------------------------- |
| `baseUrl`         | `string`        | —       | Gateway base URL (no `/gateway/...`).              |
| `apiKey`          | `string`        | —       | Your gateway key (`qk_devnet_...`).                |
| `tier`            | `string`        | —       | Tier slug, e.g. `gpt-4o-mini-standard`.            |
| `callsPerRequest` | `number`        | `1`     | Calls metered per proxied request.                 |
| `timeoutMs`       | `number`        | `30000` | Per-request timeout.                               |
| `retries`         | `number`        | `0`     | Retry transient failures (network / `502`).        |
| `retryBackoffMs`  | `number`        | `300`   | Base backoff; doubles each attempt.                |
| `fetch`           | `typeof fetch`  | global  | Inject for testing / non-global-fetch runtimes.    |

### Methods

- `get gatewayUrl` → `${baseUrl}/gateway/${tier}`. Append a vendor path, or add
  `/v1` for the OpenAI SDK `baseURL`.
- `get openaiBaseUrl` → `${gatewayUrl}/v1`. Drop straight into
  `new OpenAI({ baseURL: quota.openaiBaseUrl, apiKey })`.
- `request(path, init?)` → `QuotaResponse` — low-level proxied call. Returns the
  raw vendor `Response` plus `quota` (`{ debited, remaining }`).
- `get<T>(path, init?)` / `post<T>(path, body?, init?)` → `QuotaJsonResponse<T>`
  — convenience wrappers that parse the vendor body as JSON.
- `meter(calls?)` → `MeterResult` — metering-only (no upstream); debits quota
  and returns `{ ok, tier, requested, debited, remaining }`.

### Errors

`request`/`get`/`post`/`meter` throw a `QuotaError` for **gateway-level**
failures. A vendor's own status code (incl. its 4xx/5xx) is returned as a normal
response, not thrown.

| `code`                 | HTTP | Helper                | Meaning                                  |
| ---------------------- | ---- | --------------------- | ---------------------------------------- |
| `missing_api_key`      | 401  | `isAuthError`         | No key supplied.                         |
| `invalid_key`          | 401  | `isAuthError`         | Key invalid or revoked.                  |
| `no_position`          | 404  | `isNoPosition`        | No active position for the tier.         |
| `quota_exhausted`      | 429  | `isQuotaExhausted`    | Balance depleted — top up.               |
| `no_upstream`          | 501  | `isUpstreamProblem`   | Tier has no vendor wired (metering-only).|
| `upstream_unavailable` | 502  | `isUpstreamProblem`   | Vendor unreachable — no quota spent.     |
| `http_error`           | —    | —                     | Couldn't reach the gateway / other.      |

### Retries

Set `retries` to automatically re-attempt **transient** failures — network
errors reaching the gateway (`http_error`) and `502 upstream_unavailable` (the
vendor was unreachable, so no quota was spent). Backoff is exponential
(`retryBackoffMs * 2 ** attempt`). Deterministic errors — `quota_exhausted`,
auth, `no_position`, `no_upstream` — are never retried, since they'd just fail
again.

```ts
const quota = new QuotaClient({
  baseUrl,
  apiKey,
  tier: "gpt-4o-mini-standard",
  retries: 3,           // up to 3 extra attempts
  retryBackoffMs: 300,  // 300ms, 600ms, 1200ms
});
```

## Development

```bash
npm install
npm test          # vitest
npm run build     # tsc -> dist (JS + .d.ts)
```

## License

MIT
