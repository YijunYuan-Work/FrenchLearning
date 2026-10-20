# Vocabulary Quiz Category Integrity

## Reconciliation Policy

Quiz reconciliation runs only after the existing learning-state, notes and
settings readiness gates. It operates on the saved session, without backfilling
or reshuffling valid questions. The current date and configured limit remain
unchanged; the existing settings/new-day rules still apply.

- Unanswered questions require a valid Vocabulary note, a nonblank French word
  and meaning, and integer confidence 1-3. Missing, deleted, malformed,
  reclassified or mastered notes are removed from active questions.
- Pending answers are unfinished, not historical credit. They are removed if
  the note disappears or ceases to be valid Vocabulary. A valid pending answer
  may resume at confidence 4: its fixed target can already have committed before
  a lost response. Recovery does not calculate a second confidence increment.
- Completed answers, including wrong/revealed answers and supported legacy
  outcomes, remain historical progress after deletion, reclassification or
  mastery. They are counted but never presented as active questions. Legacy
  completed results whose IDs were previously pruned from the queue are retained
  as history at the end, without changing valid active question order.
- Malformed IDs/results and duplicate active IDs/French words are reconciled.
  A question with an unreadable saved answer is removed without credit, not
  restarted as a fresh confidence-increasing attempt.
  Removed IDs remain seen, so making the same note eligible again does not
  reintroduce it into another Quiz today.
- Correct/answered/remaining counts use the reconciled session and completed
  outcomes, not the current number of surviving note records. A nonempty session
  with no unfinished questions completes the daily goal. Removing an entirely
  unanswered session does not manufacture completion credit. An already earned
  daily goal remains earned, as before.

Reconciliation uses the existing daily-state saver, localStorage/cloud modes,
account ownership and local learning-day rules. The UI filters immediately,
before an effect persists the reconciled session. Returning to Quiz or reloading
does not resurrect a removed pending question. Reconciliation persistence errors
use the existing daily-save feedback/recovery flow.

## Answer Mutation Boundary

The editor and Quiz retain their existing same-note mutation ordering. A Quiz
answer queued behind a category edit rechecks the latest confirmed note before
writing confidence. Quiz-only PATCH requests additionally filter on both owner
and `category = vocabulary`, preventing a remotely reclassified/deleted row from
matching when the database executes the update. A no-match response removes the
unfinished question rather than recording success or repeatedly retrying it.

Async continuations use attempt identity and the latest reconciled session;
obsolete callbacks cannot restore removed questions or unlock a newer answer.
Network/storage failures on still-valid questions retain the existing durable
pending intent and explicit fixed-target retry. Demo uses the same eligibility
and reconciliation logic without backend mutations.

## Limits

No production database, schema or deployment changes are included. Tests use
synthetic accounts and mocked persistence. They do not verify live database
policies or grant configuration.

Notes are not subscribed to real-time changes. Another device's changes become
visible after notes are reloaded, or a guarded Quiz PATCH detects a category
mismatch. Category eligibility is checked at the note update's commit; a later
category edit does not retroactively undo an otherwise legitimate answer.

Note confidence and daily session writes are not one cross-device transaction.
If a confidence commit's response is lost and the note is then reclassified,
the unconfirmed pending Quiz outcome is discarded without rolling back that
earlier valid confidence commit. Strict cross-device transactional scoring would
need separately approved database support. Seen tracking remains ID-based; it
cannot identify a deleted word recreated under a completely new note ID once
its original text is unavailable.
