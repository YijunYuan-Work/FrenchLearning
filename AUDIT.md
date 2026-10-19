# French Desk Project Audit

Audit date: 2026-10-19 (America/Toronto). Reviewed baseline: `712361b9dd0f3eb3d1b2901d4d1f9aa2d75b6ff1` on `main`, after fetching and confirming no divergence from `origin/main`. Audit branch: `codex/comprehensive-project-audit`.

This is an audit, not an implementation. Only this document is changed. No production accounts, data, secrets, database schema, permissions, deployments, or platform configuration were inspected or modified. Runtime reproductions used the local app, disposable browser storage, fake users, and intercepted Supabase/OpenAI/Wiktionary responses.

## 1. Executive Summary

The application has a sensible foundation for a personal project: a small React shell, dedicated data hooks and API wrappers, pure learning/import helpers, owner-scoped SQL policies, a secure atomic quota RPC, and working automated checks. PR1-PR4 improvements are present; exact Quiz grading, category-aware learning identity, trimmed French persistence, authenticated preference validation, paginated note loading, and the updated AI fallback are not being proposed again.

The largest remaining weakness is coordination of asynchronous state. Authentication, notes, preferences, and daily sessions load independently, but their consumers sometimes treat incomplete or failed loads as authoritative. That can erase progress or write one account's state under another account. The public demo also bypasses persistence only in selected features, leaving Settings and AI connected to the ambient Auth session.

There are **25 findings: 4 P1, 17 P2, and 4 P3; no P0 was established**. P1 means address before promoting the project as a reliable public portfolio application. P2 means a meaningful correctness, accessibility, or maintainability issue. P3 means a lower-impact or optional refinement. A passing build and test suite do not currently exercise the main failure scenarios below.

Highest-value work:

1. Isolate every public-demo operation from real account APIs (FD-01).
2. Distinguish failed/unloaded daily state from successfully loaded empty state (FD-02, FD-03).
3. Bind state and asynchronous completions to the current account (FD-04).
4. Repair language preference races, day rollover, and stale snapshot writes (FD-05 through FD-07).
5. Add regression coverage around those concrete failures while repairing them (FD-21).

Finding labels distinguish **confirmed** behavior, **potential risks requiring verification**, and **optional improvements**. "Confirmed in mocked runtime" means actual application modules ran with controlled local dependencies; it does not assert that a production incident has occurred.

## 2. Current Architecture Overview

| Layer | Current responsibility | Assessment |
| --- | --- | --- |
| `src/App.jsx` | Auth lifecycle, preference hydration, active view, editor model, shared filtering, daily-task orchestration | Broad, but size alone is not a defect. Specific lifecycle coupling is the issue. |
| `src/hooks/useNotes.js` | Note hydration, CRUD, selection, optimistic confidence writes | Useful boundary; mutation ordering and account ownership need strengthening. |
| `src/hooks/useDailyLearningState.js` | Loads daily progress/Quiz/Study and persists changed snapshots | Main reliability hotspot: hydration, write readiness, ownership, date changes. |
| `src/api/dailyLearning.js` | Optional Supabase persistence; otherwise user/date-keyed localStorage | One persistence entry point is good. Failure/fallback and merge semantics are incomplete. |
| `src/hooks/useImportJob.js` | Import state retained across view navigation, cancellation, per-category processing | Correctly lives above the Import view. Job generation/account boundaries and terminal reporting need work. |
| `src/utils/*` | Pure grading, queue construction, normalization, CSV parsing, rich text | Existing pure helpers are valuable and mostly straightforward. |
| `src/views/*`, `src/components/*` | Learning flows, forms, cards, navigation, reusable controls | Shared note views avoid unnecessary duplication; narrow accessibility and async-form fixes are preferable to a redesign. |
| `src/api/auth.js`, `profile.js`, `preferences.js` | Synthetic-email username authentication, profile metadata, settings | Immutable username repair and explicit preference auth assertions are present. Recovery email is currently metadata only. |
| `api/autofill-vocabulary.js` | Bearer authentication, Wiktionary verification, quota RPC, structured OpenAI response | Authorization/quota design is much improved; input coverage and upstream failure handling need attention. |
| `supabase/schema.sql`, existing patch | Tables, owner policies, triggers, secure quota implementation | Reviewed as source. Actual deployed schema/grants/advisors were not queried. |
| `e2e/`, Node tests, GitHub Actions | Demo smoke tests, pure utility regressions, lint/build verification | Good baseline; signed-in lifecycle and failures are largely untested. |

Security controls that should be retained: no service-role key in the frontend source, server-only OpenAI key use, bearer validation with `getUser(token)`, owner checks in note/preferences/daily-state policies, read-only subscription/usage access for authenticated clients, and a quota RPC with a fixed empty search path, explicit caller check, restricted execution, and an atomic capped increment. There is no evidence here of the former frontend-resettable quota design.

## 3. Verification Results

