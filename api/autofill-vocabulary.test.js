import assert from "node:assert/strict";
import test from "node:test";

import { normalizeQuotaRpcResult } from "./autofill-vocabulary.js";

test("normalizeQuotaRpcResult accepts the authenticated quota RPC row", () => {
  assert.deepEqual(
    normalizeQuotaRpcResult([
      {
        allowed: true,
        daily_limit: 1000,
        request_count: 17,
        subscription_tier: "subscriber",
      },
    ]),
    {
      allowed: true,
      limit: 1000,
      requestCount: 17,
      subscriptionTier: "subscriber",
    },
  );
});

test("normalizeQuotaRpcResult rejects missing or malformed quota results", () => {
  assert.throws(
    () => normalizeQuotaRpcResult([]),
    /Secure quota RPC returned an invalid result/,
  );
  assert.throws(
    () =>
      normalizeQuotaRpcResult({
        allowed: true,
        daily_limit: 10,
        request_count: -1,
        subscription_tier: "free",
      }),
    /Secure quota RPC returned an invalid result/,
  );
});
