# French Desk

A personal French learning workspace that turns a growing notebook into focused daily practice.

French Desk started as a replacement for a Google Doc that had become difficult to navigate. It gives vocabulary, short phrases, grammar explanations and pronunciation rules their own structure, then brings saved material back into Study and Quiz.

[Explore the public demo](https://french-learning-theta.vercel.app/#/demo)

## A Notebook Built for Practice

The completed **Le Cahier · Bois** interface pairs editorial typography and quiet paper surfaces with compact learning controls. Desktop navigation, a tablet rail and mobile sheets keep the same workspace accessible across screen sizes. English and Simplified Chinese are supported throughout the main interface.

- **Capture:** structured vocabulary with optional AI Auto-fill, phrase translations, rich-text grammar notes and pronunciation rules.
- **Find:** searchable libraries with tags and confidence indicators, plus vocabulary word-type groups and alphabetical or newest-first sorting.
- **Study:** randomized, non-mastered cards grouped as vocabulary, phrases and grammar, with resumable sessions.
- **Quiz:** vocabulary-only questions, noun gender selection, answer reveal, manual correction and confidence progression.
- **Import:** prepared vocabulary and phrase CSV files with previews, duplicate checks, cancellation and recovery.
- **Personalize:** display name, optional recovery-email metadata, password changes, learning limits and daily AI allowance.

Today tracks three goals: add a note, finish Study and finish Quiz. Default sessions contain up to 50 Quiz questions and 50 vocabulary, 20 phrase and 20 grammar Study cards. These limits are configurable; actual counts depend on available eligible notes.

### Public Demo

The demo requires no login and uses disposable sample data. Note edits, settings, language and learning progress stay in memory and reset on reload, without affecting an existing account. CSV preview is available, but saving imports, AI Auto-fill and password changes are disabled.

The demo uses the same application at `/#/demo`, including locally at `http://127.0.0.1:5173/#/demo`.

## How It Works

```text
React workspace -> owner-scoped data APIs -> Supabase Auth / Postgres
Editor Auto-fill -> Vercel API -> Auth -> Wiktionary -> quota RPC -> OpenAI
Prepared CSV -> validation / preview -> normal note saves (no AI)
```

The stack is React 19, Vite 6, Tailwind CSS, Lucide icons, Supabase and a Vercel serverless function using the OpenAI Responses API. Secondary views load on demand. Local WOFF2 fonts retain their OFL licenses; Chinese uses Noto font CSS with system fallbacks.

| Code | Responsibility |
| --- | --- |
| `src/App.jsx`, `src/hooks/` | Workspace ownership, navigation, learning state and import jobs |
| `src/views/`, `src/components/`, `src/i18n/` | Responsive interface and localization |
| `src/api/`, `src/services/`, `src/utils/` | Data access, service boundaries and pure domain helpers |
| `api/` | Authenticated, quota-controlled AI endpoint |
| `supabase/` | Schema, RLS policies and quota security patch |
| `e2e/` | Browser regressions with synthetic services |

## Run Locally

Use Node.js 22 (the CI version) and npm.

```bash
npm ci
```

Create `.env.local` from [the environment example](.env.example), using your own values:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
VITE_ENABLE_DAILY_LEARNING_SYNC=false
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_AUTOFILL_MODEL=gpt-5.4-mini
```

The two Supabase values enable account access. The OpenAI key is server-only and needed for real Auto-fill, not prepared CSV import or the demo. Never give it a `VITE_` prefix.

For a new Supabase project, apply [schema.sql](supabase/schema.sql) in its SQL Editor. Existing installations must also have the [secure quota patch](supabase/patches/2026-09-10-ai-autofill-quota-security.sql) applied before using Auto-fill. The endpoint rejects quota failures; it does not fall back to an in-memory allowance. Review SQL against your installation before applying it.

```bash
npm run dev
```

Open `http://127.0.0.1:5173/`. The Vite middleware serves the local Auto-fill endpoint; real requests still need configured Supabase, Wiktionary and OpenAI services. A missing Supabase configuration shows Setup, while the public demo remains available. `npm run build` creates `dist/`; `npm run preview` previews the frontend build, not the serverless API.

## Verify

```bash
npm run check
npx playwright install chromium
npm run test:e2e
```

`check` runs lint, Node utility/API tests and a production build. The individual commands are `npm run lint`, `npm run test` and `npm run build`. GitHub PR CI also runs Playwright with intercepted services, without production credentials or paid AI calls. These checks do not certify live RLS, email delivery, provider availability or physical-device accessibility.

## Security and Limits

- The schema uses owner-based row-level security. Browser code receives only the publishable/anon key, never an OpenAI or Supabase service-role secret.
- Notes and preferences live in Supabase. Daily goals and Quiz/Study sessions use localStorage by default, scoped to the account, local day and browser origin. Optional cloud sync requires `VITE_ENABLE_DAILY_LEARNING_SYNC=true` and the daily-state schema.
- Learning goals reset on the local calendar day; AI allowance resets on the UTC day. Free accounts get 10 attempts/day and subscribers get 1,000. Reserved attempts can remain counted after upstream failure or cancellation.
- Failed saves have recovery controls, but there is no durable offline outbox or strict cross-device transaction for Quiz confidence and results.
- UI language changes do not translate existing notes. Some freeform backend errors retain their original language.
- Recovery email is metadata, not an implemented password-reset flow. Login usernames are immutable; display names are editable. Session cookies do not promise indefinite login after a browser restart.
- Subscription tiers exist, but payments and subscription management are not connected.

## Technical Guide

- [Architecture, account ownership and persistence](docs/architecture.md)
- [Learning, note integrity and editing](docs/learning-and-notes.md)
- [CSV formats, import recovery and AI quota](docs/import-and-ai.md)