| Verification | Result | Evidence / limitation |
| --- | --- | --- |
| Git baseline | Clean, current `main` before audit branch creation | `git fetch origin main`; divergence `0 0`; baseline SHA above. |
| `npm run lint` | Passed | No reported lint errors or warnings. |
| `npm run test` | Passed | 48/48 Node tests, including PR4 regressions and >1,000-note pagination. Ran with process-spawning permission. |
| `npm run build` | Passed | Vite 6.4.3; main JS 562.66 kB, gzip 159.77 kB. Existing >500 kB warning. |
| `npm run test:e2e` | Passed | 5/5 Chromium tests, fresh contexts; local demo navigation, search, trimmed CRUD, Quiz reveal, Study reveal. |
| Additional local browser audit | Completed | Vite at `http://127.0.0.1:5175/`; desktop 1440x900 and mobile 390x844. Temporary screenshots inspected, not added to Git. |
| Controlled dependency tests | Completed | Fake Supabase module; intercepted data/Auth calls; delayed reads/writes; localStorage snapshots; controlled browser clock; mocked server `fetch`. No paid requests or live authenticated writes. |
| Production integration / SQL execution | Not run | Live RLS, migrations, email delivery, quotas, and platform settings remain unverified. SQL findings describe repository definitions. |
| Remote CI / deployment | Not triggered | This is a document-only audit. No PR, deployment, or remote configuration change is part of the audit. |

Local tools were Node `v24.16.0` and npm `11.13.0`; repository CI specifies Node 22. No dependencies were installed or upgraded. Playwright reported a harmless `NO_COLOR`/`FORCE_COLOR` warning. Its existing suite did not fail on the separately observed React `inert` warning (FD-17).

Key controlled observations:

- Delaying `getUser()` during a language toggle produced database language `zh` with visible/local language reverted to `en`.
- A cloud daily-state GET failure was followed by an upsert containing `add_note: false, study: false, quiz: false`.
- With notes withheld, opening Study changed a saved card index from 1 to 0; opening Quiz eventually persisted empty `queueIds` and `seenIds` before notes were released.
- Switching fake Auth user A to B produced writes with B's `user_id` and A's progress, Quiz IDs, and Study state.
- Moving the browser clock to the next day left Today displaying `3/3`; revealing a Study card wrote the old cycle under the new date.
- Two stale progress snapshots, saving Add Note followed by Quiz, ended with `addNote: false, quiz: true`.
- Demo Settings invoked Auth `updateUser()` against the ambient fake account. Import cancellation after 1/2 rows reported all items imported.
- Mocked AI handler calls rejected `cœur` and `œuf` with 400. A disconnected OpenAI fetch rejected the handler without a JSON response after quota reservation.

## 4. Confirmed Bugs

### FD-05 - Language changes race the preference loader

**Priority:** P2. **Category:** Preferences / localization. **Status:** Confirmed in mocked browser runtime. **Confidence:** High.

**Files:** `src/App.jsx:173-252`, `src/i18n/LanguageContext.jsx:20-27`.

**Evidence / reproduction:** Start with saved English, click Simplified Chinese, and delay the write's `getUser()` response. The preference-loading effect depends on `language`, starts another GET, and applies saved English before the Chinese write completes. Observed local/visible `en` while the eventual stored value was `zh`.

**Impact:** The switch visibly reverses, UI and cloud preference disagree, and extra GETs occur on each toggle or user-object refresh.

**Direction:** Hydrate on account identity, separately track hydration readiness and intentional user changes, and ignore stale reads/writes. A language change should not reload that account's initial preference.

### FD-06 - Daily state has no coherent midnight rollover

**Priority:** P2. **Category:** Daily progress / scheduling. **Status:** Confirmed with controlled browser time. **Confidence:** High.

**Files:** `src/hooks/useDailyLearningState.js:19-49,72-78`, `src/views/ReviewView.jsx:106-122,187-203`, `src/views/QuizView.jsx:38-85`, `src/views/TodayView.jsx:37-104`.

**Evidence / reproduction:** Load completed goals and a partially viewed Study cycle, advance the clock across local midnight without reloading, then reveal a card. Today still shows yesterday's `3/3`; Study stamps its existing cycle/index with today's date. Quiz's date check runs only when its effect dependencies change.

**Impact:** Goals fail to reset predictably; old cards/seen IDs can become the next day's session. Quota uses UTC while learning uses local dates; that distinction is also not explained in the UI.

**Direction:** Maintain one reactive local-day key, check it on resume/visibility and at the day boundary, and hydrate/reset all daily state together. Preserve an explicit policy for the separate UTC AI quota day.

### FD-10 - Editor responses and submissions lack operation identity

**Priority:** P2. **Category:** Editor / asynchronous correctness. **Status:** Late-response overwrite confirmed; repeated-save risk confirmed by code path. **Confidence:** High.

**Files:** `src/components/EditorModal.jsx:102-107,150-184,248-255,463-469`, `src/App.jsx:330-345,387-449`.

**Evidence / reproduction:** Start Auto-fill for `bonjour`, change French to `merci` while the request waits, then deliver the first result. The input becomes `bonjour` again. Closing that modal and opening another also leaves the old callback holding the shared `setForm`. Save has no pending guard; two submits can pass the same duplicate check before either resolves.

