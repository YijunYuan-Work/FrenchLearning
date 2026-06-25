import { BookOpen, CheckCircle2, Flame, Sparkles } from "lucide-react";
import { useState } from "react";
import { LanguageToggle } from "../components/LanguageToggle";
import { useLanguage } from "../i18n/LanguageContext";

export function SignInPage({ error, isLoading, onAuthSubmit }) {
  const { t } = useLanguage();
  const [mode, setMode] = useState("sign-in");
  const [username, setUsername] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const isSignUp = mode === "sign-up";

  function handleSubmit(event) {
    event.preventDefault();

    onAuthSubmit({
      email: email.trim(),
      mode,
      password,
      username: username.trim(),
    });
  }

  return (
    <main className="min-h-screen bg-cloud/80 px-4 py-8 text-ink">
      <div className="fixed right-4 top-4">
        <LanguageToggle />
      </div>
      <section className="mx-auto grid min-h-[calc(100vh-4rem)] w-full max-w-5xl items-center gap-6 lg:grid-cols-[1fr_440px]">
        <div className="hidden lg:block">
          <div className="mb-5 inline-flex items-center gap-2 rounded-full bg-butter px-3 py-1 text-sm font-medium text-ink shadow-inset">
            <Sparkles size={16} className="text-brass" />
            {t("frenchDesk", "French Desk")}
          </div>
          <h1 className="max-w-xl text-5xl font-light leading-[1.04] tracking-[-0.03em]">
            {t("signInHeroTitle", "Make today’s French practice feel light.")}
          </h1>
          <p className="mt-4 max-w-lg text-base leading-7 text-inkSecondary">
            {t(
              "signInHeroCopy",
              "Collect useful words, review what is fading, and keep a small daily rhythm without turning study into admin work."
            )}
          </p>
          <div className="mt-8 grid max-w-xl gap-3">
            {[
              t("signInBenefitOne", "A 12-minute practice loop"),
              t("signInBenefitTwo", "Vocabulary, phrases, grammar, and pronunciation together"),
              t("signInBenefitThree", "Progress cues that encourage without nagging"),
            ].map((benefit) => (
              <div
                className="flex items-center gap-3 rounded-xl border border-line bg-white/90 p-3 text-sm font-medium text-inkSecondary shadow-soft"
                key={benefit}
              >
                <CheckCircle2 size={18} className="text-sage" />
                {benefit}
              </div>
            ))}
          </div>
        </div>

        <div className="app-card mesh-panel w-full p-6 shadow-lift">
          <div className="mb-6">
          <div className="mb-4 flex items-center justify-between gap-3">
            <div className="grid size-11 place-items-center rounded-xl bg-[#1c1e54] text-white shadow-soft">
              <BookOpen size={22} />
            </div>
            <div className="inline-flex items-center gap-2 rounded-full bg-blush px-3 py-1 text-xs font-medium text-frenchRed">
              <Flame size={14} />
              {t("dailyPractice", "Daily practice")}
            </div>
          </div>
          <p className="text-sm font-medium text-frenchRed">
            {t("frenchDesk", "French Desk")}
          </p>
          <h2 className="mt-1 text-3xl font-light leading-tight tracking-[-0.02em]">
            {isSignUp
              ? t("signUpTitle", "Create your workspace.")
              : t("signInTitle", "Sign in to your workspace.")}
          </h2>
          <p className="mt-2 text-sm leading-6 text-inkSecondary">
            {t(
              "signInCopy",
              "Keep your vocabulary, grammar, pronunciation rules, quizzes, and study cards attached to your own account."
            )}
          </p>
        </div>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 rounded-full bg-sky/75 p-1">
            <button
              className={`focus-ring h-10 cursor-pointer rounded-full text-sm font-medium ${
                mode === "sign-in"
                  ? "bg-white text-frenchBlue shadow-sm"
                  : "text-inkSecondary hover:text-frenchBlue"
              }`}
              onClick={() => setMode("sign-in")}
              type="button"
            >
              {t("signIn", "Sign in")}
            </button>
            <button
              className={`focus-ring h-10 cursor-pointer rounded-full text-sm font-medium ${
                mode === "sign-up"
                  ? "bg-white text-frenchBlue shadow-sm"
                  : "text-inkSecondary hover:text-frenchBlue"
              }`}
              onClick={() => setMode("sign-up")}
              type="button"
            >
              {t("signUp", "Sign up")}
            </button>
          </div>

          <label className="grid gap-1 text-sm font-medium">
            {t("username", "Username")}
            <input
              className="focus-ring h-11 rounded-md border border-[#a8c3de] bg-white px-3 font-light shadow-sm"
              onChange={(event) => setUsername(event.target.value)}
              placeholder="john"
              required
              value={username}
            />
          </label>

          {isSignUp && (
            <label className="grid gap-1 text-sm font-medium">
              {t("recoveryEmailOptional", "Recovery email optional")}
              <input
                className="focus-ring h-11 rounded-md border border-[#a8c3de] bg-white px-3 font-light shadow-sm"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="john@example.com"
                type="email"
                value={email}
              />
              <span className="text-xs font-light text-inkMute">
                {t(
                  "recoveryEmailHint",
                  "Stored only so we can add password recovery later."
                )}
              </span>
            </label>
          )}

          <label className="grid gap-1 text-sm font-medium">
            {t("password", "Password")}
            <input
              className="focus-ring h-11 rounded-md border border-[#a8c3de] bg-white px-3 font-light shadow-sm"
              onChange={(event) => setPassword(event.target.value)}
              placeholder={t("passwordPlaceholder", "At least 6 characters")}
              required
              type="password"
              value={password}
            />
          </label>

          {error && (
            <p className="rounded-xl bg-blush p-3 text-sm font-medium text-frenchRed">
              {error}
            </p>
          )}

          <button
            className="primary-action h-11"
            disabled={isLoading}
            type="submit"
          >
            {isLoading
              ? t("working", "Working...")
              : isSignUp
                ? t("createAccount", "Create account")
                : t("signIn", "Sign in")}
          </button>
        </form>
        </div>
      </section>
    </main>
  );
}
