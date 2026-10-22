# UI 2.0: Authentication And Setup

## Authority And Scope

Implementation branch: `codex/ui2-auth-setup`, based on
`UI_2.0` at `4ea02c4a5049f0ec228022a7012fdc2110661735`.
The four approved AuthPage, AuthForm, Stage 4 X, and Stage 4 XI HTML documents
are visual references only; none of their prototype runtime is shipped.

The authentication API, username identity helpers, Auth hook, account ownership,
language preference persistence, Demo restrictions, and configuration checks are
unchanged. No schema, deployment, CI, dependencies, or completed workspace view
was changed.

## Implementation

- `SignInPage` composes the dictionary cover, responsive entry strip, and bright
  authentication sheet. Entrance animations finish once per mount rather than
  replaying when the viewport crosses a breakpoint.
- `AuthCover` reuses the existing `Brand` and original tricolore asset. Its
  bilingual contents reflect the real navigation groups.
- `AuthForm` owns only presentation and draft state: accessible keyboard tabs,
  submit-time validation, password visibility, field-level errors, server errors,
  and actual request pending feedback. Switching modes and failed submissions
  retain all values. Recovery email remains optional signup metadata.
  Passwords are submitted byte-for-byte, including whitespace; only an empty
  password and the specified signup minimum length are checked in the form.
- A small `App` presentation latch distinguishes initial session hydration from
  submission. Initial hydration still shows the existing workspace status;
  active submission keeps the form mounted, read-only, busy, and guarded against
  duplicate submissions. The existing Auth event immediately opens the real
  workspace; no simulated success or artificial delay was added.
- `SetupPage` retains the exact configuration and SQL instructions, with numbered
  steps and an internally scrolling, keyboard-focusable environment example.
- `auth.css` is scoped to these pages. New operational strings are translated.

## Visual Evidence

The retained combined captures place approved source left and React right.
Individual reference/app duplicates and raw inspection diagnostics were removed
during pre-release cleanup; their original versions remain at Git baseline
`2e9f111`. The approved HTML source files are retained unchanged.

| State | Comparison |
| --- | --- |
| Desktop Sign In, 1440 x 900 | [Desktop](ui2-auth/comparison/desktop-in.png) |
| Desktop Create Account, Chinese | [Chinese signup](ui2-auth/comparison/desktop-up-zh.png) |
| Connection failure and manual retry | [Recovery](ui2-auth/comparison/form-network.png) |
| Mobile Sign In, 390 x 844 | [English mobile](ui2-auth/comparison/mobile-390.png) |
| Mobile signup validation, 375 x 812 | [Chinese mobile](ui2-auth/comparison/mobile-375-zh.png) |
| Setup, 1200 x 760 | [Desktop setup](ui2-auth/comparison/setup-desktop.png) |
| Setup, Chinese, 375 x 812 | [Mobile setup](ui2-auth/comparison/setup-mobile.png) |

Captures use DPR 1. Source frame borders can add one raster pixel; gallery form
content is about 433px versus 440px in the app. Prototype phone/status-bar/keyboard
chrome is intentionally absent from the website, which uses native scrolling and
safe-area padding instead of fixed-height clipping. Original checks also covered
320/768/1024/1280px, input focus, reduced motion and console errors; physical OS
keyboard acceptance remains separate.

Review corrected title wrapping, form spacing, translated contents, focused error
colors and inherited code size. Existing Newsreader/Instrument Sans and CJK
fallbacks remain; code uses system monospace rather than adding JetBrains Mono.
Zero tracking makes the headword slightly wider, and the fixed 39px desktop title
retains the approved line break without negative tracking. These are deliberate
fidelity boundaries, not claims of pixel parity.

## Verification

Focused coverage verifies actual synthetic Auth request bodies, username-to-email
derivation, signup metadata with/without recovery email, failed credentials,
username taken, connection failure and explicit retry, draft retention, duplicate
submission protection, busy/read-only controls, first-invalid/error focus,
password visibility and opaque-password preservation, keyboard tabs, translations, responsive layouts, and reduced
motion. The Phase 7 test now verifies inline request status rather than a removed
full-page submission loader; its real token-request and failure assertions remain.

- `npm run lint`: passed, no warnings.
- `npm run test`: 114 passed, no failures/skips.
- `npm run build`: passed; the existing >500kB bundle warning remains.
- `npm run test:e2e -- --workers=1 --retries=0`: 162 passed in 5.0 minutes,
  zero retries, failures, or skips. This includes the existing account lifecycle,
  Demo isolation, daily persistence, import, editor, learning, and final-audit tests.
- `git diff --check`: passed. Auth/API/hooks/lib/schema/dependency/config and
  completed-view preservation comparison against the base has no diff.
- Interactive in-app-browser Auth load: no captured warning/error console entries.

During test development, the first focused invocation did not start because new
tests used a fixture argument instead of Playwright's required object destructuring.
That declaration was corrected; the focused nine-test run and the final full run
passed. No timeout increases, sleeps, or automatic retries masked a test failure.
Two earlier full runs also passed. The complete suite was rerun after the
animation-cancellation refinement and again after the password-preservation
correction; the final source passed all 162 tests with zero retries.

## Acceptance Limits

Auth and persistence tests use synthetic Supabase services; no live accounts,
credentials, production databases, or paid AI calls were used. Physical iOS and
Android keyboards, VoiceOver/NVDA, live Supabase delivery and RLS, GitHub CI, and
product acceptance are separate checks. Backend error details outside the known
mapped cases retain their original text. Email verification/password recovery
and no-session signup behavior are not newly implemented. No PR or merge is
performed by this task.