**Impact:** A response can replace newer user work, including a newly opened editor. Repeated creates can show constraint errors or duplicate demo entries; repeated edits can race.

**Direction:** Associate requests with an editor instance and requested word/language/category, invalidate or abort obsolete results, and add one pending-save guard with appropriate disabled controls. Preserve the intended rule that ordinary French edits retain other fields until a valid new Auto-fill result is applied.

### FD-11 - Cancelled imports can report complete success

**Priority:** P2. **Category:** Import / feedback. **Status:** Confirmed in mocked browser runtime. **Confidence:** High.

**Files:** `src/utils/vocabularyImport.js:34-35,96-116`, `src/hooks/useImportJob.js:80-81,164-208`, `src/views/ImportView.jsx:314-355`.

**Evidence / reproduction:** Import two phrase rows, delay row one's save, click Cancel, then finish that save. Added = 1, parsed = 2, failed = 0, yet the results say "All parsed items were imported." Both handlers return only attempted rows; cancellation has no explicit terminal status or remaining count.

**Impact:** Users can miss unprocessed notes. Retry Failed cannot resume rows that never started.

**Direction:** Report completed, failed, skipped, and unprocessed counts with a cancelled terminal state; offer resume/retry of unprocessed rows. Keep the useful current behavior of allowing an in-flight save to settle.

### FD-12 - Malformed CSV structure is accepted rather than diagnosed

**Priority:** P2. **Category:** Import / data validation. **Status:** Confirmed by direct parser execution. **Confidence:** High.

**Files:** `src/utils/importParsers.js:37-78,168-184,196-204`, `src/views/ImportView.jsx:77-100`.

**Evidence / reproduction:** `parsePhraseCsv('french,translation\n"Bonjour,Hello\nSalut,Hi')` returns one merged French cell rather than an unmatched-quote error. Extra fields are silently ignored beyond the mapped columns. Vocabulary headers are checked for presence, but duplicate names and malformed row widths are not diagnosed.

**Impact:** An accidental quote or unquoted comma can merge rows or shift learning details. Required-field validation catches some cases, but cannot guarantee the mapping is correct.

**Direction:** Validate quote closure, header ambiguity, and the documented per-format row shape; return physical row/column diagnostics before saving. Preserve BOM, CRLF, quoted commas/newlines, doubled quotes, Chinese text, and both tag separators.

### FD-13 - AI validation rejects ordinary French ligatures

**Priority:** P2. **Category:** AI / French input. **Status:** Confirmed by executing the real handler with mocked Auth. **Confidence:** High.

**Files:** `api/autofill-vocabulary.js:142-155,498-516`, `src/data/frenchCharacters.js`.

**Evidence / reproduction:** Authenticated requests for `cœur` or `œuf` return 400 before Wiktionary. The alphabet range stops at U+00FF, excluding `œ`/`Œ`, even though the character keyboard offers them.

**Impact:** Valid, common vocabulary is rejected as malformed.

**Direction:** Explicitly support French letters/ligatures using a constrained Unicode-aware rule, retain entry length/token limits, and test apostrophes and decomposed accents as well.

### FD-16 - Rich-text sanitization deletes meaningful spacing

**Priority:** P2. **Category:** Grammar editor / content integrity. **Status:** Confirmed by direct helper execution. **Confidence:** High.

**Files:** `src/utils/richText.js:36-54`, `src/components/RichTextEditor.jsx:46-71,119-124`.

**Evidence / reproduction:** Sanitizing `<p><strong>un</strong> <em>chat</em></p>` returns `<p><strong>un</strong><em>chat</em></p>`, changing the displayed text to `unchat`. Removing newlines before parsing can similarly concatenate text. Unsupported table tags also lose cell boundaries.

**Impact:** Pasted grammar content can change meaning or become unreadable after save/reopen.

**Direction:** Preserve inline text-node whitespace and useful block/cell boundaries. Prefer browser-aware parsing or a well-tested allowlist sanitizer when refining this security-sensitive boundary. No executable XSS bypass was established by this audit; the confirmed issue is content loss.

### FD-25 - Saved Quiz queues admit notes moved out of Vocabulary

**Priority:** P2. **Category:** Quiz / category integrity. **Status:** Confirmed in mocked browser runtime. **Confidence:** High.

**Files:** `src/views/QuizView.jsx:72-80,101-111,131-138`, `src/utils/quiz.js:54-65`.

**Evidence / reproduction:** Save a vocabulary Quiz queue, change one queued note's category to Phrases or Grammar, and reopen Quiz. With another eligible vocabulary note present, the reclassified item still renders as the current question: the persisted queue checks existence/confidence, not category. The controlled case displayed the phrase item `venir` in the vocabulary Quiz.

**Impact:** Vocabulary-only Quiz can test phrases or blank-meaning grammar notes and can invoke confidence progression on them.

**Direction:** Reconcile saved queues against category eligibility as well as existence, while retaining answered results according to an explicit policy. Do not regenerate valid saved queues unnecessarily.

## 5. Data Integrity and Security Findings

### FD-01 - Public demo operations can reach the real Auth session

