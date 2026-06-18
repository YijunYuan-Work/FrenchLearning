# French Desk

French Desk is a personal French learning dashboard for collecting vocabulary, phrases, grammar notes, pronunciation rules, quizzes, and study cards. It replaces a long Google Doc with a structured workspace that supports short daily practice sessions.

## Features

- Supabase sign-in with per-user note storage
- Vocabulary, phrases, grammar, pronunciation rules, and import sections
- AI vocabulary auto-fill with Wiktionary validation
- Vocabulary-specific fields for part of speech, noun gender, verb conjugation, adjective forms, and IPA
- Daily study loop: add a note, complete study, complete quiz
- Flashcard study mode with randomized 50-card cycles
- Daily quiz with randomized non-mastered vocabulary
- English and Simplified Chinese UI modes
- Text-file vocabulary import using semicolon-separated words

## Tech Stack

- React 19
- Vite 6
- Tailwind CSS
- Supabase Auth and Postgres
- Vercel Serverless Function for AI auto-fill
- OpenAI Responses API
- Wiktionary API for vocabulary validation

## Getting Started

Install dependencies:

```bash
npm install
```

Create a local environment file:

```bash
cp .env.example .env.local
```

Fill in `.env.local`:

```env
VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key
VITE_ENABLE_DAILY_LEARNING_SYNC=false
OPENAI_API_KEY=sk-your-openai-api-key
OPENAI_AUTOFILL_MODEL=gpt-5.4-mini
```

Start the app:

```bash
npm run dev
```

Then open:

```text
http://localhost:5173
```

## Supabase Setup

Create a Supabase project, then run the SQL in:

```text
supabase/schema.sql
```

This creates:

- `notes`
- `user_preferences`
- `daily_learning_state`
- row-level security policies for per-user access
- update timestamp triggers

Daily progress and quiz state can run locally without the `daily_learning_state` table. To store daily progress and quiz state in Supabase, run the schema first, then set:

```env
VITE_ENABLE_DAILY_LEARNING_SYNC=true
```

Restart the Vite dev server after changing environment variables.

## OpenAI Auto-Fill

Vocabulary auto-fill is handled by:

```text
api/autofill-vocabulary.js
```

The flow is:

1. The user enters a French word.
2. The API validates that the word has a French Wiktionary entry.
3. OpenAI generates structured vocabulary details.
4. The app fills the editor fields for review before saving.

The OpenAI API key must stay server-side. Do not expose it with a `VITE_` prefix.

## Import Format

The Import tab accepts `.txt` files where French words are separated by semicolons:

```text
bonjour; fromage; parler; heureux;
```

Import behavior:

- duplicates are skipped
- invalid or unverifiable words are reported
- successful imports use the same AI auto-fill flow as the Add Note modal
- only failed import details are shown after import, while totals remain visible in the summary cards

## Daily Learning Loop

The Today page is built around three daily actions:

- add a note
- complete daily study
- complete daily quiz

Study cycles randomly choose up to 50 non-mastered notes. Quiz sessions randomly choose up to 20 non-mastered vocabulary words. Mastered words are skipped by the daily quiz.

## Scripts

```bash
npm run dev
npm run build
npm run preview
```

## Deployment Notes

This app is designed to deploy on Vercel.

Set these environment variables in Vercel:

- `VITE_SUPABASE_URL`
- `VITE_SUPABASE_PUBLISHABLE_KEY`
- `VITE_ENABLE_DAILY_LEARNING_SYNC`
- `OPENAI_API_KEY`
- `OPENAI_AUTOFILL_MODEL`

Run the Supabase schema before enabling cloud daily-learning sync in production.

## Project Structure

```text
api/                  Vercel serverless functions
src/api/              Supabase client data APIs
src/components/       Shared UI components
src/data/             Static options and field models
src/i18n/             Language context and Chinese dictionary
src/pages/            Setup and sign-in pages
src/services/         Client-side service wrappers
src/utils/            Quiz, daily progress, tags, grammar helpers
src/views/            Main app sections
supabase/schema.sql   Database schema and RLS policies
```

## Security Notes

- `.env.local` is ignored by git.
- Keep `OPENAI_API_KEY` server-side only.
- Supabase RLS policies are required before using the app with real user data.
- The publishable Supabase key is safe for the client, but database access must rely on RLS.

## Known Follow-Ups

- Add linting and focused tests for quiz matching, import behavior, and AI result cleanup.
- Move AI rate limiting from in-memory serverless state to a durable store.
- Improve modal accessibility with focus trapping and Escape-to-close.
- Add retry-failed-only support for bulk imports.
