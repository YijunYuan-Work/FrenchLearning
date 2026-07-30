# French Desk

French Desk is a personal French learning workspace that turns scattered language notes into structured daily practice.

The project began as a replacement for a Google Doc that had grown too long to navigate. Vocabulary, short phrases, grammar explanations, and pronunciation rules were all stored together, making useful notes increasingly difficult to find and review. French Desk gives each kind of learning material its own structure, then brings those notes back into focused study and quiz sessions.

## The Learning Loop

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
- Imports semicolon-separated vocabulary files and two-column phrase CSV files while detecting duplicates and reporting failures.
- Supports English and Simplified Chinese interfaces, including localized AI-generated meanings and notes.
- Keeps notes, preferences, learning settings, quiz state, and study progress attached to each signed-in user.
- Provides configurable daily quiz and study amounts from the Settings page.

Default sessions contain up to 50 vocabulary quiz questions and up to 50 vocabulary, 20 phrase, and 20 grammar study cards. Users can adjust these amounts.

## Public Demo

The app includes a read-only-style public demo populated with sample learning notes. It allows the latest interface to be viewed without creating an account or connecting to a personal Supabase workspace.

After starting the app, open:

```text
http://localhost:5173/#/demo
```

The same `/#/demo` path can be appended to a deployed URL for portfolio previews.

## How It Is Built

The frontend is a React 19 single-page application built with Vite and Tailwind CSS. Supabase provides authentication, Postgres storage, row-level security, and optional cloud persistence for daily learning state.

Vocabulary auto-fill runs through a Vercel serverless function so the OpenAI API key never reaches the browser. The function authenticates the user, checks their daily allowance, validates the French entry with Wiktionary, requests structured vocabulary data from OpenAI, and returns the result to the editor for review before it is saved.

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

Plain Vite development does not serve the Vercel API route. Use a Vercel deployment or `vercel dev` when testing real AI auto-fill requests.

## Verification

```bash
npm run check
```

This runs the focused utility tests and creates a production build.

## Security And Usage Limits

- User-owned tables are protected by Supabase row-level security.
- `.env.local` and deployment state are excluded from Git.
- The OpenAI API key stays in the server-side function and must never use a `VITE_` prefix.
- Free accounts receive 10 AI auto-fills per day; subscriber accounts receive up to 1,000 per day.
- Subscription roles can be read by their owner but cannot be changed from the frontend.

Payment management is not connected yet. The current subscription data model is ready for a future billing integration.
