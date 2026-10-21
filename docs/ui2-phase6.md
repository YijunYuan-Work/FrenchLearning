# UI 2.0 Phase 6: Import & Settings

Branch: `codex/ui2-import-settings`.
Base: `UI_2.0` at `184873c` (Phases 1-5 merged, including PR #23).

## Implementation

- Import is an unframed, five-section editorial workflow: format/mode, file selection, actual first-five-row preview, real run progress, and results/recovery. Native file selection and the existing vocabulary template remain. There is no simulated drag-and-drop. CSV source rows, multiline text, Chinese, accents, tags and semantic validation remain visible rather than truncated away.
- The segmented mode buttons and file picker disable during an active run. Later sections follow real job state. The processed/total progress bar describes the current run; the separate counters and terminal summary describe the original batch. Cancellation, remaining-row resume and failed-only retry call the existing handlers without changing their meanings. Successful rows are not resubmitted or listed individually.
- Desktop previews use a semantic table. Phones turn those same rows into labeled, stacked cards. Results wrap long words/errors/source references, and mobile recovery actions fill the available width. The original batch context remains scrollable rather than replacing the page with a separate mobile-only state machine.
- Settings has four independently owned sections and keyboard-focusable section navigation. Profile and learning Save buttons remain quiet until dirty. Discard restores only that section's last confirmed values and makes no backend request. Password Discard clears only its unsaved credentials; passwords are always password inputs.
- The four native number inputs retain the exact defaults, minima, maxima and persistence contract. Minus/plus buttons respect those boundaries; direct entry, native validity and keyboard arrows still work. Tablet settings use one column so translated labels cannot overlap the controls. Phone steppers are full-width.
- AI quota uses the actual free/subscriber entitlement and used/remaining values, a proportional ten-segment indicator, real loading/refresh/error/retry, and the existing Demo restriction. No upgrade or payment UI is invented.
- Pending saves disable their own fields, not other sections. Successful values are confirmed only after the existing API resolves. Failures keep drafts. A password save that returns an equivalent user object no longer resets an unrelated profile draft. Existing account checks and keyed workspace ownership remain authoritative.
- Roman headings, Newsreader/Instrument Sans, local branding, Lucide icons, fine rules and existing paper/ink/river/wood/sage tokens match the approved notebook system. Reduced motion suppresses the new entry, spinner and progress transitions. Status/error feedback uses live statuses/alerts without duplicating result announcements.

## Preservation Boundaries

No changes to import hooks/parsers/results utilities, note mutation hooks, API services/routes, Auth, quota limits/functions, daily persistence, database/schema, deployment settings, dependencies or prior feature-page designs. The App shell changes only select the scoped Bureau presentation. AppHeader adds chapters 08/09 without changing other chapters. No prototype runtime, paid AI request or production mutation is used.

## Visual Evidence

Source: `Stage 3 - VIII Import Settings.dc.html`, supported by Components IX
and System IV. Normal desktop layouts are in the [final overview](ui2-final/design-comparison-2.jpg);
[English](ui2-final/mobile-en.jpg) and [Chinese](ui2-final/mobile-zh.jpg) overview
sheets cover mobile. Two distinct recovery examples remain:

![Cancelled/incomplete import with remaining-row recovery](ui2-phase6/comparison-import-partial.png)
![Settings save failure with retained independent drafts](ui2-phase6/comparison-settings-failure.png)

Comparisons show source left and React right, DPR 1, without resampling.
Desktop halves are 1280px wide with natural heights; source mobile content was
370 x 736 excluding device chrome. Extra comparison-canvas space is not app UI.
Original runtime checks covered both pages, EN/ZH and five widths; reduced
viewport checks used 370 x 452 rather than an invented keyboard height.

Repeated preview/progress/retry/complete and clean/dirty/saving/saved variations,
detail crops and raw geometry/console reports were consolidated. Full historical
evidence remains available at cleanup baseline `2e9f111`. The independent
draft, entitlement, batch-count and recovery contracts remain in this document
and the existing tests.

## Fidelity Decisions And Limits

- Actual data, source row numbers, saved limits, entitlement and backend error text replace prototype placeholders. The completion example retains one skipped duplicate; it correctly does not claim every row was added. Existing all-added regression coverage remains.
- The native file input is retained, including the browser's own chooser label/localization. Its empty native filename is visually suppressed because the authoritative uploaded filename appears alongside it after the existing handler resets the input value. This permits selecting the same file again without falsely displaying an empty uploaded batch.
- The existing global Add note action is retained in the Bureau header. Its actual control height makes the header slightly taller than the source, which only shows a date. The import gloss is stable CSV rather than claiming vocabulary while the phrase mode is active.
- Current-run progress uses a real bounded continuous bar rather than inventing per-run result ticks not exposed by the existing hook. Batch outcome colors and counts remain separately explicit. No second job state or parser/mutation rewrite is introduced for visual effects.
- Mobile keeps all four real learning limits, independently reachable sections and existing app bottom navigation. The static source phone omits the fourth limit and shows a cropped workflow; real content is scrollable instead of being deleted to match a short illustration.
- Source font optical sizing/external Chinese fonts and locally available Chinese fallbacks can differ slightly. No new remote font/runtime dependency is added. Normal letter spacing follows the existing implementation conventions.
- Live Supabase/RLS, production entitlement, physical mobile keyboards, Safari and assistive-technology acceptance remain separate gates. No deployment or production verification is claimed.

## Verification

The five new focused Playwright tests exercise real UI controls through mocked HTTP services: both import modes and every recovery state; independent Dirty/Discard/confirmed values; profile validation/pending/failure/retry; exact learning boundaries and failed save/retry; actual subscriber quota loading/error/refresh; password validation/failure/retry; bilingual responsive and keyboard geometry. Existing cancellation/duplicate/parser/account-switching/Demo/session/editor regressions are reused rather than copied.

Final verification:

- `npm run check`: passed, including lint, all 114 unit tests and the production build. The existing 784.80 kB JavaScript chunk warning remains a warning, not a failure.
- `npm run test:e2e -- --workers=1 --retries=0`: all 153 tests passed in 4.1 minutes, with zero failures and zero automatic retries.
- A subsequent responsive-only run passed and exported the same test's geometry attachment as `runtime.json` through Playwright's JSON reporter. No application/test code changed after the full run.
- Additional Demo-only EN/ZH checks at all five widths passed with reduced motion, no console/page errors, password inputs effectively disabled through their fieldset, quota refresh disabled and import preview unable to start a write. The historical console probe recorded zero unexpected external requests (raw report recoverable at cleanup baseline `2e9f111`). The existing Google Fonts stylesheet was fulfilled locally; production local fonts were retained. An initial probe measured before layout/fonts settled and another read the input's own disabled property instead of effective fieldset state; both harness assumptions were corrected without application changes.
- Protected API/hooks/utils/services/schema/dependency/configuration paths have no diff from the base. `git diff --check` passed.

Initial focused testing exposed a mock Auth error-format mismatch, which was corrected. An initial full run was intentionally stopped after tablet visual inspection found label/stepper overlap; the responsive grid was corrected and the added collision assertion passed before restarting the complete suite. These are not hidden automatic retries.
