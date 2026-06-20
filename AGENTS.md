# AGENTS.md

Guidance for coding agents working on French Desk.

## Project Snapshot

French Desk is a personal French learning dashboard that replaced a long Google Doc. It stores structured notes for vocabulary, phrases, grammar, and pronunciation rules, then turns saved vocabulary into daily study and quiz flows.

The app is a React/Vite single-page app with Supabase Auth/Postgres for per-user data. AI vocabulary auto-fill is handled by a Vercel serverless function in `api/autofill-vocabulary.js`.

## Commands

Use these from the repository root:

```bash
npm install
npm run dev
npm test
npm run build
npm run check
```

`npm run check` is the preferred pre-handoff command. It runs the quiz utility tests and a production build.

The Vite build currently emits a chunk-size warning around the main JS bundle. Treat that as a warning, not a failed verification, unless the task is specifically about bundle splitting.

## Environment

Required local environment variables live in `.env.local`; do not commit or print real values.

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
VITE_ENABLE_DAILY_LEARNING_SYNC=false
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_AUTOFILL_MODEL=gpt-5.4-mini
```

Important:

- `OPENAI_API_KEY` must stay server-side. Never add a `VITE_` prefix to it.
- `VITE_SUPABASE_PUBLISHABLE_KEY` is safe in the browser only because RLS protects rows.
- AI auto-fill is a Vercel API route. Use a Vercel deployment or `vercel dev` when testing the real `/api/autofill-vocabulary` endpoint locally.
- Plain `npm run dev` is enough for frontend work, but may not serve the Vercel API route.

## Architecture Map

```text
api/                  Vercel serverless functions
src/api/              Supabase data/auth wrappers
src/components/       Shared UI components
src/data/             Static categories, word fields, character keyboard data
src/hooks/            Cross-view React state/persistence hooks
src/i18n/             Language context and Simplified Chinese dictionary
src/pages/            Setup and sign-in pages
src/services/         Client-side service wrappers
src/utils/            Quiz, daily progress, tags, grammar helpers and tests
src/views/            Main app sections/tabs
supabase/schema.sql   Database schema, indexes, triggers, RLS policies
```

`src/App.jsx` is still the main orchestration shell. Keep moving isolated responsibilities out of it when a change has a natural home, but do not do broad refactors during narrow bug fixes.

## Data Model

Main Supabase tables are defined in `supabase/schema.sql`:

- `notes`: user-owned learning notes.
- `user_preferences`: per-user UI language preference.
- `daily_learning_state`: optional cloud sync for daily progress and quiz state.
- `ai_autofill_usage`: per-user daily AI auto-fill usage counter.

All public tables must have RLS enabled. Policies should use `auth.uid() = user_id`.

`notes.english` is a legacy field name meaning "definition/meaning". In Chinese mode this field should contain Chinese meaning text, even though the code property remains `english`.

## Supabase Rules

- Never use a service-role key in frontend code.
- Keep user data authorization in RLS, not in React.
- When adding a table exposed through Supabase REST, add RLS policies and any needed grants.
- `daily_learning_state` is opt-in through `VITE_ENABLE_DAILY_LEARNING_SYNC=true`.
- If daily sync is disabled or the table is missing, `src/api/dailyLearning.js` falls back to localStorage.
- Run the full `supabase/schema.sql` in Supabase SQL Editor after schema changes.

## Auth And Preferences

Auth logic is in `src/api/auth.js` and follows the ApplyTrack-style username login pattern. Preferences live in `src/api/preferences.js`.

Language preference must be stored in Supabase for signed-in users. Avoid saving preference before the initial preference load completes, or the app can overwrite the saved value on startup.

## AI Vocabulary Auto-Fill

Client entry point:

```text
src/services/vocabularyAutofill.js
```

Server route:

```text
api/autofill-vocabulary.js
```

Flow:

1. User enters a French word or short expression.
2. Server authenticates the Supabase user from the bearer token.
3. Server checks AI usage limit.
4. Server validates a French Wiktionary entry first.
5. OpenAI returns strict JSON.
6. Server cleans the result and returns structured fields.
7. Editor fills fields for user review before save.

Keep these UX rules:

- Auto-fill is available only for vocabulary for now.
- Auto-fill should overwrite previous AI-filled fields only when the user clicks Auto-fill again.
- Editing the French field manually must not clear meaning, notes, example, tags, IPA, word type, gender, conjugation, or adjective forms.
- Notes and definitions must be in the active UI language: English in English mode, Simplified Chinese in Chinese mode.
- Tags should describe usage topics or contexts, not repeat word type or gender.
- Invalid/unverified words should fail before spending an OpenAI call.

## Import Flow

Import view:

```text
src/views/ImportView.jsx
```

Behavior:

- Accept `.txt` files with French entries separated by semicolons.
- Deduplicate within the file and against existing vocabulary notes.
- Each new word uses the same AI auto-fill flow as Add Note.
- Do not show every successful import in the results list; show totals plus failed items.
- Keep cancel import and retry failed only behavior.
- Import should not add duplicate notes if AI normalizes or capitalizes a word.
- Import uses slower pacing and retries temporary Wiktionary 429/503 verification failures. Keep this behavior so bulk imports do not hammer Wiktionary or mark valid words failed during temporary rate limits.

## Study, Quiz, And Daily Progress

Core quiz utilities:

```text
src/utils/quiz.js
src/utils/quiz.test.js
```

Daily learning state hook:

```text
src/hooks/useDailyLearningState.js
```

Rules:

- Daily progress has three tasks: add a note, complete daily study, complete daily quiz.
- Study shows one flashcard at a time.
- A study cycle randomly chooses up to 50 non-mastered cards.
- Quiz randomly chooses up to 20 non-mastered vocabulary notes.
- Starting another quiz or study cycle should draw from items that have not already appeared in the current day/session.
- Quiz increases confidence only on correct answers.
- Study mode must not change confidence.
- Max confidence is `4`; mastered words should not appear in future quiz queues.
- In Chinese mode, quiz asks for Chinese meaning.
- For noun quiz questions, ask gender with a dropdown rather than free text.

## Editor Modal Gotchas

Editor modal:

```text
src/components/EditorModal.jsx
```

Known decisions:

- The modal has a focus trap, Escape-to-close, and returns focus on close.
- The focus trap should install once. Keep `onClose` in a ref so typing does not re-run the focus effect.
- French input has an explicit label because the Auto-fill button sits near the label text.
- French special character keyboard should appear for all note categories.
- Auto-fill button should remain hidden outside vocabulary until AI support is added for other categories.
- Grammar notes intentionally use a simpler shape: Title, Tags, Confidence, and Grammar note. Internally the title is stored in the existing `french` field, while hidden vocabulary-style fields are cleared on save. Grammar note content is rich HTML stored in `notes`; always sanitize it through `src/utils/richText.js` before saving or rendering.
- Phrase notes use Original French, Translation, Tags, and Confidence. Original French and Translation should take the full row; internally the original French is stored in `french` and translation is stored in `english`.

## UI And Product Direction

The app should feel like a focused learning workspace, not a marketing page.

Keep:

- Dense but calm dashboard.
- Clear left navigation order: Today, Study, Quiz, Vocabulary, Phrases, Grammar, Pronunciation Rules, Import.
- No dangerous global "Clear all" button.
- Pagination for vocabulary sections; default page size should prevent long scrolling.
- Separate vocabulary tabs/groups by word type.
- Cards and controls should stay compact; avoid oversized hero/landing sections.

For new UI work, verify no overlapping text and no console errors in the browser when practical.

## I18n

Language context:

```text
src/i18n/LanguageContext.jsx
src/i18n/zhCN.js
```

Rules:

- English is the default.
- Simplified Chinese is selected through the top-right language toggle.
- Signed-in users' language preference persists through Supabase.
- Add new UI strings through `t(key, fallback, params)`.
- If adding Chinese-only labels, also include a clear English fallback at the call site.

## Verification

Before handing off code changes, prefer:

```bash
npm run check
```

For browser-facing bugs, also verify the specific behavior in the browser and check console errors. A useful target is:

```text
http://localhost:5173/
```

If testing AI auto-fill, avoid unnecessary OpenAI calls. First test local state behavior without hitting the API when possible.

## Security And Cost

- Do not log or expose `.env.local`.
- Do not print API keys or Supabase tokens.
- AI auto-fill costs money. Avoid repeated real calls during UI testing.
- `ai_autofill_usage` stores durable per-user daily usage when the schema is applied.
- If the usage table is missing, the API falls back to an in-memory limit so the app remains usable during setup.

## Git And Editing Hygiene

- The worktree may already contain user changes. Do not revert unrelated changes.
- Keep edits scoped to the requested behavior.
- Prefer existing file/module patterns over introducing new abstractions.
- Use structured helpers/parsers where they already exist.
- Add or update focused tests when changing quiz matching, confidence rules, import behavior, or data normalization.
