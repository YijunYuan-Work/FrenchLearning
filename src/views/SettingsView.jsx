import { CheckCircle2, CircleAlert, Info, KeyRound, LoaderCircle, LockKeyhole, Minus, Plus, RefreshCw, Save } from "lucide-react";
import { useCallback, useEffect, useState } from "react";
import {
  changeUserPassword,
  getAutofillUsageStatus,
  getDisplayName,
  getLoginUsername,
  getProfileRecoveryEmail,
  updateUserProfile,
} from "../api/profile";
import { updateLearningPreferences } from "../api/preferences";
import { createUpdatedProfileMetadata } from "../utils/accountIdentity";
import { useLanguage } from "../i18n/LanguageContext";
import {
  getLearningSettingLimits,
  normalizeLearningSettings,
} from "../utils/learningSettings";

function isValidOptionalEmail(email) {
  if (!email.trim()) return true;
  return /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
}

function getFriendlyProfileError(error) {
  const message = error?.message ?? "Something went wrong.";

  if (message.toLowerCase().includes("password should be at least")) {
    return "New password must be at least 6 characters.";
  }

  return message;
}

export function SettingsView({
  isDemo = false,
  isCurrentAccount,
  learningSettings,
  onLearningSettingsUpdated,
  onUserUpdated,
  user,
}) {
  const { t } = useLanguage();
  const [displayName, setDisplayName] = useState(() => getDisplayName(user));
  const [recoveryEmail, setRecoveryEmail] = useState(() =>
    getProfileRecoveryEmail(user)
  );
  const [confirmedProfile, setConfirmedProfile] = useState(() => ({ displayName: getDisplayName(user), recoveryEmail: getProfileRecoveryEmail(user) }));
  const [confirmedSettings, setConfirmedSettings] = useState(() => normalizeLearningSettings(learningSettings));
  const [activeSection, setActiveSection] = useState("profile");
  const [profileMessage, setProfileMessage] = useState("");
  const [profileError, setProfileError] = useState("");
  const [passwordMessage, setPasswordMessage] = useState("");
  const [passwordError, setPasswordError] = useState("");
  const [isSavingProfile, setIsSavingProfile] = useState(false);
  const [isChangingPassword, setIsChangingPassword] = useState(false);
  const [quotaError, setQuotaError] = useState("");
  const [quotaStatus, setQuotaStatus] = useState(null);
  const [isLoadingQuota, setIsLoadingQuota] = useState(false);
  const [settingsForm, setSettingsForm] = useState(() =>
    normalizeLearningSettings(learningSettings)
  );
  const [settingsMessage, setSettingsMessage] = useState("");
  const [settingsError, setSettingsError] = useState("");
  const [isSavingSettings, setIsSavingSettings] = useState(false);
  const [passwordForm, setPasswordForm] = useState({
    currentPassword: "",
    newPassword: "",
    confirmPassword: "",
  });

  const loadQuotaStatus = useCallback(async () => {
    if (isDemo || !user?.id || !isCurrentAccount()) return;

    setIsLoadingQuota(true);
    setQuotaError("");

    try {
      const status = await getAutofillUsageStatus(user.id);
      if (!isCurrentAccount()) return;
      setQuotaStatus(status);
    } catch (error) {
      if (isCurrentAccount()) setQuotaError(error.message);
    } finally {
      if (isCurrentAccount()) setIsLoadingQuota(false);
    }
  }, [isCurrentAccount, isDemo, user?.id]);

  const savedDisplayName = getDisplayName(user);
  const savedRecoveryEmail = getProfileRecoveryEmail(user);
  useEffect(() => {
    setDisplayName(savedDisplayName);
    setRecoveryEmail(savedRecoveryEmail);
    setConfirmedProfile({ displayName: savedDisplayName, recoveryEmail: savedRecoveryEmail });
  }, [savedDisplayName, savedRecoveryEmail]);

  useEffect(() => {
    loadQuotaStatus();
  }, [loadQuotaStatus]);

  useEffect(() => {
    setSettingsForm(normalizeLearningSettings(learningSettings));
    setConfirmedSettings(normalizeLearningSettings(learningSettings));
  }, [learningSettings]);

  async function handleProfileSubmit(event) {
    event.preventDefault();
    if (isSavingProfile || !isCurrentAccount()) return;
    setProfileError("");
    setProfileMessage("");

    if (!displayName.trim()) {
      setProfileError(
        t("profileDisplayNameRequired", "Display name is required.")
      );
      return;
    }

    if (!isValidOptionalEmail(recoveryEmail)) {
      setProfileError(
        t("profileRecoveryEmailInvalid", "Enter a valid recovery email.")
      );
      return;
    }

    setIsSavingProfile(true);

    try {
      const updatedUser = isDemo
        ? {
            ...user,
            user_metadata: createUpdatedProfileMetadata(user, { displayName, recoveryEmail }),
          }
        : await updateUserProfile({ displayName, recoveryEmail, userId: user.id, isCurrentAccount });
      if (!isCurrentAccount()) return;
      setConfirmedProfile({ displayName: getDisplayName(updatedUser), recoveryEmail: getProfileRecoveryEmail(updatedUser) });
      setDisplayName(getDisplayName(updatedUser));
      setRecoveryEmail(getProfileRecoveryEmail(updatedUser));
      onUserUpdated(updatedUser);
      setProfileMessage(t("profileSaved", "Profile updated."));
    } catch (error) {
      setProfileError(error.message);
    } finally {
      setIsSavingProfile(false);
    }
  }

  async function handlePasswordSubmit(event) {
    event.preventDefault();
    if (isDemo || isChangingPassword || !isCurrentAccount()) return;
    setPasswordError("");
    setPasswordMessage("");

    if (!passwordForm.currentPassword) {
      setPasswordError(
        t("profileCurrentPasswordRequired", "Enter your current password.")
      );
      return;
    }

    if (passwordForm.newPassword.length < 6) {
      setPasswordError(
        t("profilePasswordMinLength", "New password must be at least 6 characters.")
      );
      return;
    }

    if (passwordForm.newPassword !== passwordForm.confirmPassword) {
      setPasswordError(
        t("profilePasswordMismatch", "New passwords do not match.")
      );
      return;
    }

    setIsChangingPassword(true);

    try {
      const updatedUser = await changeUserPassword({
        newPassword: passwordForm.newPassword,
        oldPassword: passwordForm.currentPassword,
        userId: user.id,
        isCurrentAccount,
      });
      if (!isCurrentAccount()) return;
      onUserUpdated(updatedUser);
      setPasswordForm({
        currentPassword: "",
        newPassword: "",
        confirmPassword: "",
      });
      setPasswordMessage(t("profilePasswordSaved", "Password updated."));
    } catch (error) {
      const friendlyError = getFriendlyProfileError(error);
      setPasswordError(
        friendlyError === "Current password is incorrect."
          ? t("profileCurrentPasswordIncorrect", friendlyError)
          : friendlyError === "New password must be at least 6 characters."
            ? t("profilePasswordMinLength", friendlyError)
            : friendlyError
      );
    } finally {
      setIsChangingPassword(false);
    }
  }

  async function handleLearningSettingsSubmit(event) {
    event.preventDefault();
    if (isSavingSettings || !isCurrentAccount()) return;
    setSettingsError("");
    setSettingsMessage("");
    setIsSavingSettings(true);

    try {
      const savedSettings = isDemo
        ? normalizeLearningSettings(settingsForm)
        : await updateLearningPreferences(user.id, settingsForm);
      if (!isCurrentAccount()) return;
      setConfirmedSettings(savedSettings);
      setSettingsForm(savedSettings);
      onLearningSettingsUpdated(savedSettings);
      setSettingsMessage(t("settingsSaved", "Learning settings updated."));
    } catch (error) {
      setSettingsError(error.message);
    } finally {
      setIsSavingSettings(false);
    }
  }

  function updateSettingsField(key, value) {
    setSettingsForm((current) => ({
      ...current,
      [key]: value,
    }));
  }

  const settingLimits = getLearningSettingLimits();
  const profileDirty = displayName !== confirmedProfile.displayName || recoveryEmail !== confirmedProfile.recoveryEmail;
  const settingsDirty = Object.keys(settingLimits).some((key) => String(settingsForm[key]) !== String(confirmedSettings[key]));
  const passwordDirty = Object.values(passwordForm).some(Boolean);
  const sections = [
    ["profile", "i.", t("profileTitle", "Profile details")],
    ["learning", "ii.", t("settingsLearning", "Learning")],
    ["quota", "iii.", t("autofill", "AI auto-fill")],
    ["password", "iv.", t("password", "Password")],
  ];
  const settingFields = [
    ["quizVocabularyLimit", t("settingsQuizVocabulary", "Quiz vocabulary questions")],
    ["studyVocabularyLimit", t("settingsStudyVocabulary", "Study vocabulary cards")],
    ["studyGrammarLimit", t("settingsStudyGrammar", "Study grammar cards")],
    ["studyPhraseLimit", t("settingsStudyPhrases", "Study short phrase cards")],
  ];

  function discardProfile() {
    setDisplayName(confirmedProfile.displayName);
    setRecoveryEmail(confirmedProfile.recoveryEmail);
    setProfileMessage("");
    setProfileError("");
  }
  function navigateSection(id) {
    setActiveSection(id);
    const heading = document.getElementById(`settings-${id}-heading`);
    heading?.scrollIntoView({ block: "start", behavior: "instant" });
    heading?.focus({ preventScroll: true });
  }
  function feedback(error, message, dirty, pending) {
    return <div className={`settings-feedback${error ? " is-error" : message ? " is-success" : ""}`} role={error ? "alert" : "status"}>
      {error ? <><CircleAlert size={16} aria-hidden="true" />{error}</>
        : pending ? <><LoaderCircle className="bureau-spin" size={16} aria-hidden="true" />{t("working", "Working...")}</>
          : message ? <><CheckCircle2 size={16} aria-hidden="true" />{message}</>
            : dirty ? t("settingsUnsaved", "Unsaved changes") : null}
    </div>;
  }
  const discardLabel = t("settingsDiscard", "Discard changes");

  return (
    <div className="bureau-settings">
      {isDemo && <p className="bureau-notice" role="status"><Info size={16} aria-hidden="true" />{t("demoTemporaryChanges", "Demo changes are temporary and reset when you reload.")}</p>}
      <div className="settings-layout">
        <nav className="settings-nav" aria-label={t("settingsSections", "Settings sections")}>
          {sections.map(([id, numeral, label]) => <button className="focus-ring" key={id} aria-current={activeSection === id ? "location" : undefined} onClick={() => navigateSection(id)} type="button"><i aria-hidden="true">{numeral}</i>{label}</button>)}
        </nav>
        <div className="settings-sections">
          <form className="settings-section" aria-labelledby="settings-profile-heading" onSubmit={handleProfileSubmit} noValidate>
            <SettingsHeading id="profile" numeral="i." title={t("profileTitle", "Profile details")} meta={t("profileAccount", "Account")} />
            <fieldset disabled={isSavingProfile} className="settings-profile-fields">
              <label className="settings-field">
                <span>{t("profileLoginUsername", "Login username")}</span>
                <span className="settings-field-control"><span className="settings-identity"><LockKeyhole size={14} aria-hidden="true" /><input aria-label={t("profileLoginUsername", "Login username")} readOnly value={getLoginUsername(user)} /></span>
                  <small>{t("profileLoginUsernameCopy", "Used to sign in and cannot be changed.")}</small></span>
              </label>
              <label className="settings-field">
                <span>{t("profileDisplayName", "Display name")}</span>
                <input className="focus-ring" aria-label={t("profileDisplayName", "Display name")} aria-invalid={Boolean(profileError && !displayName.trim())} value={displayName} onChange={(event) => { setDisplayName(event.target.value); setProfileMessage(""); setProfileError(""); }} autoComplete="nickname" />
              </label>
              <label className="settings-field">
                <span>{t("recoveryEmailOptional", "Recovery email optional")}</span>
                <span className="settings-field-control"><input className="focus-ring" aria-label={t("recoveryEmailOptional", "Recovery email optional")} aria-invalid={Boolean(profileError && !isValidOptionalEmail(recoveryEmail))} type="email" value={recoveryEmail} onChange={(event) => { setRecoveryEmail(event.target.value); setProfileMessage(""); setProfileError(""); }} autoComplete="email" placeholder="john@example.com" />
                  <small>{t("profileRecoveryEmailCopy", "Leave blank if you do not want a recovery email yet.")}</small></span>
              </label>
            </fieldset>
            <div className="settings-actions">
              {feedback(profileError, profileMessage, profileDirty, isSavingProfile)}
              {profileDirty && <button className="settings-discard focus-ring" disabled={isSavingProfile} onClick={discardProfile} type="button">{discardLabel}</button>}
              <button className="primary-action" disabled={isSavingProfile || !profileDirty} type="submit"><Save size={16} aria-hidden="true" />{isSavingProfile ? t("working", "Working...") : t("profileSaveChanges", "Save profile")}</button>
            </div>
          </form>

          <form className="settings-section" aria-labelledby="settings-learning-heading" onSubmit={handleLearningSettingsSubmit}>
            <SettingsHeading id="learning" numeral="ii." title={t("settingsDailyAmounts", "Daily quiz and study amounts")} meta={t("settingsLearning", "Learning")} />
            <p>{t("settingsDailyAmountsCopy", "These limits control how many cards are pulled into each new quiz or study cycle.")}</p>
            <fieldset className="settings-limits" disabled={isSavingSettings}>
              {settingFields.map(([key, label]) => {
                const { min, max } = settingLimits[key];
                const value = settingsForm[key];
                const invalid = value === "" || !Number.isInteger(Number(value)) || Number(value) < min || Number(value) > max;
                return <div className="settings-limit" key={key}>
                  <div><label htmlFor={`setting-${key}`}>{label}</label><small id={`range-${key}`}>{t("settingsRange", "Range {min}–{max}", { min, max })}</small></div>
                  <div className="settings-stepper">
                    <button className="focus-ring" type="button" title={t("settingsDecrease", "Decrease {label}", { label })} aria-label={t("settingsDecrease", "Decrease {label}", { label })} disabled={Number(value) <= min} onClick={() => { updateSettingsField(key, Math.max(min, Math.min(max, Number(value) - 1))); setSettingsMessage(""); }}><Minus size={16} aria-hidden="true" /></button>
                    <input className="focus-ring" id={`setting-${key}`} aria-describedby={`range-${key}`} aria-invalid={invalid} type="number" inputMode="numeric" step={1} required min={min} max={max} value={value} onChange={(event) => { updateSettingsField(key, event.target.value); setSettingsMessage(""); setSettingsError(""); }} />
                    <button className="focus-ring" type="button" title={t("settingsIncrease", "Increase {label}", { label })} aria-label={t("settingsIncrease", "Increase {label}", { label })} disabled={Number(value) >= max} onClick={() => { updateSettingsField(key, Math.max(min, Math.min(max, Number(value) + 1))); setSettingsMessage(""); }}><Plus size={16} aria-hidden="true" /></button>
                  </div>
                </div>;
              })}
            </fieldset>
            <div className="settings-actions">
              {feedback(settingsError, settingsMessage, settingsDirty, isSavingSettings)}
              {settingsDirty && <button className="settings-discard focus-ring" type="button" disabled={isSavingSettings} onClick={() => { setSettingsForm(confirmedSettings); setSettingsMessage(""); setSettingsError(""); }}>{discardLabel}</button>}
              <button className="primary-action" disabled={isSavingSettings || !settingsDirty} type="submit"><Save size={16} aria-hidden="true" />{isSavingSettings ? t("working", "Working...") : t("settingsSaveLearning", "Save learning settings")}</button>
            </div>
          </form>

          <section className="settings-section" aria-labelledby="settings-quota-heading">
            <SettingsHeading id="quota" numeral="iii." title={t("autofill", "AI auto-fill")} meta={`${t("profileSubscription", "Subscription")} · ${isDemo ? t("demoMode", "Demo") : quotaStatus ? quotaStatus.subscriptionTier === "subscriber" ? t("profileSubscriber", "Subscriber") : t("profileFreePlan", "Free plan") : t("profileQuotaLoading", "Loading...")}`}>
              <button className="settings-refresh focus-ring" aria-label={t("profileRefreshQuota", "Refresh quota")} title={t("profileRefreshQuota", "Refresh quota")} disabled={isDemo || isLoadingQuota} onClick={loadQuotaStatus} type="button"><RefreshCw size={17} className={isLoadingQuota ? "bureau-spin" : ""} aria-hidden="true" /></button>
            </SettingsHeading>
            {isDemo ? <p className="settings-quota-demo">{t("demoAiUnavailable", "AI auto-fill is unavailable in the public demo.")}</p>
              : quotaError ? <div className="bureau-feedback is-error" role="alert"><CircleAlert size={18} aria-hidden="true" /><span>{quotaError}</span><button className="secondary-action" disabled={isLoadingQuota} onClick={loadQuotaStatus} type="button">{t("retryLoad", "Retry")}</button></div>
                : <div className="settings-quota" role="status" aria-busy={isLoadingQuota}>
                  <p className="settings-quota-number">{quotaStatus ? quotaStatus.remaining : "–"}<span>/ {quotaStatus ? quotaStatus.limit : "–"}</span></p>
                  <div><p>{t("profileAutofillRemaining", "Auto-fill remaining today")}</p>
                    <div className="settings-quota-ticks" aria-hidden="true">{Array.from({ length: 10 }, (_, index) => <span key={index} className={!isLoadingQuota && quotaStatus && index >= Math.ceil(quotaStatus.used / quotaStatus.limit * 10) ? "is-remaining" : ""} />)}</div>
                    <p className="settings-quota-used">{isLoadingQuota || !quotaStatus ? t("profileQuotaLoading", "Loading...") : t("profileAutofillUsed", "{used} used today.", { used: quotaStatus.used })}</p>
                  </div>
                </div>}
          </section>

          <form className="settings-section" aria-labelledby="settings-password-heading" onSubmit={handlePasswordSubmit}>
            <SettingsHeading id="password" numeral="iv." title={t("profileChangePassword", "Change password")} meta={t("password", "Password")} />
            {isDemo && <p>{t("demoPasswordUnavailable", "Password changes are unavailable in the public demo.")}</p>}
            <fieldset className="settings-password-fields" disabled={isDemo || isChangingPassword}>
              {[["currentPassword", t("profileCurrentPassword", "Current password")], ["newPassword", t("profileNewPassword", "New password")], ["confirmPassword", t("profileConfirmPassword", "Confirm new password")]].map(([key, label]) => <label key={key}>{label}
                <input className="focus-ring" type="password" value={passwordForm[key]} autoComplete={key === "currentPassword" ? "current-password" : "new-password"} onChange={(event) => { setPasswordForm((current) => ({ ...current, [key]: event.target.value })); setPasswordMessage(""); setPasswordError(""); }} />
              </label>)}
            </fieldset>
            <div className="settings-actions">
              {feedback(passwordError, passwordMessage, passwordDirty, isChangingPassword)}
              {passwordDirty && <button className="settings-discard focus-ring" type="button" disabled={isChangingPassword} onClick={() => { setPasswordForm({ currentPassword: "", newPassword: "", confirmPassword: "" }); setPasswordError(""); setPasswordMessage(""); }}>{discardLabel}</button>}
              <button className="primary-action" disabled={isDemo || isChangingPassword} type="submit"><KeyRound size={16} aria-hidden="true" />{isChangingPassword ? t("working", "Working...") : t("profileUpdatePassword", "Update password")}</button>
            </div>
          </form>
        </div>
      </div>
    </div>
  );
}

function SettingsHeading({ id, numeral, title, meta, children }) {
  return <div className="settings-heading"><span aria-hidden="true">{numeral}</span><h3 id={`settings-${id}-heading`} tabIndex={-1}>{title}</h3><small>{meta}</small>{children}</div>;
}
