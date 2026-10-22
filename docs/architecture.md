# Architecture and Persistence

French Desk is a React/Vite SPA with direct Supabase access for user-owned data
and a server-side vocabulary Auto-fill endpoint. There is no global state store
or background import service.

## Ownership and Module Boundaries

| Boundary | Responsibility |
| --- | --- |
| [App](../src/App.jsx) | Selects Demo or authenticated workspace; owns navigation, editor identity and import lifetime. Secondary views are lazy-loaded behind a recoverable view boundary. |
| [Auth hook](../src/hooks/useAuthSession.js) | Session lifecycle and account-generation checks; actual account changes replace account-specific workspace state. |
| [Notes hook](../src/hooks/useNotes.js) | Notebook hydration, CRUD, ordered mutations and partial-delete reconciliation. |
| [Daily hook](../src/hooks/useDailyLearningState.js) | Readiness, daily progress and ordered Quiz/Study persistence. |
| [Language hook](../src/hooks/useLanguagePreference.js) | One initial preference load per account lifecycle; newer user choices win over stale reads, and saves serialize/coalesce. Failures retain intent for retry. |
| [Import hook](../src/hooks/useImportJob.js) | Account-scoped batch state above the active view, so navigation does not stop a job. |
| [Data APIs](../src/api/) | Ownership filters, normalization and storage-specific operations. Pure rules live in `src/utils/`; views own presentation. |
| [AI endpoint](../api/autofill-vocabulary.js) | Bearer authentication, French verification, atomic quota reservation and structured provider output. |

Queued work checks its initiating account before starting. Late responses cannot
modify another account's visible workspace. Already-started requests may finish
for the original owner; cancellation is not a server rollback. Editor openings,
import jobs and learning days carry their own identities as well as account scope.

The `/#/demo` route never uses the ambient account for real operations. Notes,
preferences, settings and practice state are temporary. API guards and session
storage guards complement disabled real-account/AI/import actions; a reload resets
the sample workspace even for a signed-in visitor.

## Data and Authentication

[The schema](../supabase/schema.sql) defines `notes`, `user_preferences`, optional
`daily_learning_state`, `ai_autofill_usage` and `user_subscription_roles`. RLS
scopes ordinary user data by `auth.uid() = user_id`. Clients may read their own
usage and tier but cannot edit allowances or grant themselves a subscription.
The authenticated quota RPC, not editable profile metadata, reserves AI attempts.
Deployment grants/RLS and the [quota patch](../supabase/patches/2026-09-10-ai-autofill-quota-security.sql)
must be verified independently of frontend tests.

Username login derives a synthetic Auth email. The login username is immutable;
profile edits update display name and optional recovery-email metadata while
preserving unrelated metadata and repairing legacy username drift. Synthetic
emails are not presented as recovery addresses. Password changes verify the old
password using an isolated, initiating-account Auth client. Email verification
and email-based password recovery are not implemented. Auth storage uses browser
session cookies, not a guaranteed persistent login after browser restart.

## Local Day and Hydration

Today goals, Quiz and Study use one local calendar-day key. A midnight timer,
visibility/focus/pageshow checks and a periodic clock check detect rollover and
sleep/resume without refresh. Learning views remount for the new day; editor and
import work can continue. Old sessions and callbacks keep their original day,
cannot earn today's goals, and do not delete yesterday's stored records. AI quota
uses UTC, separately.

Loading, successful hydration and failed reads are distinct. Hydration establishes
a baseline rather than triggering a write. Failed reads cannot save defaults or
prune learning queues. Quiz/Study wait for notes, daily state and learning settings;
only a successful empty notebook is treated as empty. Explicit retry recovers reads.

## Persistence and Conflicts

- Default: account/day-keyed localStorage, authoritative only for that browser and
  origin. Opt-in `VITE_ENABLE_DAILY_LEARNING_SYNC=true` makes Supabase authoritative.
  Recognized missing daily-state schema responses use the local fallback; other
  cloud failures remain errors, not an empty state or a divergent offline copy.
- Completed goals merge monotonically from false to true. Local writes use a
  per-account/day Web Lock; cloud upserts send only completed flags.
- Quiz and Study each have one in-flight save, with newer changes coalesced behind
  it. They update independent fields. Unchanged snapshots are not re-saved.
- Session saves compare the acknowledged JSON baseline: under a Web Lock locally,
  or an atomic PostgREST JSONB equality filter in cloud mode. A create-day uniqueness
  race compares the existing session instead of blindly replacing it.
- Conflicting sessions are not automatically merged. Reload saved progress
  explicitly discards this tab's unsaved session. Read/write failures stay visible;
  Retry retains the latest pending changes. An uncertain save retries its original
  snapshot first to acknowledge a possibly committed write before newer work.

Pending/failed saves request a browser leave warning, which browsers may suppress.
There is no durable offline outbox: closing/crashing the tab before acknowledgement
can lose unsaved changes. No polling/realtime subscription refreshes other devices;
reload reads their changes, and save detects ordinary stale-session conflicts.
Without Web Locks, the local fallback serializes only within one tab.

JSON equality cannot distinguish an ABA sequence (changed away and back to exactly
the same JSON). Strict cross-client ordering would need per-session revisions and
an authenticated compare-and-set RPC with matching write restrictions. This is a
future database proposal, not an installed guarantee. Note confidence and Quiz
outcomes also remain separate writes; see [learning contracts](learning-and-notes.md).

## Maintenance and Verification Limits

`npm run check` runs lint, explicitly enumerated Node tests and a production build;
maintain that test list when adding suites. Playwright uses synthetic Auth/REST/AI
services and real browser storage. CI runs these gates but does not upload retained
failure traces/screenshots as artifacts. Live RLS/quota concurrency, provider/email
delivery, Safari/Firefox, physical keyboards and assistive technology require
separate acceptance. No production security certification follows from mock tests.

The main bundle still exceeds Vite's warning threshold despite lazy feature views.
Further splitting should follow measurements, not suppress warnings at the cost
of Auth or sanitizer safety. Existing note meanings are not translated when the
interface language changes, and unmapped backend errors can remain untranslated.
