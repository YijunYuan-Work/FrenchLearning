# Testing

French Desk uses risk-based automation to protect account-owned learning data and
recovery workflows. This guide describes the existing suite, not a proposed test
framework or a record of historical run counts. Application contracts remain in
[architecture](architecture.md), [learning and notes](learning-and-notes.md) and
[import and AI](import-and-ai.md).

## Strategy and Scope

The highest-risk failures can leave a plausible screen while corrupting saved
state. Tests therefore check user-visible feedback, outgoing requests and the
fixture's stored values together where applicable.

| Risk | Existing approach and rationale |
| --- | --- |
| Account changes during unfinished work | Delay reads/writes and switch synthetic accounts; prove ownership rather than just checking the new user's name. |
| Interrupted or overlapping persistence | Inject failures before and after a simulated commit, reload and retry; distinguish recoverable intent from completed outcomes. |
| Invalid or duplicated learning data | Exercise malformed CSV, Unicode normalization, category/shape validation and rich-text safety before checking persistence. |
| Paid upstream errors | Mock Auth, quota, Wiktionary and OpenAI; verify error contracts and call order without spending real allowance. |
| Unusable controls or layouts | Exercise keyboard/focus behavior, responsive geometry, bilingual states and reduced motion alongside functional flows. |

Functional success paths are complemented by negative, boundary and race-condition
regressions. Parameterized cases cover both import modes, confidence targets near
mastery, invalid API bodies and language/viewport combinations. These are selected
equivalence classes and boundaries, not an exhaustive cross-product or a claim of
complete coverage.

## Test Levels and Organization

| Level | Responsibility | Why this level |
| --- | --- | --- |
| Node.js domain/unit tests in [src/utils](../src/utils/) | Quiz grading/reconciliation, CSV parsing, note validation, sanitization, identity, pagination and async saver/mutation helpers | Fast, precise assertions isolate rule failures; deferred promises exercise ordering without a browser. |
| API handler tests in [autofill-vocabulary.test.js](../api/autofill-vocabulary.test.js) | Invoke the actual handler with request/response doubles and mocked `fetch`; check validation, upstream deadlines, structured errors and quota boundaries | Tests endpoint orchestration without a deployed server or paid services. This is not live HTTP/provider integration. |
| Playwright browser tests in [e2e](../e2e/) | Run the React UI, hooks, service wrappers and SDK against intercepted backend responses; verify navigation, persistence and recovery | Catches wiring/lifecycle failures that pure normalizers cannot expose. Real browser storage and reload behavior are exercised. |

The browser suite is organized around behavior:

- [account-lifecycle.spec.js](../e2e/account-lifecycle.spec.js): account transitions
  and late cross-account work, including pending learning, editor, import and profile operations.
- [language-preference.spec.js](../e2e/language-preference.spec.js): language hydration,
  rapid changes, persistence failures and account ownership.
- [quiz-confidence.spec.js](../e2e/quiz-confidence.spec.js): saved queue eligibility,
  confidence/edit ordering, uncertain writes, recovery and Quiz interaction.
- [library-mutations.spec.js](../e2e/library-mutations.spec.js): library filters/readers,
  selection, partial deletion, retry and pending mutation interactions.
- [editor-autofill.spec.js](../e2e/editor-autofill.spec.js): category-specific forms,
  editor identity, manual edits, AI errors/cancellation and Save ordering.
- [note-integrity.spec.js](../e2e/note-integrity.spec.js): draft-preserving validation,
  safe rich-text round trips and malformed legacy data.
- [import-recovery.spec.js](../e2e/import-recovery.spec.js): CSV structure/Unicode,
  duplicates, cancellation, failed-only retry, batch accounting and overnight resume.
- [daily-learning.spec.js](../e2e/daily-learning.spec.js): failed hydration, delayed
  notes/settings, local/cloud persistence, cross-tab conflicts and day rollover.
- [authentication.spec.js](../e2e/authentication.spec.js) and [demo-isolation.spec.js](../e2e/demo-isolation.spec.js):
  authentication forms and separation of disposable Demo from real-account services.
- [demo.spec.js](../e2e/demo.spec.js), [today-navigation.spec.js](../e2e/today-navigation.spec.js)
  and [study.spec.js](../e2e/study.spec.js): Demo workflows, Today goals, navigation
  and Study interaction.
- [settings.spec.js](../e2e/settings.spec.js): section drafts, profile/learning saves,
  password validation and plan-aware quota feedback.
- [workspace.spec.js](../e2e/workspace.spec.js): Setup, document language/focus,
  lazy-view recovery and cross-page Settings/Import layouts.
- [branding.spec.js](../e2e/branding.spec.js): responsive branding and asset integrity.

