# AI Auto-fill Reliability

## Input and Verification

The authenticated endpoint accepts a JSON object with a string `word` and an
optional `language` (`en` or `zh`, default `en`). Entries are normalized to NFC;
curly apostrophes and typographic/nonbreaking hyphens become their ASCII forms.
The existing limit remains 48 normalized characters and four space-separated
words. Latin accented letters and French ligatures (U+0153/U+0152 and
U+00E6/U+00C6) are accepted. Digits, controls, invisible formatting
characters, other symbols, and punctuation without letters are rejected.

Wiktionary verification still uses article stripping, capitalization candidates,
redirects, a French language section, and the existing verification cache. Missing
entries return 422. Malformed/failed upstream replies are not cached as missing
words. HTTP 429 retains `WIKTIONARY_TEMPORARY` and `retryAfterMs`; transient server
errors still have up to four verification attempts.

## Deadlines and Errors

- Wiktionary: 15 seconds total, including retry waits and response-body reads.
- OpenAI: 30 seconds, including response-body reads. No automatic OpenAI retry.
- Both deadlines abort the transport and return even if cancellation is ignored.
- Errors use JSON `{ error, code, status, ...details }`, where `status` matches the
  HTTP status. `retryable` marks transient upstream failures. For Wiktionary rate
  limits, `upstreamStatus` identifies the original status separately.
- Connection failures return 502 (`WIKTIONARY_UNAVAILABLE` / `OPENAI_UNAVAILABLE`),
  deadline expiry returns 504 (`*_TIMEOUT`), and invalid JSON/payloads return 502
  (`*_INVALID_RESPONSE`). Temporary HTTP failures return 503; permanent OpenAI
  HTTP rejections return 502 (`OPENAI_REJECTED`) without exposing provider details.
- Provider bodies, credentials, model configuration errors, and stack traces are
  never passed through to the browser.

The editor retains the draft after failure, displays an English or Simplified
Chinese message, and allows an explicit Auto-fill retry. Existing request identity,
dirty-field, account, editor-close, and Demo guards remain in place.

## Quota Counts Attempts, Not Successful Notes

The order remains Auth -> input validation -> Wiktionary verification -> check
server key -> `consume_ai_autofill_quota` -> OpenAI. A rejected input, failed
verification, or missing server key does not reserve an AI attempt.

The authenticated quota RPC atomically reserves one attempt before OpenAI is
called. Free accounts retain 10/day; subscribers retain 1000/day. The RPC uses
the UTC date, independently of the local learning day. Exhausted quota returns
429 without calling OpenAI or incrementing beyond the limit.

Once reserved, an attempt stays counted even if OpenAI disconnects, times out,
rejects the request, or returns malformed/incomplete content. Manually retrying
reserves another attempt. Closing the editor or aborting the browser request does
not refund a reservation or guarantee the provider stops processing. A lost RPC
response may also leave a committed reservation even though no OpenAI call was
made. No refunds or quota-function changes are implemented here.

## Verification and Limits

Unit tests execute the actual endpoint with mocked Auth, quota, Wiktionary and
OpenAI. Browser tests use synthetic accounts and mocked AI responses; no paid AI
requests are required. Tests do not establish live database grants/RLS or provider
availability. No production database, schema, deployment, or model changes are
part of this task.

These are application deadlines for the two vocabulary upstream stages, not a
deployment-level execution guarantee: Auth/quota still use the existing Supabase
client behavior, and a hosting platform can terminate a function earlier. A proxy
failure outside the handler is handled by the client with a generic retry message.
