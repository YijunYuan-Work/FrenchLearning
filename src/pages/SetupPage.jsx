export function SetupPage() {
  return (
    <main className="grid min-h-screen place-items-center bg-cloud px-4 py-8 text-ink">
      <section className="w-full max-w-2xl rounded-md border border-frenchBlue/10 bg-paper p-6 shadow-soft">
        <p className="text-sm font-semibold uppercase tracking-wide text-frenchRed">
          Supabase setup required
        </p>
        <h1 className="mt-1 text-3xl font-bold">
          Connect FrenchLearning to your Supabase project.
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          Create a `.env.local` file in this project with your new
          FrenchLearning Supabase values, then restart the dev server.
        </p>
        <pre className="mt-4 overflow-x-auto rounded-md bg-frenchBlue p-4 text-sm text-white">
{`VITE_SUPABASE_URL=https://your-project.supabase.co
VITE_SUPABASE_PUBLISHABLE_KEY=your-publishable-or-anon-key`}
        </pre>
        <p className="mt-4 text-sm leading-6 text-slate-600">
          After that, run the SQL in `supabase/schema.sql` inside the Supabase
          SQL Editor so notes are stored per signed-in user.
        </p>
      </section>
    </main>
  );
}