**Priority:** P1. **Category:** Demo isolation / account safety. **Status:** Confirmed in mocked browser runtime and traced through real modules. **Confidence:** High.

**Files:** `src/App.jsx:81-88,110-139,487-525`, `src/views/SettingsView.jsx:73-96,102-205`, `src/api/profile.js:34-91`, `src/components/EditorModal.jsx:150-171`, `src/services/vocabularyAutofill.js:9-26`.

**Evidence / reproduction:** Open `/#/demo` with an ambient authenticated session, navigate to Settings, change Display name, and Save. Settings calls `updateUserProfile()`, which gets the ambient real user rather than the demo user and calls Auth `updateUser()`. The isolated reproduction recorded that mutation through the mock. Settings learning saves/quota reads also use real API wrappers. Auto-fill remains enabled and can use the real access token; unlike Import and note CRUD, it has no demo boundary. Without configuration/session, these controls instead fail or display quota errors.

**Impact:** A visitor reasonably treating the demo as disposable can alter account metadata/password or consume real AI quota. This is an application isolation bug, not an RLS bypass: the ambient token still authorizes only its real owner.

**Direction:** Propagate demo capability explicitly to Settings and the editor/service boundary. Use in-memory demo settings/quota or disable account/AI actions with clear feedback. Verify both signed-out and already-signed-in visitors, and enforce the boundary below the button as well as visually.

### FD-02 - Failed daily-state hydration enables destructive default writes

**Priority:** P1. **Category:** Daily persistence / failure recovery. **Status:** Confirmed with a mocked cloud read failure. **Confidence:** High.

**Files:** `src/hooks/useDailyLearningState.js:29-70`, `src/api/dailyLearning.js:56-76,79-115`.

**Evidence / reproduction:** Enable cloud sync, let daily-state GET return a transient error, then allow later requests to succeed. The catch installs blank progress, sets `dailyStateLoaded = true`, and the progress effect immediately upserts all three flags as false. The captured write proves that a read error is treated like a successfully loaded empty row. Successful hydration also writes snapshots back unnecessarily.

**Impact:** Existing daily achievements can be erased during ordinary network/server failures. A subsequent practice action can replace the saved Quiz/Study session with a new one.

**Direction:** Separate loading, loaded, failed, and dirty state. Do not persist defaults after a failed read; retain/retry the last known good state, and write only intentional changes after successful hydration.

### FD-03 - Session hydration can run ahead of note hydration

**Priority:** P1. **Category:** Study/Quiz resume / loading order. **Status:** Confirmed in mocked browser runtime. **Confidence:** High.

**Files:** `src/App.jsx:473-479,575-585`, `src/hooks/useNotes.js:25-42`, `src/views/ReviewView.jsx:156-185`, `src/views/QuizView.jsx:72-89`, `src/utils/studyState.js:21-27`.

**Evidence / reproduction:** Seed a same-day session, delay the notes response, and navigate to Study or Quiz after daily state loads. Both views mount against `items = []` and interpret missing notes as deleted. Study clamps index 1 to 0; Quiz persists empty queue/seen arrays. Release notes and the view builds/reconciles from the altered state.

**Impact:** Refresh/reopen on a slower connection can reset a session or lose its seen-item history despite the pure normalization tests passing.

**Direction:** Gate reconciliation on successfully loaded notes and learning settings, not merely daily-state readiness. Represent "not loaded" separately from a legitimate empty notebook; never prune queues during loading or after failed note reads.

### FD-04 - Persisted state and asynchronous completions are not account-scoped enough

**Priority:** P1. **Category:** Account switching / ownership. **Status:** Daily-state cross-account writes confirmed; late note/import completions are additional code-traced risks. **Confidence:** High for daily state; medium for the additional race scenarios.

**Files:** `src/hooks/useDailyLearningState.js:19-70`, `src/App.jsx:155-164,330-345`, `src/hooks/useNotes.js:49-78,81-105`, `src/hooks/useImportJob.js:23-28,164-202`.

**Evidence / reproduction:** After A's state has loaded, deliver an Auth event with B's session without an intervening signed-out render. The next render still has A's loaded flag/snapshots. Its persistence effects write A's progress, Quiz IDs, and Study state with B's `user_id` before B's hydration finishes. The mocked event recorded these exact payloads. Note/import writes also apply their awaited result without validating the current account or import generation; cancellation does not undo an in-flight completion.

**Impact:** A shared browser/account switch can corrupt B's progress. Late A operations can pollute B's visible note/import state. Owner RLS does not prevent submitting locally stale A content under an authorized B identity.

**Direction:** Bind hydrated state to `{userId, date}` and require that identity in every write effect. Invalidate editor/job generations on account changes and discard stale completions. Keep the guards simple: explicit identity/ref or generation checks are sufficient.

### FD-07 - Snapshot writes lose concurrent progress and have no visible sync contract

**Priority:** P2. **Category:** Persistence / concurrent updates. **Status:** Lost task flags confirmed locally; out-of-order cloud/queue writes are potential risks requiring latency tests. **Confidence:** High / medium respectively.

