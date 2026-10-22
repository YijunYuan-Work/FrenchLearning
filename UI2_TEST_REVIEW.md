# UI 2.0 Test Review

Current cleanup baseline: `2e9f111` on `UI_2.0`, including approved Auth/Setup PR #26. Its [verification record](docs/ui2-auth.md#verification) reports 114 Node tests and 162 serial Chromium cases passing. No tests or application behavior are changed by repository cleanup.

The Phase 7 review below starts at `ef8597e1` (Phase 6) and preserves behavioral contracts, historical run outcomes and limitations, not an arbitrary test-count target. Counts and loading behavior in those historical sections describe that revision.

## Inventory And Decisions

- Baseline: **114 Node tests across 13 explicitly listed files; 153 expanded Chromium cases**. The Node list includes all current intended `*.test.js` files.
- Extracted the existing synthetic Auth/REST backend into `e2e/fixtures/accounts.js`; CSV helpers into `e2e/fixtures/imports.js`. The fixture still checks request ownership and records backend mutations, not just rendered labels.
- Moved five Import/Settings cases, with their bodies unchanged, into `e2e/bureau.spec.js`. `account-lifecycle.spec.js` falls from 2,896 to about 2,360 lines. The fixture extraction is mechanical, not a new mock framework.
- The original 153 expanded test titles are all retained. [Inventory evidence](docs/ui2-final/test-inventory.json) records the before/after file allocation.
- [AST callback comparison](docs/ui2-final/test-body-parity.json) confirms all 84 original static definitions from the large lifecycle file remain across that file and Bureau. Every original callback is identical except the one added visible-row wait; parameterized definitions expand to multiple cases.
- Added four focused final-audit cases: document language/modal isolation; Auth state/error semantics; lazy-view failure containment/recovery; missing-configuration mobile overflow.
- Widened three existing Vite module-interception URLs to accept HMR query strings. Added a visible-first-row wait before the Demo deletion test reads its count. No assertion or ownership check was removed, no timeout was raised, and no sleep was added to hide a failure.

## Important Coverage Retained

| Area | What the tests prove locally |
| --- | --- |
| Auth / Demo | Synthetic account switches, stale Auth callbacks, profile/password ownership, temporary Demo CRUD/language/settings, and no ambient-account/AI side effects. |
| Daily persistence | Failed reads, explicit recovery, no destructive defaults, delayed notes/settings, legitimately empty notes, refresh, local storage errors, cloud fallback, midnight/resume, ordered writes and pending account changes. |
| Study / Quiz | Stable saved queues and position, category eligibility, historical answers, noun gender, reveal/manual correction, completion, keyboard/hidden faces, failed confidence saves and idempotent retry. |
| Note mutations | Narrow confidence patches, edit ordering, late responses, partial/all/failed deletes, retry selection and deletion tombstones. |
| Editor / AI | All category shapes, validation, Unicode duplicates, rich text, stale/uncancellable AI, manual edits, repeated Save, failed Save/retry, closure/account changes and quota/upstream errors. No real paid request. |
| Import | Both CSV modes, no-AI prepared persistence, malformed structure, BOM/CRLF/quoted multiline Unicode, cancellation, repeated resume, failed-only retry, duplicate identity and account/day ownership. |
| Settings | Independent drafts/Discard, server-confirmed Save, validation/failure/retry, learning bounds, real mock entitlement and password flow isolation. |
| Presentation | Bilingual responsive geometry, native navigation/filter/confirmation dialogs, reduced viewport, focus restoration, reduced motion and new chunk-failure recovery. |

Similar-looking cases were not deleted where their contracts differ: failed read versus failed write; local versus cloud; A-to-B versus returning to A; committed-but-lost response versus an uncommitted write; queued versus already-started requests. These are not redundant coverage.

## Timing, Assertions And Flakiness

The fixture's explicit request gates make asynchronous ordering deterministic. Existing short waits around visual transitions and screenshots are presentation-specific, not replacements for mutation assertions. Some tests inspect CSS classes or the visual viewport because those are the actual approved layout/hidden-face contracts; backend correctness cases also inspect stored values and request ledgers.