The authoritative Node suite list is the explicit `test` script in
[package.json](../package.json). Playwright discovers specs under `e2e/` through
[playwright.config.js](../playwright.config.js). New Node files must be added to
the script; discovery should not be assumed.

### Naming Convention

Browser specs use stable, kebab-case feature/workflow or risk names with `.spec.js`;
Node/API tests retain source-matching `.test.js` filenames. Titles state an expected
outcome and the condition that matters, using consistent feature names such as
Editor, Quiz, Study, Import, Demo and Daily Learning. Parameter labels must distinguish
every variation; titles must describe assertions, not claim live integration.
Keep useful terms such as hydration, confidence and retry, but avoid phase numbers,
design codenames and unexplained abbreviations. Do not add `should` mechanically.

Screenshot/attachment names identify the feature and state, optionally adding a
viewport or locale (`editor-desktop-validation.png`, `quiz-mobile-correct-zh.png`,
`settings-import-layout.json`). Name full-page and viewport captures distinctly.
Keep titles unique and update showcase links and `--grep` commands when renaming:
Playwright IDs and historical report paths include filenames/titles and can change.

## Fixtures, Mocks and Isolation

[accounts.js](../e2e/fixtures/accounts.js) creates fresh synthetic A/B accounts,
notes, preferences and daily state for each setup. It seeds test session cookies
and localStorage, routes Auth/REST/AI calls to an in-memory backend, and exposes a
request ledger plus stored records. Its handlers assert owner filters or payloads
for relevant mutations. Browser contexts come from Playwright's per-test fixtures,
so cookies and storage are not a shared production login.
The configuration permits fully parallel tests locally, making independent fixture
state important when separate cases execute at the same time.

The fixture rewrites selected Vite-served module configuration to use a fake
Supabase origin and choose local/cloud sync. Real application modules and the SDK
still run; the backend is a purpose-built simulation, not a general Postgres/RLS
implementation. [daily-learning.spec.js](../e2e/daily-learning.spec.js) has a separate
persistence fixture for its conflict and failure contracts.

[imports.js](../e2e/fixtures/imports.js) builds CSV from the production header
definition, escapes cells, uploads buffers and checks reconciled batch totals.
[library-data.js](../e2e/fixtures/library-data.js) supplies rich and long-content
records without rewriting production Demo data.

Shared operations are deliberately small: [editor.js](../e2e/helpers/editor.js)
opens a vocabulary draft, [quiz.js](../e2e/helpers/quiz.js) submits an answer, and
[backend-state.js](../e2e/helpers/backend-state.js) selects note PATCHes, Account A's
stored note or AI requests from the backend passed by the test. They create no
shared state and hide no setup, gates or recovery assertions. Single-spec helpers
stay beside their tests; specs never import another spec. Account/backend ownership
remains in `setupAccounts()` and Playwright's per-test browser fixtures, not the helpers.
The shared [screenshots.js](../e2e/helpers/screenshots.js) helper retains the existing
capture sequence and transition wait for Import, Settings and workspace evidence.

| Control | Technique demonstrated |
| --- | --- |
| `hold(key)` / `waitFor(key)` | Deferred gates establish that a specific request started before switching accounts, cancelling or releasing a response. |
| `failures`, `failedCreates`, `failedDeletes`, `failNoteOnce` | Selective request failures test error feedback, partial outcomes and explicit retry. |
| `lostNoteResponses` | Mutate the mock note first, then return an error: distinguish a committed-but-unconfirmed write from a rejected write. |
| AI transport overrides | Supply malformed/non-JSON responses, errors and delayed results without a real AI request. |
| Browser clock and storage controls | Exercise midnight/resume, storage exceptions and multiple local tabs under controlled conditions. |

API tests use `node:test` mocks for upstream `fetch`, restore temporary environment
values and import fresh handler module instances to isolate cache/cooldown state.
They assert one JSON response, matching status/code, quota call counts and absence
of synthetic secrets in errors. Domain tests inject small fake persistence functions
and deferred promises instead of requiring a running backend.

Role/label locators and retrying assertions describe user behavior; `expect.poll`
checks asynchronous stored outcomes. Request gates make race ordering explicit
instead of hoping a sleep reproduces it. Some presentation tests also use CSS,
geometry, module interception or short transition waits; this is not a claim that
every test is timing-independent. Captured screenshots support inspection, not a
configured pixel-diff baseline for the entire application.

## Representative Scenarios

### Cross-Account Async Isolation