**Files:** `src/api/dailyLearning.js:39-53,79-115,118-189`, `src/hooks/useDailyLearningState.js:51-70`.

**Evidence / reproduction:** Load two snapshots with all tasks false. Save A with Add Note true, then save stale B with Quiz true. Final state is Add Note false, Quiz true. The same whole-snapshot policy is used for cloud progress; rapid session changes also launch unsynchronized writes. Cloud mode does not maintain a matching local mirror. Storage failures are swallowed, and broad message matching at `dailyLearning.js:15-23` can misclassify errors as a missing-table fallback.

**Impact:** Two tabs/devices can undo achievements; delayed requests can replace newer sessions. Users may see apparent success while local/cloud persistence has failed or silently changed mode.

**Direction:** Merge monotonic same-day task completion, serialize/coalesce session saves with a small revision/ownership policy, and define how local backup, conflicts, and retry work. Surface unsaved state. Do not build a generic synchronization framework for this project.

### FD-08 - Note write races and Quiz success can diverge from persisted confidence

**Priority:** P2. **Category:** Note persistence / Quiz consistency. **Status:** Failed confidence divergence confirmed; overlapping mutation overwrite is code-traced. **Confidence:** High.

**Files:** `src/hooks/useNotes.js:81-105,122-145`, `src/api/notes.js:27-43,80-93`, `src/views/QuizView.jsx:157-192,229-255,492-496`.

**Evidence / reproduction:** Submit a correct answer while the note update fails. Quiz records `correct: true` and shows advancement; the note hook rolls confidence back, swallows the rejection, and the saved Quiz skips that answer on resume. Separately, a confidence update sends the entire note row from an older snapshot; a delayed response/rollback can overwrite a more recent edit or confidence choice.

**Impact:** Quiz results promise confidence that was not saved. Overlapping operations can restore stale note fields.

**Direction:** Return an explicit mutation result or propagate failure to Quiz, retain an actionable retry state, patch only the changed fields for confidence operations, and prevent stale responses/rollbacks from replacing newer mutations on the same note.

### FD-09 - Partial bulk deletion leaves a misleading local list

**Priority:** P2. **Category:** CRUD / partial failure. **Status:** Confirmed by control-flow inspection. **Confidence:** High.

**Files:** `src/hooks/useNotes.js:183-199`, `src/api/notes.js:96-105`.

**Evidence / reproduction:** Select several notes; let one deletion succeed and another reject. `Promise.all()` rejects, so none of the local rows/selections are reconciled, although successful server deletes remain permanent.

**Impact:** Already-deleted notes stay visible and editable until a reload; retries/errors no longer match the list.

**Direction:** Reconcile per-item results with `allSettled`, or use one owner-scoped delete operation with a clear contract. Keep failed rows selected and report the partial result. Do not introduce a destructive global-delete workflow.

### FD-14 - AI upstream failures escape the endpoint's JSON contract

**Priority:** P2. **Category:** Backend reliability / quota feedback. **Status:** Disconnected fetch confirmed with mocked upstream; timeout behavior inferred from absent deadlines. **Confidence:** High.

**Files:** `api/autofill-vocabulary.js:286-318,490-501,550-633`, `src/services/vocabularyAutofill.js:15-36`, `vite.config.js:9-15`.

**Evidence / reproduction:** Allow Auth, Wiktionary, and quota reservation to succeed, then reject the OpenAI fetch. The actual handler rejects without calling `sendJson()`, and one quota request has been consumed. Non-JSON upstream responses also fail outside the final JSON-parse catch. No external fetch has an application timeout; Wiktionary retries can add multiple waits. A valid JSON body of `null` also reaches unguarded `body.word` access.

**Impact:** Generic platform errors, a stuck local handler/editor until a lower-level timeout, and confusing allowance consumption during failures. Daily quota remains bounded by the RPC; this is not an unlimited-billing claim.

**Direction:** Validate body shape; add bounded request deadlines and one top-level error-to-JSON boundary; distinguish retriable upstream failures. Explicitly document whether quota counts attempts or successful results. If refunds are later chosen, account for requests that may already have incurred cost.

### FD-15 - Required content and database shapes are weakly validated

**Priority:** P2. **Category:** Data integrity / schema boundary. **Status:** Empty manual save confirmed; malformed-row risks established from repository SQL, not live database testing. **Confidence:** High / medium respectively.

**Files:** `src/App.jsx:387-438`, `src/components/EditorModal.jsx:266-301,315-328`, `src/api/notes.js:7-43`, `supabase/schema.sql:1-25`, `src/components/LearningCard.jsx:24,198`.

**Evidence / reproduction:** Enter spaces for French and meaning and Save in the demo. HTML `required` accepts spaces; App trims French to an empty string and closes the editor. SQL requires non-null text but not nonblank content. Category/POS/gender and JSON collection shapes have no corresponding constraints; `toNote()` trusts them. An unknown category can crash icon lookup; non-array tags can break filtering/rendering. The unique index uses `lower(french)`, not trimmed text, so external writes/legacy rows can evade application duplicate identity.

