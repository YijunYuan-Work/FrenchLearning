# French Desk

French Desk is a personal French learning workspace that turns scattered language notes into structured daily practice.

The project began as a replacement for a Google Doc that had grown too long to navigate. Vocabulary, short phrases, grammar explanations, and pronunciation rules were all stored together, making useful notes increasingly difficult to find and review. French Desk gives each kind of learning material its own structure, then brings those notes back into focused study and quiz sessions.

## The Learning Loop

The UI 2.0 workspace follows **Le Cahier · Bois**: an editorial notebook with quiet paper surfaces, bilingual reading layouts, focused flashcards, and compact learning controls. Desktop navigation and mobile sheets keep the same notes and daily practice within reach.

French Desk is built around a simple cycle:

1. Capture a vocabulary word, phrase, grammar rule, or pronunciation note.
2. Review non-mastered notes as flashcards in a randomized study session.
3. Test vocabulary in a daily quiz and increase confidence after correct answers.
4. Retire mastered vocabulary from future quiz queues.

The Today dashboard keeps this routine visible through three daily goals: add a note, complete a study session, and complete a quiz.

## What It Does

- Organizes vocabulary, short phrases, grammar notes, and pronunciation rules in separate workspaces.
- Stores vocabulary-specific details such as part of speech, IPA, noun gender, verb conjugations, adjective forms, examples, and contextual tags.
- Uses AI to auto-fill vocabulary details after validating the French entry with Wiktionary.
- Builds randomized study sessions from vocabulary, phrases, and grammar notes that have not yet been mastered.
- Creates vocabulary-only quizzes with confidence progression, noun-gender questions, answer reveal, and manual correction for close answers.
- Imports prepared vocabulary and phrase CSV files while detecting duplicates, validating rows, and reporting failures.
- Supports English and Simplified Chinese interfaces, including localized AI-generated meanings and notes.
- Keeps notes, preferences, learning settings, quiz state, and study progress attached to each signed-in user.
- Provides configurable daily quiz and study amounts from the Settings page.

Default sessions contain up to 50 vocabulary quiz questions and up to 50 vocabulary, 20 phrase, and 20 grammar study cards. Users can adjust these amounts.

## Public Demo

The public demo uses disposable sample notes. Note edits, profile details, language, learning settings, and practice progress stay in memory and reset when the page reloads. It works without an account and stays separate from any existing login. Password changes, AI auto-fill, and file imports are unavailable in the demo.

