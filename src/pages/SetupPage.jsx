import { AuthBrand } from "../components/AuthCover";
import { LanguageToggle } from "../components/LanguageToggle";
import { useLanguage } from "../i18n/LanguageContext";

function Instruction({ text }) {
  return text.split("`").map((part, index) => index % 2 ? <code key={index}>{part}</code> : part);
}

export function SetupPage() {
  const { t } = useLanguage();
  return (
    <main className="setup-page">
      <header className="setup-header"><AuthBrand compact /><LanguageToggle /></header>
      <section className="setup-content">
        <div className="setup-title">
          <p>{t("setupRequired", "Supabase setup required")}</p>
          <h1>{t("setupTitle", "Connect FrenchLearning to your Supabase project.")}</h1>
        </div>
        <ol className="setup-steps">
          <li><span aria-hidden="true">i.</span><div>
            <p><Instruction text={t("setupCopy", "Create a `.env.local` file in this project with your new FrenchLearning Supabase values, then restart the dev server.")} /></p>
            <div className="setup-code"><span className="setup-filename">.env.local</span>
              <pre tabIndex={0} aria-label=".env.local"><code><span>VITE_SUPABASE_URL</span>{"=https://your-project.supabase.co\n"}<span>VITE_SUPABASE_PUBLISHABLE_KEY</span>{"=your-publishable-or-anon-key"}</code></pre>
            </div>
          </div></li>
          <li><span aria-hidden="true">ii.</span><div><p><Instruction text={t("setupSql", "After that, run the SQL in `supabase/schema.sql` inside the Supabase SQL Editor so notes are stored per signed-in user.")} /></p></div></li>
        </ol>
      </section>
    </main>
  );
}