**Impact:** Empty or structurally invalid notes can enter learning flows, and malformed owned rows can make the workspace unusable. RLS still protects ownership; this is not evidence of cross-user data access.

**Direction:** Validate category-specific required content and shapes before save and defensively at read boundaries. Plan a separate reviewed schema-hardening migration with a read-only legacy-data preflight and duplicate resolution before tightening constraints/indexes. Do not run a blanket cleanup against user data.

## 6. Architecture and Maintainability Findings

The architecture does not need a new router, global store, backend framework, or generic repository layer. FD-02 through FD-08 explain the concrete coupling worth changing: ownership, readiness, and mutation outcomes should be explicit at the existing hook boundaries. Retain pure helpers and the direct CSV path; file length is not a remediation criterion.

### FD-23 - Dead UI paths and misleading styling names add maintenance noise

**Priority:** P3. **Category:** Repository maintenance. **Status:** Confirmed unused paths; cleanup is optional. **Confidence:** High.

**Files:** `src/components/TodayPanel.jsx:3`, `PracticeQueue.jsx:4`, `FrenchInTheWild.jsx:4`, `src/api/auth.js:11-19`, `src/App.jsx:267-270,303-313,520-522`, `src/index.css:114-125`.

**Evidence / reproduction:** Repository-wide reference search found no consumers of the three exported components or `getCurrentUser()`. App still computes/passes unused aggregate `stats` and `weakItems`. CSS globally redefines Tailwind's `font-black`, `font-bold`, and `font-semibold` to different weights, making component class names unreliable descriptions.

**Impact:** Developers can maintain unreachable behavior or misunderstand why typography differs from its utility class. There is no need to split every wrapper component or change the visual design.

**Direction:** Remove verified dead paths/props in one small cleanup. Express the intended weight through tokens or honest component classes instead of overriding utility semantics. Keep functioning view wrappers when they help readability.

Other observations, not separate remediation requirements: all declared direct dependency groups have identifiable source/tooling uses; moving build tools from dependencies to devDependencies is optional housekeeping, not a correctness fix. The 562.66 kB bundle warrants measurement on the target device before considering targeted lazy loading. No dependency vulnerability status is asserted from old audit output; no package upgrade or advisory remediation was performed here. Legacy `english` and relative `lastReviewed` names remain known model debt, but the latter is not currently displayed or used for scheduling, so a timestamp migration is not a prerequisite for the fixes above.

## 7. UI/UX and Accessibility Findings

Visual inspection covered the current Today desktop and Vocabulary mobile views. At 390x844, there was no horizontal document overflow. Navigation, sample-data cards, and the central workflow were usable in the checked states. Long imported content, real device keyboards, all browser engines, and screen-reader output were not exhaustively verified.

### FD-17 - Hidden Study card controls remain focusable

**Priority:** P2. **Category:** Accessibility / Study. **Status:** Confirmed in Chromium DOM and console. **Confidence:** High.

**Files:** `src/views/ReviewView.jsx:363-382`, `src/index.css:91-112`.

**Evidence / reproduction:** Open Study before revealing a card. The back has `aria-hidden="true"`, but React treats `inert=""` as false and drops the attribute. Observed DOM: `inert: false`, no `inert` attribute, and an enabled Edit button on the hidden back. React logs an empty-string boolean-attribute warning.

**Impact:** Keyboard focus can enter visually hidden controls; hidden actions can be activated. Existing E2E tests pass despite the warning.

**Direction:** Supply a real boolean `inert` value, ensure only the visible face participates in keyboard navigation, and add a focus-order regression for reveal/flip-back.

### FD-18 - Controls and dynamic feedback lack complete accessibility semantics

**Priority:** P2. **Category:** Accessibility / localization. **Status:** Confirmed source/DOM omissions; screen-reader impact not directly tested. **Confidence:** High for omissions.

**Files:** `src/components/NotesToolbar.jsx:23-52`, `src/components/Sidebar.jsx:42-66`, `src/views/VocabularyView.jsx:136-159`, `src/components/LearningCard.jsx:51-57`, `src/components/EditorModal.jsx:57-100,188-196`, `src/App.jsx:570-578`, `src/i18n/LanguageContext.jsx:20-27`, `index.html:2`.

**Evidence / reproduction:** The tag select has an icon but no text label or accessible name; the search depends on placeholder text. Navigation/type choices and selection buttons convey their state visually without `aria-current`/pressed/checked semantics. Dynamic errors/results are ordinary paragraphs, generally without alert/live-region handling. Switching to Chinese leaves `<html lang="en">`. The editor traps Tab and declares a dialog, but background content is not made inert and body scroll is not locked.

**Impact:** Assistive technology cannot reliably identify filter intent, current state, or newly reported errors, and Chinese text can be pronounced with the wrong document language. Modal background isolation needs a screen-reader/touch pass.

**Direction:** Add explicit names, state attributes appropriate to the chosen control roles, deliberate live feedback, and document-language updates. Extend the existing modal rather than replacing the UI framework; verify keyboard, screen reader, and mobile scroll behavior.

### FD-19 - Chinese mode is incomplete outside primary labels

