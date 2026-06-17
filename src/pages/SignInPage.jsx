import { BookOpen } from "lucide-react";
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
    <main className="grid min-h-screen place-items-center bg-cloud px-4 py-8 text-ink">
      <div className="fixed right-4 top-4">
        <LanguageToggle />
      </div>
      <section className="w-full max-w-md rounded-md border border-frenchBlue/10 bg-paper p-6 shadow-soft">
        <div className="mb-6">
          <div className="mb-4 grid size-11 place-items-center rounded-md bg-frenchBlue text-white">
            <BookOpen size={22} />
          </div>
          <p className="text-sm font-semibold uppercase tracking-wide text-frenchRed">
            {t("frenchDesk", "French Desk")}
          </p>
          <h1 className="mt-1 text-3xl font-bold">
            {isSignUp
              ? t("signUpTitle", "Create your workspace.")
              : t("signInTitle", "Sign in to your workspace.")}
          </h1>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t(
              "signInCopy",
              "Keep your vocabulary, grammar, pronunciation rules, quizzes, and study cards attached to your own account."
            )}
          </p>
        </div>

        <form className="grid gap-4" onSubmit={handleSubmit}>
          <div className="grid grid-cols-2 rounded-md border border-slate-200 bg-white p-1">
            <button
              className={`focus-ring h-10 rounded-md text-sm font-semibold ${
                mode === "sign-in"
                  ? "bg-frenchBlue text-white"
                  : "text-slate-600 hover:bg-frenchBlue/8"
              }`}
              onClick={() => setMode("sign-in")}
              type="button"
            >
              {t("signIn", "Sign in")}
            </button>
            <button
              className={`focus-ring h-10 rounded-md text-sm font-semibold ${
                mode === "sign-up"
                  ? "bg-frenchBlue text-white"
                  : "text-slate-600 hover:bg-frenchBlue/8"
              }`}
              onClick={() => setMode("sign-up")}
              type="button"
            >
              {t("signUp", "Sign up")}
            </button>
          </div>

          <label className="grid gap-1 text-sm font-semibold">
            {t("username", "Username")}
            <input
              className="focus-ring h-11 rounded-md border border-slate-200 bg-white px-3 font-normal"
              onChange={(event) => setUsername(event.target.value)}
              placeholder="john"
              required
              value={username}
            />
          </label>

          {isSignUp && (
            <label className="grid gap-1 text-sm font-semibold">
              {t("recoveryEmailOptional", "Recovery email optional")}
              <input
                className="focus-ring h-11 rounded-md border border-slate-200 bg-white px-3 font-normal"
                onChange={(event) => setEmail(event.target.value)}
                placeholder="john@example.com"
                type="email"
                value={email}
              />
              <span className="text-xs font-normal text-slate-500">
                {t(
                  "recoveryEmailHint",
                  "Stored only so we can add password recovery later."
                )}
              </span>
            </label>
          )}

          <label className="grid gap-1 text-sm font-semibold">
            {t("password", "Password")}
            <input
              className="focus-ring h-11 rounded-md border border-slate-200 bg-white px-3 font-normal"
              onChange={(event) => setPassword(event.target.value)}
              placeholder="At least 6 characters"
              required
              type="password"
              value={password}
            />
          </label>

          {error && (
            <p className="rounded-md bg-frenchRed/10 p-3 text-sm font-semibold text-frenchRed">
              {error}
            </p>
          )}

          <button
            className="focus-ring h-11 rounded-md bg-frenchRed px-4 text-sm font-semibold text-white hover:bg-frenchRed/90 disabled:cursor-not-allowed disabled:opacity-60"
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
      </section>
    </main>
  );
}