**Existing test:** [keeps pending Daily Learning, Quiz and Study writes owned by Account A](../e2e/account-lifecycle.spec.js#L37).

**Risk:** late work from one account could overwrite another account's daily state
after an Auth switch, even while the UI shows the correct new username.

**Controlled setup and actions:** snapshot B's daily state; hold A's daily POST
and PATCH responses. As A, reveal a Quiz answer, flip Study and add a note. Wait
until A's writes are registered, switch to B, then release A's requests.

**Key assertions:** B's Study displays `B-word-2`; A's stored Add Note flag,
revealed Quiz answer and Study flip update under A. B's daily snapshot is unchanged
and `backend.writes(ids.B)` is empty. Already-started A writes may finish: safety
means preserving ownership, not pretending cancellation undoes server work.

**Why it matters / techniques:** protects shared-browser users through controlled
async interleaving, state snapshots, request ownership checks and UI/backend
assertions. A rendered heading alone would miss the corruption risk.

### Quiz Persistence and Recovery

**Existing tests:** [restores Quiz confidence target 2 after a committed write loses its response](../e2e/quiz-confidence.spec.js#L210)
and the same parameterized test with `target 4` (initial confidence 1 or 3).

**Risk:** retrying a correct answer after an uncertain write could award confidence
twice or lose the unfinished Quiz answer on refresh.

**Controlled setup and actions:** mark A's note for `lostNoteResponses`, answer it
correctly, observe Retry, reload and explicitly retry the restored answer. The
fixture commits the note change, then returns HTTP 400 to simulate the failed
acknowledgement; it does not actually drop a network packet.

**Key assertions:** the mock note already holds the target while daily Quiz still
records a pending answer. Reload restores the typed answer. Retry displays the
recovered confidence and the stored value stays at the original target. Both
PATCH bodies contain `[target, target]`, not a recalculated increment. Two attempts
are allowed; duplicate confidence gains are not.

**Why it matters / techniques:** demonstrates fault injection after a state change,
reload-based recovery, boundary data at mastery and idempotent state assertions.
This proves the tested fixed-target retry path, not an atomic transaction or
strict exactly-once scoring across independent devices.

### CSV Import Failure Recovery

**Existing test family:** [preserves the vocabulary Import batch across repeated cancel and resume](../e2e/import-recovery.spec.js#L94)
and [retries only failed vocabulary Import rows and preserves failures after cancellation](../e2e/import-recovery.spec.js#L132).
Both scenarios also run for `phrases` Imports.

**Risk:** a partially completed import could report false success, repeat saved
rows, lose failed rows or confuse unprocessed rows with retryable failures.

**Controlled setup and actions:** hold selected row POSTs, cancel while a save is
in flight, navigate away/back and resume repeatedly. The first scenario includes
an uppercase duplicate and an existing note. The second rejects selected creates,
cancels a failed-only retry, then separately retries failures and resumes untouched rows.

**Key assertions:** `expectBatch` checks added/skipped/failed/unprocessed totals
against the original batch. A cancelled run never says all rows were imported;
failed-only recovery can remain incomplete while unprocessed rows exist. The POST
ledger proves successes are not resubmitted, duplicates are skipped and untouched
rows are not sent by failed-only retry. Stored notes contain the expected unique
successes, and the Add Note goal is written once for the batch/day. The cancel/resume
case also asserts no AI requests.

**Why it matters / techniques:** combines state-transition testing, data-driven CSV
modes, selective failures, duplicate equivalence classes and request/store oracles.
It validates recoverable partial success, not a rollback transaction.

## Running and Debugging

Use the [README setup](../README.md#run-locally) and Node.js 22, matching CI. No
production credentials or paid AI calls are needed for the mocked test paths.
From the repository root:

```bash
npm run check
npx playwright install chromium
npm run test:e2e
```

Focused runs and discovery:

```bash
node --test src/utils/dailyPersistence.test.js
node --test api/autofill-vocabulary.test.js
npm run test:e2e -- --list
npm run test:e2e -- e2e/quiz-confidence.spec.js --grep "restores Quiz confidence target" --workers=1 --retries=0
```

Playwright starts Vite on `http://127.0.0.1:5173` and reuses an existing server only
outside CI. Ensure that port is free or serves this checkout; a different/stale
server can invalidate a local run. Local workers use Playwright's default sizing
and retries default to zero. A single worker with `--retries=0` is useful when
investigating ordering and distinguishing a clean run from retry-assisted success.

Add `--headed` to inspect the browser or `--debug` for Playwright Inspector.
Failure screenshots and retained traces are written under ignored `test-results/`.
Open an actual trace with `npx playwright show-trace path/to/trace.zip`, replacing
the example path. Some specs attach geometry data or capture extra states for
local inspection. No generated evidence needs to be committed.

### Reports and Failure Diagnostics

Ordinary local runs keep the `list` console reporter. To opt into CI-style reports
without changing local workers or retries, set `PLAYWRIGHT_REPORTS=1` before running
the tests. For example, in PowerShell:

```powershell
$env:PLAYWRIGHT_REPORTS = "1"
npm run test:e2e
Remove-Item Env:PLAYWRIGHT_REPORTS
```

CI enables the same built-in reporters automatically:

| Output | Purpose |
| --- | --- |
| Console `list` | Readable progress and failures in the Actions logs. |
| `playwright-report/` | HTML results on success or failure, including errors, retry attempts and attached diagnostics in its `data/` directory. |
| `test-results/junit.xml` | Machine-readable JUnit output for external tools; not a separate GitHub test-check publisher. |
| `test-results/results.json` | Structured input to the [summary script](../scripts/playwright-summary.js); not uploaded as another redundant report. |

In GitHub, open **Actions > CI > the relevant run**, read the job summary, then
download **playwright-results** from **Artifacts**. Unzip the entire artifact,
keeping its directory structure. From the repository root (so `npx` uses the
project's installed Playwright version), pass the path to the extracted report:

```bash
npx playwright show-report path/to/extracted/playwright-report
```

Replace the example path with your extraction location. Keep `playwright-report/data/`
and the report's other files together, not just
`index.html`. The HTML reporter copies attached screenshots, traces and existing
attachments (such as geometry JSON) into this portable folder. CI uploads it once
alongside `test-results/junit.xml`, not another copy of the raw diagnostics.
Ad hoc screenshots saved by tests without `testInfo.attach()` are not included.

Select a failed test and its attempt to inspect the error, screenshot and trace.
Trace Viewer can also open a downloaded trace directly:

```bash
npx playwright show-trace path/to/trace.zip
```

Replace the example with an actual `.zip` in `playwright-report/data/` (downloaded)
or `test-results/` (local). Traces include actions, DOM snapshots and network
activity. Screenshots are automatic only on failure; traces are retained for failed
attempts, including an earlier failure when a retry later passes. Existing explicit
test attachments can still be present for passing cases.

The summary counts final test outcomes from Playwright JSON, not console logs or
individual attempts. **Passed** means the expected outcome (including any intentional
expected-failure test); **flaky** means a test needed a retry to reach its expected
outcome. Skipped tests are shown separately from executed tests. HTML retains the
attempt history; JUnit is useful for interchange but its failure count alone is
not the flaky-test summary. Runner-level errors are reported separately: counts
alone cannot prove a run succeeded.

The [official upload action](https://github.com/actions/upload-artifact) retains
artifacts for **7 days**; downloading requires GitHub access. Reports
are not a permanent hosted dashboard. All report paths are already ignored by
[.gitignore](../.gitignore). Use only synthetic fixture data: screenshots/traces
can expose DOM content, request headers and bodies. Do not reuse real sessions,
credentials or personal notes in reporting runs; there is no automatic secret
redaction guarantee.

## CI and Current Limits

[GitHub Actions](../.github/workflows/ci.yml) runs on PRs and pushes to `main`:
Ubuntu, Node.js 22, npm cache, `npm ci`, `npm run check`, Chromium installation
with system dependencies, then `npm run test:e2e`. The job has a 20-minute timeout.
[Playwright configuration](../playwright.config.js) forbids focused tests in CI,
uses one worker there and allows two retries. A 10-minute CI-only global test
timeout gives the runner an opportunity to finalize reports before the job limit;
dependency/browser installation also consumes job time, so forced termination can
still prevent reporting. Per-test timeouts and local execution limits are unchanged.

Summary and artifact steps run after successful or failed E2E execution, without
`continue-on-error`. A failed test still fails CI; a flaky test that passes a retry
retains the existing retry-assisted success behavior and is identified in reports.
If E2E was skipped, no report is claimed. If it started but produced no files, the
summary says so and upload tolerates missing files. Cancellation/forced termination
does not guarantee an artifact. GitHub upload availability must be checked in the
actual run, not inferred from local report generation.

- **Live integration:** mocked Auth/REST/provider behavior cannot establish deployed
  Supabase RLS/grants, real quota concurrency, email delivery or provider availability.
  A separately authorized nonproduction integration suite would complement it.
- **Browser and accessibility scope:** the configured project is Chromium. Viewport,
  focus and ARIA checks are useful but not Safari/Firefox, physical mobile keyboard,
  screen-reader or full WCAG certification. Targeted cross-engine/manual acceptance
  remains future work, not an existing browser matrix.
- **Mock fidelity:** synthetic JWTs/routes are not a security engine. Fixtures and
  Vite-module interception must evolve with real client contracts; they do not
  validate every production network boundary or deployment behavior.
- **Measurement:** code coverage reporting and historical flaky-test trend tracking
  remain future work. No coverage percentage is claimed; test counts are deliberately
  not used as a quality target.
- **Maintainability:** explicit Node test enumeration can omit a newly added file
  unless the script is updated. Preserve focused regression intent as fixtures
  evolve instead of expanding an unbounded test matrix or generic framework.
