# Import and AI Auto-fill

Prepared imports and AI Auto-fill are separate paths. Both [CSV parsers](../src/utils/importParsers.js)
feed normal note persistence directly: no Wiktionary, OpenAI or AI quota is used.
Auto-fill is an explicit Vocabulary editor action whose output is reviewed before
saving, not an automatic translation/migration service.

## CSV Formats

Vocabulary CSV requires these exact 18 headers, in any order, with no duplicates,
unknown headers or extra columns. Optional cells still need their delimiters.

```csv
french,chinese,part_of_speech,gender,ipa,tags,example,notes,conjugation_je,conjugation_tu,conjugation_il_elle,conjugation_nous,conjugation_vous,conjugation_ils_elles,adjective_masculine,adjective_feminine,adjective_masculine_plural,adjective_feminine_plural
école,学校,noun,feminine,/e.kɔl/,school;daily,Je vais à l'école.,A common noun.,,,,,,,,,,
```

- Every row requires `french`, `chinese` and `part_of_speech`. Chinese meaning maps
  to the legacy `english` note property.
- Supported POS: `noun`, `verb`, `adjective`, `adverb`, `pronoun`, `preposition`,
  `conjunction`, `interjection`, `article`, `numeral`.
- A supplied noun gender must be `masculine`, `feminine`, or `masculine or feminine`.
- Conjugation columns apply to verbs, mapping `il_elle` to `il/elle` and
  `ils_elles` to `ils/elles`; other pronouns keep their names. Adjective columns
  apply to adjectives, with plural forms mapped to `masculinePlural`/`femininePlural`.
  Irrelevant morphology is cleared rather than attached to another POS.

Phrase CSV accepts two columns (French, translation), or three including tags.
Headers are optional; if supplied, they must be French, Translation/English/Meaning,
then optional Tags/Usage, in that order. Header matching is case-insensitive.
`Usage` is a compatible header alias for tags, not a separate saved field.

```csv
french,translation,tags
Bonjour !,你好！,A1;greetings
"Non, merci.",不用了，谢谢。,polite;daily
```

Both modes split tags on semicolons or commas; a comma-containing tag cell must
be CSV-quoted. UTF-8 BOM, LF/CRLF, quoted commas/embedded newlines, doubled quotes,
Chinese and accented French are supported. Structural validation covers the whole
file before any write: unclosed/misplaced quotes, text after a closing quote,
ambiguous headers and inconsistent row widths reject it with physical source
line/column diagnostics. Well-formed rows then receive semantic validation.
Uploading a malformed replacement cannot reuse a prior file's parsed rows.

## Batch Recovery

The [import hook](../src/hooks/useImportJob.js) owns a batch above the view, scoped
to account/job identity. Each original row slot is added, skipped, failed or
unprocessed; totals reconcile to the selected batch. Run progress describes only
the current subset. Results show totals and skipped/failed entries, not every success.

Cancel stops before the next row, allowing a started save to settle. The terminal
outcome is Cancelled even if that was the last row. Resume processes only
unprocessed rows; Retry failed only failed rows. Cancelling a retry leaves untouched
failures classified as failed. Recovery updates original slots and never resubmits
successful/skipped rows. Duplicate checks use current notes plus current-run
identity, trimmed/NFC/case-insensitive within the selected category.

The Add Note goal completes after the first success per batch/local day, avoiding
per-row progress writes while allowing overnight recovery to satisfy today's goal.
Navigation retains progress; reload, tab closure or account switching does not.
Re-uploading still uses duplicate checks. New file/mode changes invalidate older
reads and clear old rows. Demo permits preview only, never persisted imports.
Cancellation does not roll back committed rows or impose a deadline on an in-flight
save. Lost post-commit responses rely on database uniqueness/retry behavior, not
a server import transaction or idempotency protocol.

## Auto-fill Request and Quota

The [endpoint](../api/autofill-vocabulary.js) expects a non-null JSON object with
string `word` and optional `language` (`en`/`zh`, default `en`). Input is NFC-normalized;
curly apostrophes and typographic/nonbreaking hyphens become ASCII equivalents.
Limits are 48 normalized characters and four space-separated words. Accents,
uppercase French, `œ`/`Œ`, `æ`/`Æ`, apostrophes and hyphens are accepted; digits,
controls, invisible formatting, unsupported symbols and punctuation-only inputs
are rejected.

Processing order is bearer Auth, input validation, Wiktionary French verification,
server-key availability, `consume_ai_autofill_quota`, then OpenAI structured output.
Verification uses article/capitalization candidates, redirects and a cache. Missing
entries return 422; malformed or failed upstream responses are not cached as missing.

The authenticated RPC atomically reserves an attempt using the UTC date: 10/day
free, 1,000/day subscriber. Exhaustion returns 429 without OpenAI or an over-limit
increment. Invalid input, failed verification or a missing server key reserves no
attempt. Quota/RPC errors fail closed; there is no in-memory allowance fallback.
Settings' read-only quota display is not the enforcement boundary. Payment and
subscription provisioning are not implemented in the frontend.

Once reserved, an attempt remains counted after OpenAI failure, malformed output,
timeout or cancellation. A manual retry reserves another attempt. A lost quota-RPC
response can leave a reservation even without an OpenAI request. There are no
refunds, and closing the editor does not guarantee provider work stops.

## Deadlines and Errors

Wiktionary has a 15-second total deadline including response reads and retry waits,
with up to four attempts for transient server failures. OpenAI has 30 seconds
including response reads and no automatic retry. Both stages return on deadline
even if transport abort is ignored. Auth/quota retain the Supabase client's
behavior; hosting can terminate the function earlier, so these are not global
deployment execution guarantees.

Errors are JSON `{ error, code, status, ...details }`, with matching HTTP status
and `retryable` for temporary upstream failures. Connection failures use 502
(`WIKTIONARY_UNAVAILABLE`/`OPENAI_UNAVAILABLE`), deadlines 504 (`*_TIMEOUT`), and
malformed payloads 502 (`*_INVALID_RESPONSE`). Temporary HTTP failures use 503;
permanent OpenAI rejections use 502 `OPENAI_REJECTED`. Wiktionary 429/temporary
responses use `WIKTIONARY_TEMPORARY`, `retryAfterMs` and separate `upstreamStatus`.
Provider bodies, secrets, internal model details and stack traces are not exposed.
Failures outside the handler receive generic client feedback.

## Editor Auto-fill Safety

The [client service](../src/services/vocabularyAutofill.js) and editor associate
requests with opening identity, French input, category, language and account.
Changing context invalidates/cancels old work even if the word later changes back.
Checks cover Auth preflight and transport; uncancellable late results/errors are
discarded after closure, note switch or account change.

Applicable results replace only fields not manually edited during the request.
Clearing/restoring a value still counts as editing. POS, gender and both morphology
objects are preserved as a group when one changes. Ordinary French edits never
erase other fields. Failure keeps the draft and shows localized feedback for
explicit retry; no automatic repeated paid request occurs. Demo guards remain
effective below the button. See [editor save safety](learning-and-notes.md#mutation-and-editor-safety)
for pending submissions and ambiguous save failures.
