# Learning and Notes

## Note Contracts

Editor, Demo and import saves share [note normalization](../src/utils/noteIntegrity.js).
Required content must be text with meaningful non-whitespace characters.

| Category | Required content | Additional structure |
| --- | --- | --- |
| Vocabulary | French word/expression and meaning | POS, IPA, gender, conjugation, adjective forms, example, notes, tags, confidence |
| Phrases | Original French and translation | Tags and confidence; hidden vocabulary fields, example and notes are cleared on full save |
| Grammar | Title and nonempty sanitized explanation | Tags and confidence; title uses `french`, explanation uses `notes`, hidden vocabulary fields/example/meaning are cleared |
| Pronunciation | French title/content and meaning | Existing example/notes fields, tags and confidence |

`english` is the legacy property for meaning/translation, not a promise of English
content. AI uses the active UI language; imported or manually authored meanings
remain unchanged when language switches.

Confidence is an integer 1-4; 4 is mastered. Tags are arrays of text labels, trimmed
and deduplicated; editor tag input splits commas. Supported POS/gender values come
from [word fields](../src/data/wordFields.js); manual entry permits Unknown/unselected.
Conjugation/adjective forms accept only supported string-valued keys, filling
omitted forms with empty strings. CSV has its own [required POS rule](import-and-ai.md#csv-formats).

French titles are outer-trimmed and NFC-normalized. Duplicate identity lowercases
that title in French within a category. Editor, hook and import checks share the
key; database uniqueness errors become actionable duplicate feedback. Internal
spacing, accents, line breaks and meaningful content are not flattened. Validation
failure leaves the editor open with its draft.

On reads, malformed rows are normalized independently. Invalid tags, confidence,
enums or form shapes receive safe defaults with a warning count. Unusable IDs,
unknown categories, blank titles or missing required translations hide the row;
unreadable grammar HTML is isolated too. Reads neither repair nor delete originals.
Hidden rows cannot enter learning queues and need an explicitly reviewed repair.

## Mutation and Editor Safety

Same-note operations execute in order against the latest confirmed workspace note;
different notes may save concurrently. Confidence actions patch only confidence
and review marker. Editor saves diff the original normalized snapshot, so unchanged
confidence does not overwrite a later review. Responses merge only owned changes;
there are no stale optimistic full-row rollbacks. Owner-scoped API queues survive
workspace remounts; returning to an account waits for its started note writes.

Bulk deletion reconciles each result: successful notes disappear, failed notes
remain selected, and counts plus Retry are shown. Repeated deletion is guarded;
pending-delete guards and deleted-note tombstones stop late mutations from
resurrecting removed entries. All continuations retain initiating-account checks.

Each editor opening has a separate identity and synchronous pending-save guard.
Controls lock while saving; a failed save retains the draft for retry. Closing
does not cancel an already-started server write, which may still update its
original notebook/day goal, but cannot close or unlock a newer editor. Ambiguous
post-commit failures rely on existing duplicate constraints/retry behavior, not
a server idempotency protocol. [Auto-fill](import-and-ai.md#editor-auto-fill-safety)
has separate stale-response and dirty-field protections.

## Study and Quiz

Study selects non-mastered notes in randomized groups: vocabulary, then phrases,
then grammar. Defaults are up to 50/20/20, limited by eligible unseen notes, with
position and reveal/completion state persisted. Phrase/grammar confidence can be
adjusted directly; reviewing vocabulary alone does not change its confidence.
Quiz defaults to up to 50 non-mastered Vocabulary notes. Settings can change those
limits. New cycles exclude already-seen IDs for the day rather than repeat the
same queue. Readiness, day changes and storage modes follow [persistence](architecture.md#local-day-and-hydration).

Quiz accepts normalized complete meanings/alternatives rather than arbitrary
substrings. Nouns also require dropdown gender. Users may reveal an unknown answer
without confidence gain or mark a near-match answer correct after grading.

Correct answers and manual corrections follow a recoverable order:

1. Durably save a pending answer with an absolute `targetConfidence` in daily Quiz
   JSON. Pending entries do not count as answered/correct or complete the goal.
2. Patch the eligible note's confidence/review marker, then persist the completed
   Quiz outcome before enabling Next. Failure exposes Retry saving answer.
3. Retry/navigation/refresh reuse the same target, never a fresh `confidence + 1`,
   even if the commit succeeded but its response was lost. A newer higher
   workspace confidence is not lowered by that retry.

Saved queues reconcile without reshuffling or backfilling valid questions.
Unanswered items require valid Vocabulary, a meaning and integer confidence 1-3.
Missing, deleted, malformed, reclassified or mastered active items are removed.
Pending items must still be valid Vocabulary but may recover at 4 when their fixed
target already committed. Invalid pending answers earn no credit. Removed IDs stay
seen; completed wrong/revealed/correct outcomes remain historical counts after a
note changes or disappears and never reappear as active questions. Legacy completed
answers pruned from the queue remain history without changing active order.

Counts derive from reconciled outcomes. A session with completed history and no
unfinished questions can finish the daily goal; pruning an entirely unanswered
queue does not manufacture completion. Earned goals remain earned. Queued answers
recheck the latest confirmed note, and Quiz PATCHes filter owner plus Vocabulary
category at execution. A no-match drops the unfinished question instead of
recording success. Obsolete async callbacks cannot restore removed questions.

This is not a cross-device transaction. Other clients can still edit the same note
field; confidence and daily session writes are separate. A lost confidence response
followed by reclassification drops unconfirmed Quiz credit without rolling back a
previously valid commit. Strict exactly-once scoring would require a server-side
attempt ID/revision check and atomic confidence/result RPC. Seen IDs cannot identify
a deleted word recreated with a new ID after its original text is unavailable.

## Rich Text and Database Limits

[The sanitizer](../src/utils/richText.js) uses pinned `parse5` HTML5 parsing for
save/display/edit/reload. It emits fixed paragraphs, headings, blockquotes, bold,
italic, underline, line breaks and lists plus escaped text, never source attributes
or URLs. Useful pasted span styles become semantic tags; scripts, embedded content,
templates and foreign-namespace subtrees are discarded. Inline spaces/newlines
survive, entities are escaped once, and table rows become paragraphs with ` | `
cell boundaries. Images, links, table layout and arbitrary fonts/styles are not
supported. Sanitization cannot restore text already lost in an older saved version.

Application validation is not a database integrity boundary. The checked-in schema
checks confidence but its lower-only title index does not fully match trimmed/NFC
application identity. Before future category, required-text, enum/JSON-shape or
canonical uniqueness constraints, authorize a read-only legacy-data review. Inspect
invalid shapes, blank/sanitized-empty content and duplicates under an agreed Unicode
policy; preserve IDs, owners, session references and originals, with reviewed
per-row repairs, backup and rollback. Do not guess categories or blanket-delete
duplicates. No additional constraints or data repairs are applied by these helpers.
