# Quiz and Confidence Consistency

## Save order and retries

A correct answer (including a manual correction) first saves a pending entry in
the existing daily Quiz JSON. The entry contains the answer and an absolute
`targetConfidence`. Pending entries do not count as answered or correct and do not
complete the daily Quiz goal.

Only after that entry is durable does the app patch the note's confidence and
review marker. It then saves the completed Quiz result and enables Next. Errors
leave a Retry saving answer action. The same target is reused after failure,
navigation, or refresh, even if the note commit succeeded but its response was
lost. Retry never calculates another `current confidence + 1`. A newer, higher
confidence already confirmed in this workspace is not lowered by the retry.

Navigating away stops the old view's continuation. Its durable pending entry
remains available for explicit recovery; an already-started note write may still
finish for its original owner. Daily save failures continue to use the existing
daily persistence error and recovery controls. Legacy completed answers are
preserved, not retroactively replayed against notes.

## Note mutations

Confidence actions patch only confidence and last-reviewed fields. Editor saves
diff the normalized original editor snapshot so an unchanged confidence value does
not overwrite a newer review. Same-note operations execute in order and compute
relative changes from the latest confirmed workspace note. Different notes may
save concurrently. Returned rows merge only the operation's changed fields.
There are no optimistic full-row replacements or stale full-row rollbacks.

Queued operations check the initiating Auth generation before starting. Late
responses cannot update another account's workspace. Per-account/note API queues
also span workspace remounts; a returning account's initial notebook read waits
for that account's already-started note writes. Demo writes remain in memory.

## Remaining limits

This is not a distributed transaction or an offline outbox. Notes and daily state
are separate writes. Persisted pending targets make the normal retry/refresh path
recoverable, but do not provide strict exactly-once rewards across multiple devices
or independently edited tabs. Other clients can still overwrite the same note
field; there is no shared note revision or server-side attempt ledger. A delayed
write can also outlive a full browser document reload.

Strict cross-device consistency would minimally require an authenticated RPC that
accepts a unique Quiz attempt ID, checks a note revision, and updates confidence
and the Quiz result atomically, with an idempotency constraint on the attempt ID.
Direct note writes would need matching revision checks. No database migration,
production database change, or deployment change is included here.

Tests exercise the actual hooks and HTTP client with synthetic Auth/PostgREST
fixtures and real localStorage. They do not verify live production RLS.