Try the [hosted demo](https://french-learning-theta.vercel.app/#/demo), or after starting the app locally, open:

```text
http://127.0.0.1:5173/#/demo
```

The same `/#/demo` path can be appended to a deployed URL for portfolio previews.

## How It Is Built

The frontend is a React 19 single-page application built with Vite and Tailwind CSS. Supabase provides authentication, Postgres storage, row-level security, and optional cloud persistence for daily learning state.

Vocabulary auto-fill runs through a Vercel serverless function so the OpenAI API key never reaches the browser. The function authenticates the user, checks their daily allowance, validates the French entry with Wiktionary, requests structured vocabulary data from OpenAI, and returns the result to the editor for review before it is saved.

Secondary learning/library/import/settings views load on demand; Today and the editor remain available in the initial shell. Local variable fonts use WOFF2 with their original character coverage and OFL licenses. Chinese uses the existing Noto font stylesheet with system fallbacks.

### Persistence And Language

Notes, language and learning settings are stored per account in Supabase. Daily goals and Quiz/Study sessions use account/day-keyed localStorage by default, so resume is limited to the same browser and origin. `VITE_ENABLE_DAILY_LEARNING_SYNC=true` enables optional Supabase synchronization when the daily-state table is installed. Read/write failures are surfaced with recovery controls; [persistence limits](docs/daily-learning-persistence.md) explain multi-device conflicts.

Learning goals reset on the user's local calendar day; AI allowance resets on the UTC day. Switching interface language does not translate existing user-authored notes. Recovery email is profile metadata only; email-based password recovery is not implemented. Sign-in cookies are browser-session cookies, not a promise of indefinite login after a browser restart.

## Import Formats

Vocabulary imports use a prepared CSV so a complete dataset can be saved directly without spending AI auto-fill quota or calling Wiktionary. Keep every header below in the file, even when some optional cells are empty:

```csv
french,chinese,part_of_speech,gender,ipa,tags,example,notes,conjugation_je,conjugation_tu,conjugation_il_elle,conjugation_nous,conjugation_vous,conjugation_ils_elles,adjective_masculine,adjective_feminine,adjective_masculine_plural,adjective_feminine_plural
école,学校,noun,feminine,/e.kɔl/,school;daily,Je vais à l'école.,A common noun.,,,,,,,,,,
```

`french`, `chinese`, and `part_of_speech` are required on every row. Supported parts of speech are `noun`, `verb`, `adjective`, `adverb`, `pronoun`, `preposition`, `conjunction`, `interjection`, `article`, and `numeral`. Noun gender can be `masculine`, `feminine`, or `masculine or feminine`. Tags may be separated with semicolons.

Short-phrase CSV files remain intentionally compact: column 1 is French, column 2 is the translation, and optional column 3 contains tags.

### Technology

- React 19 and Vite 6
- Tailwind CSS
- Supabase Auth and Postgres
- Vercel Serverless Functions
- OpenAI Responses API
- Wiktionary API

## Project Structure

```text
api/                  Vercel serverless functions
src/api/              Supabase authentication and data access
src/components/       Shared interface components
src/data/             Field definitions and demo data
src/hooks/            Cross-view state and persistence hooks
src/i18n/             Language context and Chinese translations
src/pages/            Setup and authentication pages
src/services/         Client-side service wrappers
src/utils/            Quiz, import, rich text, and learning helpers
src/views/            Dashboard sections and learning experiences
supabase/schema.sql   Database schema, triggers, and RLS policies
```

## Running Locally

Install dependencies and create a local environment file:

```bash
npm install
cp .env.example .env.local
```

Add your Supabase and OpenAI configuration to `.env.local`, then run `supabase/schema.sql` in the Supabase SQL Editor.

For an existing French Desk database, run
`supabase/patches/2026-09-10-ai-autofill-quota-security.sql` in the SQL
Editor before deploying this version. The API intentionally rejects AI
auto-fill when the secure quota function has not been installed.

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
VITE_ENABLE_DAILY_LEARNING_SYNC=false
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_AUTOFILL_MODEL=gpt-5.4-mini
```

Start the frontend:

```bash
npm run dev
```

The Vite development server routes `/api/autofill-vocabulary` through its local middleware. Real AI auto-fill still requires the appropriate local environment variables plus working OpenAI, Wiktionary, and Supabase services.

## Verification

```bash
npm run lint
npm run test
npm run build
npm run check
npx playwright install chromium
npm run test:e2e
```

`npm run check` runs ESLint, the Node utility/API tests, and a production build. Playwright covers Demo flows and synthetic authenticated accounts, including account switching, failure recovery, imports, quizzes, editor safety and responsive accessibility. Tests intercept services; they need no production credentials or paid AI calls. This does not establish live RLS, email delivery or provider availability.

GitHub Actions runs both commands for pull requests and pushes to `main`.

See [the UI 2.0 final audit](UI2_FINAL_AUDIT.md) for measured loading improvements, visual evidence and remaining design gaps, and [the test review](UI2_TEST_REVIEW.md) for coverage and verification limits. Authentication/setup screens still need an approved notebook-style design; this audit deliberately does not invent one.

## Security And Usage Limits

- User-owned tables are protected by Supabase row-level security.
- `.env.local` and deployment state are excluded from Git.
- The OpenAI API key stays in the server-side function and must never use a `VITE_` prefix.
- Free accounts receive 10 AI auto-fills per day; subscriber accounts receive up to 1,000 per day.
- Subscription roles can be read by their owner but cannot be changed from the frontend.

Payment management is not connected yet. The current subscription data model is ready for a future billing integration.