**Priority:** P2. **Category:** Localization / user feedback. **Status:** Confirmed by source and Chinese runtime inspection. **Confidence:** High.

**Files:** `src/App.jsx:67-78,455-465`, `src/components/LearningCard.jsx:52,76,84,142-170`, `src/views/ReviewView.jsx:367`, `src/components/NotesToolbar.jsx`, `src/views/NotesView.jsx:98-105,154-161`, `src/i18n/zhCN.js:85,100,180`, `api/autofill-vocabulary.js:512-565`.

**Evidence / reproduction:** Delete confirmations and card action names are hardcoded English; gender values are rendered as English enum strings. Phrase/Grammar pagination passes literal `items`, yielding mixed-language counts. Generic Previous/Next translate as previous/next card even for list pagination. Most backend/Auth failure messages bypass localization. Chinese mode still stores one meaning string per note: changing UI language does not translate previously saved meanings.

**Impact:** Success paths look localized while errors, accessibility names, and some learning instructions do not. Users can be prompted for Chinese while their existing note contains only an English answer; that content-language limitation should be made clear rather than silently assumed away.

**Direction:** Localize UI/action/error codes at presentation boundaries and use context-specific pagination labels. Define how Quiz should describe the language of existing meanings; do not automatically translate or rewrite user-authored notes.

### FD-20 - Mobile Vocabulary puts metadata ahead of the first word

**Priority:** P3. **Category:** Mobile usability. **Status:** Visually verified; improvement is optional. **Confidence:** High.

**Files:** `src/views/VocabularyView.jsx:118-199`, `src/components/Metric.jsx:12-23`.

**Evidence / reproduction:** At 390x844, four vertically stacked metrics, header actions, search, and type tabs consume the first viewport; no vocabulary card is visible. There is no horizontal overflow in this checked state.

**Impact:** Repeated lookup/review requires extra scrolling on a common mobile size.

**Direction:** Consider a compact two-column metric strip or secondary/collapsible metrics at narrow widths. Validate that the first word and useful filters become easier to reach; no desktop redesign is needed.

## 8. Testing and CI Findings

### FD-21 - Current tests omit the important persistence and failure contracts

**Priority:** P2. **Category:** Testing / misleading confidence. **Status:** Confirmed coverage gap. **Confidence:** High.

**Files:** `e2e/demo.spec.js:3-96`, `src/utils/studyState.test.js:6-68`, `src/utils/quiz.test.js`, `src/utils/accountIdentity.test.js`, `src/utils/vocabularyImport.test.js:23-45`, `api/autofill-vocabulary.test.js:6-43`, `package.json:9`.

**Evidence:** E2E covers only demo success paths and neither submits a graded answer nor verifies confidence persistence. Pure state-normalizer tests do not mount hooks or exercise read/write ordering; auth assertion tests do not cover both preference writers. The AI suite tests only RPC result normalization, not the endpoint's authentication, validation, quotas, upstream failures, or output handling. The import "no AI" test passes an unused `autoFill` option and counts calls to that never-read callback, which is weaker evidence than its name suggests. Console warnings are not asserted; FD-17 passes all tests.

**Impact:** Every reproduced lifecycle failure in this report coexists with a fully green suite.

**Direction:** Add a few deterministic mocked-client integration/browser cases for the P1 issues, midnight, preference toggling, failed confidence writes, partial delete/import, and demo account safety. Add handler tests using mocked fetch/RPC and a local-only request boundary. Use a dedicated nonproduction database only when later validating RLS/quota concurrency. Retain existing valuable normalization/import/pagination tests and add tests with each repair, not arbitrary coverage targets.

### FD-22 - CI failure evidence disappears with the runner

**Priority:** P3. **Category:** CI diagnostics. **Status:** Confirmed configuration gap; optional improvement. **Confidence:** High.

**Files:** `.github/workflows/ci.yml:1-36`, `playwright.config.js:9-13,23-26`, `package.json:9`, `README.md:120-132`.

**Evidence:** Playwright retains local failure traces/screenshots, but CI never uploads `test-results` or reports. The Node test command explicitly enumerates eight files, so a new test can be omitted accidentally. A dev machine with existing cookies/environment/server also differs from secret-free CI, although the checked E2E run used fresh contexts.

**Impact:** Remote failures are harder to investigate, and newly added regressions may never run unless the script is updated.

**Direction:** Upload failure diagnostics with limited retention and no real account data, choose a portable convention for discovering the intended Node tests, and keep demo CI independent of secrets. Consider a single mobile project or focused mobile check for the existing responsive UI; avoid a large browser matrix until it solves an observed problem. Current Node caching, single job, and check-before-browser-install order are reasonable; no major CI efficiency issue was established.

## 9. Documentation and Cleanup Findings

### FD-24 - Setup and persistence promises need a precise contract

**Priority:** P3. **Category:** Documentation / product expectations. **Status:** Confirmed inaccuracies or omissions. **Confidence:** High.

**Files:** `README.md:27,34-42,46-48,88-109,120-132`, `.env.example:3`, `src/lib/supabase.js:37-84`, `src/pages/SignInPage.jsx:151-158`, `src/api/profile.js:34-46`.

