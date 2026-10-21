import { Check, CircleAlert, Eye, EyeOff, WifiOff } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";

function errorKind(error) {
  const message = error.toLowerCase();
  if (message.includes("username is already taken") || message.includes("user already registered")) return "taken";
  if (message.includes("username or password is incorrect") || message.includes("invalid login credentials")) return "credentials";
  if (/fetch|network|connection|timed? ?out|offline/.test(message)) return "network";
  return "other";
}

export function AuthForm({ error = "", isLoading, onAuthSubmit }) {
  const { t } = useLanguage();
  const id = useId();
  const [mode, setMode] = useState("sign-in");
  const [values, setValues] = useState({ username: "", password: "", email: "" });
  const [errors, setErrors] = useState({});
  const [showPassword, setShowPassword] = useState(false);
  const [dismissedError, setDismissedError] = useState("");
  const [submitted, setSubmitted] = useState(false);
  const inputs = useRef({});
  const tabs = useRef([]);
  const pending = useRef(false);
  const isSignUp = mode === "sign-up";
  const visibleError = !isLoading && error !== dismissedError ? error : "";
  const kind = errorKind(visibleError);
  const usernameTaken = isSignUp && visibleError && kind === "taken";
  const messages = {
    username: t("authUsernameRequired", "Enter your username."),
    password: t("authPasswordRequired", "Enter your password."),
    short: t("authPasswordShort", "Use at least 6 characters."),
    email: t("authEmailInvalid", "Enter a valid email, or leave it blank."),
    taken: t("authUsernameTaken", "That username is already taken. Try another."),
  };

  useEffect(() => {
    if (!visibleError) return;
    if (kind === "taken" && isSignUp) inputs.current.username?.focus();
    else inputs.current.password?.focus();
  }, [visibleError, kind, isSignUp]);

  function changeField(field, value) {
    setValues((current) => ({ ...current, [field]: value }));
    setErrors((current) => ({ ...current, [field]: undefined }));
    if (field === "username" && usernameTaken) setDismissedError(error);
  }

  function changeMode(next, focus = false) {
    if (isLoading || pending.current) return;
    setMode(next);
    setErrors({});
    setSubmitted(false);
    setDismissedError(error);
    if (focus) tabs.current[next === "sign-in" ? 0 : 1]?.focus();
  }

  function onTabKey(event) {
    const next = event.key === "Home" ? "sign-in" : event.key === "End" ? "sign-up"
      : ["ArrowLeft", "ArrowRight"].includes(event.key) ? (isSignUp ? "sign-in" : "sign-up") : null;
    if (next) { event.preventDefault(); changeMode(next, true); }
  }

  async function handleSubmit(event) {
    event.preventDefault();
    if (isLoading || pending.current) return;
    const invalid = {};
    if (!values.username.trim()) invalid.username = "username";
    if (!values.password) invalid.password = "password";
    else if (isSignUp && values.password.length < 6) invalid.password = "short";
    if (isSignUp && values.email.trim() && inputs.current.email.validity.typeMismatch) invalid.email = "email";
    setSubmitted(true);
    setErrors(invalid);
    setDismissedError("");
    const first = Object.keys(invalid)[0];
    if (first) { inputs.current[first]?.focus(); return; }
    pending.current = true;
    try {
      await onAuthSubmit({ mode, username: values.username.trim(), password: values.password, email: values.email.trim() });
    } finally { pending.current = false; }
  }

  const loadingLabel = isSignUp ? t("authCreating", "Creating account…") : t("authSigningIn", "Signing in…");
  const status = isLoading ? loadingLabel : submitted && Object.values(errors).some(Boolean)
    ? t("authFixFields", "Please fix the highlighted fields.") : "";
  const fieldError = (field) => field === "username" && usernameTaken ? messages.taken : messages[errors[field]];
  const hint = (field) => fieldError(field) ? <span className="auth-field-error" id={`${id}-${field}-help`}><CircleAlert size={14} aria-hidden="true" />{fieldError(field)}</span> : null;

  return (
    <div className="auth-form-wrap">
      <div className={`auth-tabs${isSignUp ? " is-sign-up" : ""}`} role="tablist" aria-label={t("authAccount", "Account")}>
        {["sign-in", "sign-up"].map((tabMode, index) => (
          <button key={tabMode} id={`${id}-${tabMode}`} ref={(node) => { tabs.current[index] = node; }} type="button" role="tab"
            aria-selected={mode === tabMode} aria-controls={`${id}-panel`} tabIndex={mode === tabMode ? 0 : -1}
            disabled={isLoading} onClick={() => changeMode(tabMode)} onKeyDown={onTabKey}>
            <span aria-hidden="true">{index === 0 ? "I." : "II."}</span>{index === 0 ? t("signIn", "Sign in") : t("createAccount", "Create account")}
          </button>
        ))}
      </div>
      <form id={`${id}-panel`} role="tabpanel" aria-labelledby={`${id}-${mode}`} aria-busy={isLoading} noValidate onSubmit={handleSubmit}>
        <div className="auth-form-title" key={mode}>
          <span lang="fr">{isSignUp ? "— bienvenue" : "— bon retour"}</span>
          <h1>{isSignUp ? t("signUpTitle", "Create your workspace.") : t("signInTitle", "Sign in to your workspace.")}</h1>
          <p>{t("signInCopy", "Keep your vocabulary, grammar, pronunciation rules, quizzes, and study cards attached to your own account.")}</p>
        </div>
        <div className="auth-fields">
          <div className={`auth-field${fieldError("username") ? " has-error" : ""}`}>
            <label htmlFor={`${id}-username`}>{t("username", "Username")}</label>
            <div className="auth-input-wrap"><input id={`${id}-username`} ref={(node) => { inputs.current.username = node; }}
              autoComplete="username" autoCapitalize="none" autoCorrect="off" spellCheck={false} required readOnly={isLoading}
              aria-invalid={Boolean(fieldError("username"))} aria-describedby={fieldError("username") || isSignUp ? `${id}-username-help` : undefined}
              value={values.username} onChange={(event) => changeField("username", event.target.value)} /></div>
            {hint("username") || (isSignUp && <span className="auth-hint" id={`${id}-username-help`}>{t("immutableUsernameHint", "Used to sign in. It cannot be changed later.")}</span>)}
          </div>
          <div className={`auth-field${fieldError("password") ? " has-error" : ""}`}>
            <label htmlFor={`${id}-password`}>{t("password", "Password")}</label>
            <div className="auth-input-wrap auth-password-wrap"><input id={`${id}-password`} ref={(node) => { inputs.current.password = node; }}
              type={showPassword ? "text" : "password"} autoComplete={isSignUp ? "new-password" : "current-password"} required readOnly={isLoading}
              aria-invalid={Boolean(fieldError("password"))} aria-describedby={fieldError("password") || isSignUp ? `${id}-password-help` : undefined}
              value={values.password} onChange={(event) => changeField("password", event.target.value)} />
              <button type="button" className="auth-password-toggle" aria-label={showPassword ? t("authHidePassword", "Hide password") : t("authShowPassword", "Show password")}
                aria-pressed={showPassword} aria-controls={`${id}-password`} disabled={isLoading} onClick={() => setShowPassword((current) => !current)}>
                {showPassword ? <EyeOff size={16} aria-hidden="true" /> : <Eye size={16} aria-hidden="true" />}{showPassword ? t("authHide", "Hide") : t("authShow", "Show")}
              </button>
            </div>
            {hint("password") || (isSignUp && <span id={`${id}-password-help`} className={`auth-hint${values.password.length >= 6 ? " is-valid" : ""}`}>
              {values.password.length >= 6 && <Check size={14} aria-hidden="true" />}{t("passwordPlaceholder", "At least 6 characters")}</span>)}
          </div>
          <div className={`auth-email-row${isSignUp ? " is-expanded" : ""}`} aria-hidden={!isSignUp}>
            <div><div className={`auth-field${fieldError("email") ? " has-error" : ""}`}>
              <label htmlFor={`${id}-email`}>{t("recoveryEmail", "Recovery email")} <span className="auth-optional">· {t("optional", "optional")}</span></label>
              <div className="auth-input-wrap auth-email-input"><input id={`${id}-email`} ref={(node) => { inputs.current.email = node; }} type="email" inputMode="email"
                autoComplete="email" autoCapitalize="none" spellCheck={false} disabled={!isSignUp} readOnly={isLoading}
                aria-invalid={Boolean(fieldError("email"))} aria-describedby={`${id}-email-help`} value={values.email} onChange={(event) => changeField("email", event.target.value)} />
                {values.email.trim() && <Check size={16} className="auth-email-check" aria-hidden="true" />}</div>
              {hint("email") || <span className="auth-hint" id={`${id}-email-help`}>{t("recoveryEmailHint", "Stored only so we can add password recovery later.")}</span>}
            </div></div>
          </div>
        </div>
        {visibleError && !usernameTaken && <div className="auth-server-error" role="alert">
          {kind === "network" ? <WifiOff size={20} aria-hidden="true" /> : <CircleAlert size={20} aria-hidden="true" />}
          <div><strong>{kind === "credentials" ? t("authInvalidCredentials", "The username or password is incorrect.")
            : kind === "network" ? t("authConnectionError", "Couldn’t reach French Desk.") : t("authServerError", "Your request could not be completed.")}</strong>
          <p>{kind === "credentials" ? t("authCheckCredentials", "Check both fields and try again.")
            : kind === "network" ? t("authConnectionDetail", "Check your connection, then try again. What you typed is still here.") : error}</p></div>
        </div>}
        <button className="primary-action auth-submit" disabled={isLoading} type="submit">
          {isLoading && <span className="auth-spinner" aria-hidden="true" />}
          {isLoading ? loadingLabel : visibleError && kind !== "credentials" && !usernameTaken ? t("authRetry", "Try again")
            : isSignUp ? t("createAccount", "Create account") : t("signIn", "Sign in")}
        </button>
      </form>
      {status && <p className="sr-only" role="status" aria-live="polite">{status}</p>}
    </div>
  );
}