During Phase 7 development, a focused run exposed one HMR interception miss and two incorrect new-test assumptions: Playwright role queries can still enumerate inert DOM, and Auth at that revision replaced the form with its loading card. The fixture URLs and assertions were corrected to check real focus blocking and the actual accessible loading state. The subsequent five-case focused run passed. The later approved [Auth implementation](docs/ui2-auth.md) keeps submission feedback inline and the draft mounted; the corresponding test now checks that actual behavior while preserving request/error assertions.

The first complete 156-case run exposed the Demo deletion test's immediate `count()` during lazy loading (its snapshot showed `Opening page...`, not an empty notebook). It is corrected by waiting for the first article to be visible before taking the count. This is recorded as a test timing defect revealed by the loading change, not silently labelled an entirely green first run.

The subsequent 157-case/two-worker run passed 156 cases and timed out once before opening the editor. Trace console evidence is `Failed to load resource: net::ERR_NO_BUFFER_SPACE` for `/src/App.jsx`, with an entirely blank page; no AI request had started. This is an observed browser/network-resource failure under concurrent local verification, not evidence that AI retry failed. The complete suite is rerun alone with one worker and the same 30-second limit, without automatic retries. A single successful rerun cannot establish that environment flakiness never occurs.

Final command outcomes are recorded in [the final audit](UI2_FINAL_AUDIT.md#verification): lint, all 114 Node tests and production build passed; the final complete serial E2E run passed **157/157 in 8.1 minutes**, with zero automatic retries. The prior two full-run failures remain documented above. Playwright flags the retained lifecycle file as slow (5.4 minutes); that is a maintenance observation, not a reason to remove race coverage or weaken CI. A passing rerun is not reported as an entirely green first attempt.

## Remaining Limits

- Chromium with synthetic HTTP responses is not live Supabase/RLS/quota-concurrency acceptance, provider uptime, email delivery, or a paid AI verification.
- No physical iOS/Android keyboard, Safari/Firefox, NVDA/VoiceOver or full WCAG certification is claimed. Viewport/touch/ARIA assertions complement, not replace, these checks.
- CI still retains local failure traces/screenshots without uploading them as artifacts. This optional FD-22 follow-up is documented; workflow/deployment configuration is deliberately unchanged.
- Explicit Node test enumeration is currently complete but still requires maintaining the list when adding future test files. There is no confirmed omitted current suite.
- No broad test-file split or increased browser matrix was introduced. Further extraction should follow actual ownership boundaries, not a file-length quota.

## PR #25 CI Follow-Up

[Actions run 39666738368](https://github.com/YijunYuan-Work/FrenchLearning/actions/runs/39666738368) passed 156 cases but failed the sign-in loading assertion on all three attempts. This was a synthetic configuration defect, not a loading-accessibility regression or an Auth event-ordering repair.

The account fixture supplied a fake URL to `src/lib/supabase.js`, but `src/api/auth.js` independently reads `import.meta.env.VITE_SUPABASE_URL` when deriving the username's Auth email. Secret-free CI has no such value. Reproducing the unmodified test on an isolated Vite server with all Supabase environment values empty produced the identical assertion failure, an `Invalid URL` alert and **zero token requests**. Email construction failed before the gated HTTP request; the immediately completed error transition offered no pending request for the loading assertion to observe. Local environment configuration had masked this incomplete mock.

The fixture now supplies the same synthetic origin to the Auth email-derivation module, retaining the real username helper, Supabase SDK, hook and HTTP/error handling. The test verifies the password-grant POST and synthetic email before checking the original loading status, then checks the failed-login alert, loader removal, idle form, enabled retry and exactly one request. No sleep, timeout increase, application/Auth change or design change.

The formerly failing case passed three consecutive secret-free runs with retries disabled. Lint, all 114 Node tests and production build passed (the existing bundle warning remains). `npm run test:e2e -- --workers=1 --retries=0` passed all **157 cases in 5.3 minutes**, without failures or automatic retries. GitHub CI remains a separate check on the pushed revision.