**Evidence:** README says daily sessions stay attached to the user but the example defaults cloud sync to false and does not explain same-browser-only persistence, fallback, or the meaning of enabling sync. The demo is called "read-only-style" despite local CRUD, and the local demo instruction links directly to production. Browser installation (`npx playwright install chromium`) is missing from local E2E setup. Recovery email is metadata only, as the sign-up hint acknowledges; Settings should not imply working account recovery. Auth uses session cookies without persistent expiry, which should be described accurately rather than called indefinite login persistence.

**Impact:** Users and reviewers can expect cross-device resume, recovery, or local tests to work without the required configuration.

**Direction:** Add concise mode/persistence and local verification notes, describe disposable demo behavior after FD-01, explain UTC quota reset versus local learning day, and disclose recovery as unavailable until implemented. The local ignored `AGENTS.md` is also stale about TXT/AI imports, 20-question Quiz, Vite API support, and quota fallback; update that local guidance in a separately authorized follow-up if it remains in use. Do not publish ignored agent/design working files simply to clean up documentation.

Repository hygiene positives: real local environment files, dependencies, builds, Playwright output, deployment state, and local agent/design documents are ignored. The audit did not print `.env.local` or token values, and no generated artifact needs to be committed. Existing `vercel.json` is empty but harmless. No cleanup recommendation here requires rewriting history.

## 10. Prioritized Remediation Backlog

Each row groups related IDs into a reviewable task. References below point to the full evidence above rather than introducing duplicate findings.

| Order | Task | IDs | Acceptance target |
| --- | --- | --- | --- |
| 1 | Close public-demo side effects | FD-01 | Demo profile/password/settings/quota/AI never call real account services, with or without an ambient login. |
| 2 | Make daily hydration safe | FD-02, FD-03 | Failed/unloaded reads cannot overwrite state or prune queues; delayed notes preserve saved position and order. |
| 3 | Enforce account ownership of asynchronous work | FD-04 | A-to-B switch and late completions cannot apply or persist A data for B; invalidate old import/editor work. |
| 4 | Define daily persistence and rollover | FD-06, FD-07 | Local midnight changes all daily state coherently; concurrent task completion is monotonic; newer sessions survive late writes. |
| 5 | Repair language synchronization | FD-05, FD-19 | Toggle persists without reverting; language/meaning expectations and errors are clear in both modes. |
| 6 | Make note mutations and Quiz outcomes consistent | FD-08, FD-09, FD-25 | Failed progression is retryable; overlapping writes do not replace newer content; partial deletes reconcile; queues remain vocabulary-only. |
| 7 | Protect editor and content boundaries | FD-10, FD-15, FD-16 | Stale Auto-fill cannot overwrite a newer editor; saves validate content; rich text preserves words and spacing. |
| 8 | Repair import terminal states and diagnostics | FD-11, FD-12 | Cancelled jobs report remaining rows and can resume; malformed CSV cannot silently shift data. |
| 9 | Harden AI request handling | FD-13, FD-14 | Valid French ligatures pass; bad body/upstream errors return bounded, useful responses with explicit quota semantics. |
| 10 | Apply a focused accessibility/mobile pass | FD-17, FD-18, FD-20 | Hidden controls leave focus order; labels/state/lang/feedback are accessible; mobile word access is practical. |
| 11 | Strengthen evidence and tidy documentation | FD-21, FD-22, FD-23, FD-24 | Relevant failure tests execute in CI with diagnostics; dead paths and misleading docs are removed. |

FD-15 schema work should be its own migration task after a read-only data review; frontend validation can be repaired first. Before any production security claim, separately verify actual RLS/grants, patch application, ownership checks, quota concurrency, and provider configuration in an authorized nonproduction environment. Public-signup abuse controls and provider spending limits were not inspected; their presence or absence is not asserted as a confirmed vulnerability.

## 11. Recommended Implementation Order

1. Review and approve this report; reproduce the four P1 findings in a small reusable mocked-client test harness. Keep all current checks green.
2. Ship demo isolation and daily/account lifecycle repairs in narrow changes. These establish the ownership/readiness contracts needed by later fixes.
3. Repair day transitions, snapshot ordering, and language sync. Prefer explicit hook state and operation generations over adding a state-management framework.
4. Repair note/Quiz outcomes, editor races, validation, and import reporting. Add regression tests alongside each behavior change; preserve direct prepared-CSV persistence and existing duplicate semantics.
5. Repair AI input/error handling with mocked upstream tests before making a minimal real-service verification in an approved environment. Define quota-attempt semantics before changing any reservation/refund logic.
6. Handle schema integrity in a dedicated reviewed migration with legacy-data preflight and rollback planning. Never silently discard duplicates or user content.
7. Complete accessibility, localization, mobile density, CI diagnostics, and documentation cleanup. Remove proven dead code; measure bundle impact before choosing code splitting.

The audit intentionally does not prescribe an SRS redesign, bilingual database migration, payment integration, route/state library, broad file splitting, or enterprise infrastructure. Those are separate product decisions, not prerequisites for making the existing learning workflow reliable.
