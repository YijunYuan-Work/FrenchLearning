# UI 2.0 Phase 1: Foundation and Today

Implementation branch: `codex/ui2-foundation-today`.
Base: `UI_2.0` at `e979372f3b4c3f8b2cf4ed6302732dcf58e9ad95`.

## Scope

The approved **Le Cahier / Bois** artifacts in `FrenchLearning UI 2.0 directions/` remain the visual authority. This phase implements the foundation, navigation shell and Today, not the later Study, Quiz, notebook, editor, import or settings designs.

- `tailwind.config.js` and `src/index.css`: approved paper/sheet/sky, ink/river/wood/sage and rule tokens; serif/sans stacks; compact buttons, panels, dividers, focus indicators and reduced motion. Compatibility color aliases let later views continue working. Legacy global font-weight overrides and decorative gradient washes were removed.
- `Brand`, `Sidebar`, `LanguageToggle`: original tricolour mark, numbered/grouped fixed sidebar, a 76px tablet rail, mobile bottom tabs, native modal Notes/More sheets, language segments and account actions. Sheets support Escape, keyboard containment and focus restoration. Demo still has no Sign out action.
- `AppHeader`: date, Add note and editorial rule; compact mobile wordmark/action. Existing per-section Add note behavior is preserved.
- `TodayView`: actual three-task progress, serif headline, rolling counter, filled segments, numbered/check-marked task rows, first-ready emphasis, empty notebook message and completed-plan acknowledgment.
- `App.jsx`: presentation wiring and explicit readiness props. Notes/settings loading or failure cannot masquerade as an empty notebook. Existing error/retry controls remain in place.

No hooks, API/service modules, learning utilities, database/schema, deployment configuration, dependencies or design artifacts were changed. The prototype runtime and large HTML files are not imported into the application or present in its production bundle.

## Visual Verification

Visual authority: the approved Sidebar, Today, System and Components documents
in the design-reference directory. The retained [desktop overview](ui2-final/design-comparison-1.jpg)
and [Chinese mobile overview](ui2-final/mobile-zh.jpg) show the completed shell
and Today alongside later UI 2.0 work.

The original Phase 1 captures used DPR 1, 1280 x 800 desktop and 370 x 736 mobile
content regions. The prototype phone bezel/status bar was excluded without
rescaling. Actual Demo counts and the local learning date were retained rather
than fabricated to match the source. Geometry was checked across both languages.

The original per-state captures and raw observations are consolidated into the
final review evidence. Historical files remain recoverable from Git at cleanup
baseline `2e9f111`; the readiness, empty/error and recovery contracts below and
in the tests remain unchanged. Earlier visual passes corrected sidebar density,
heading wrapping, mobile offset, next-task emphasis and sheet focus restoration.

## Fidelity Notes and Limitations

- Desktop uses the approved 248px sidebar, 60px page padding, 250px progress column and 56px Newsreader headline. Tablet uses a 76px rail and 40px padding. Mobile uses 20px padding, 34px English / 30px Chinese headings and stacked task rows. Geometry checks cover widths 320, 390, 768, 1024 and 1440 in both languages.
- The supplied tricolour was captured directly from the reference at its original 48 x 3px size, not replaced with an invented logo. Lucide React supplies the reference's standard UI icons; no icon-font runtime is required.
- Latin fonts are self-hosted variable Newsreader and Instrument Sans from the official Google Fonts repositories, with their SIL Open Font Licenses in `public/fonts/`. Their uncompressed TTF assets total about 1.14 MB; WOFF2/subsetting is a possible later optimization, not a new dependency in this phase.
- Noto Sans SC / Noto Serif SC use the same Google Fonts families as the reference, with system CJK fallbacks. Google serves Unicode subsets to compatible browsers. Restricted networks can use fallback typography, and the external stylesheet adds a network dependency. No account or learning data is sent by the font request.
- Tracking stays at normal spacing; the reference's expanded metadata tracking and negative display tracking are not reproduced. Newsreader's optical axis is set to 20 for editorial titles to retain the intended wrapping without negative tracking.
- The mobile bottom bar uses 52px touch rows and actual safe-area insets, rather than hard-coded phone chrome/gesture padding. Mobile navigation remains available in existing Study/Quiz views; their dedicated focused layouts belong to later phases.
- Progress changes animate while Today is mounted; returning from another section renders the saved final count without adding a new animation-history persistence layer. Reduced motion renders final states. No task is completed by merely clicking a row.
- Existing card counts, eligibility, confidence, session restoration and daily rollover rules are unchanged. Completed tasks can still be opened again. Loading/error feedback is driven by existing readiness and recovery paths.
- Today and shell verification recorded no console errors. Opening the unchanged Study view exposes an existing React development warning about its `inert=""` prop. The same code is present in the base branch; it is not changed or represented as fixed here.
- Later views inherit shared fonts/colors/buttons but retain their existing content layouts. This is intentionally not a full UI 2.0 migration.

## Regression Verification

Six focused E2E tests were added: real Today task navigation/completion, mobile destination/language sheets and focus restoration, bilingual viewport/reduced-motion checks, delayed/failed notes and recovery, empty/completed saved state, and real-account mobile settings/sign-out. Existing Today progress assertions now use its named live status rather than the decorative digit stack.

Results:

| Command | Result |
| --- | --- |
| `npm run lint` | Passed |
| `npm run test` | 114 passed |
| `npm run build` | Passed; existing >500 kB chunk warning remains |
| `npm run test:e2e -- --workers=4` | 134 passed |
| `git diff --check` | Passed |

The final production JS is about 762.8 kB (219.9 kB gzip). No real AI calls, production mutations, deployments, PR creation or merges were performed.

During development, several exact-URL transport stubs missed Vite's cached HMR module URLs. A clean server restart resolved those failures without changing the protected editor/service code. The reported full-suite result is from that clean run.
