import {
  CheckCircle2,
  KeyRound,
  RefreshCw,
  Save,
  ShieldCheck,
  SlidersHorizontal,
  UserRound,
} from "lucide-react";
import { useEffect, useState } from "react";
import {
  changeUserPassword,
  getAutofillUsageStatus,
  getProfileRecoveryEmail,
  getProfileUsername,
  updateUserProfile,
} from "../api/profile";
import { updateLearningPreferences } from "../api/preferences";
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
  learningSettings,
  onLearningSettingsUpdated,
  onUserUpdated,
  user,
}) {
  const { t } = useLanguage();
  const [username, setUsername] = useState(() => getProfileUsername(user));
  const [recoveryEmail, setRecoveryEmail] = useState(() =>
    getProfileRecoveryEmail(user)
  );
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

  async function loadQuotaStatus() {
    if (!user?.id) return;

    setIsLoadingQuota(true);
    setQuotaError("");

    try {
      const status = await getAutofillUsageStatus(user.id);
      setQuotaStatus(status);
    } catch (error) {
      setQuotaError(error.message);
    } finally {
      setIsLoadingQuota(false);
    }
  }

  useEffect(() => {
    setUsername(getProfileUsername(user));
    setRecoveryEmail(getProfileRecoveryEmail(user));
  }, [user]);

  useEffect(() => {
    loadQuotaStatus();
  }, [user?.id]);

  useEffect(() => {
    setSettingsForm(normalizeLearningSettings(learningSettings));
  }, [learningSettings]);

  async function handleProfileSubmit(event) {
    event.preventDefault();
    setProfileError("");
    setProfileMessage("");

    if (!username.trim()) {
      setProfileError(t("profileUsernameRequired", "Username is required."));
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
      const updatedUser = await updateUserProfile({
        recoveryEmail,
        username,
      });
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
      });
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
    setSettingsError("");
    setSettingsMessage("");
    setIsSavingSettings(true);

    try {
      const savedSettings = await updateLearningPreferences(user.id, settingsForm);
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

  const isSubscriber = quotaStatus?.subscriptionTier === "subscriber";
  const usagePercent = quotaStatus
    ? Math.min(100, Math.round((quotaStatus.used / quotaStatus.limit) * 100))
    : 0;
  const settingLimits = getLearningSettingLimits();

  return (
    <div className="grid min-w-0 gap-5 xl:grid-cols-[minmax(0,1fr)_360px]">
      <section className="app-card p-5">
        <div className="mb-5 flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-frenchBlue text-white">
            <UserRound size={20} />
          </div>
          <div>
            <p className="text-sm font-bold text-frenchRed">
              {t("profileAccount", "Account")}
            </p>
            <h3 className="text-xl font-black">
              {t("profileTitle", "Profile details")}
            </h3>
          </div>
        </div>

        <form className="grid gap-4" onSubmit={handleProfileSubmit}>
          <label className="grid gap-1 text-sm font-bold">
            {t("username", "Username")}
            <input
              className="focus-ring h-11 rounded-lg border border-line bg-white px-3 font-normal shadow-sm"
              onChange={(event) => setUsername(event.target.value)}
              value={username}
            />
          </label>

          <label className="grid gap-1 text-sm font-bold">
            {t("recoveryEmailOptional", "Recovery email optional")}
            <input
              className="focus-ring h-11 rounded-lg border border-line bg-white px-3 font-normal shadow-sm"
              onChange={(event) => setRecoveryEmail(event.target.value)}
              placeholder="john@example.com"
              type="email"
              value={recoveryEmail}
            />
            <span className="text-xs font-normal text-slate-500">
              {t(
                "profileRecoveryEmailCopy",
                "Leave blank if you do not want a recovery email yet."
              )}
            </span>
          </label>

          {profileError && (
            <p className="rounded-xl bg-blush p-3 text-sm font-bold text-frenchRed">
              {profileError}
            </p>
          )}
          {profileMessage && (
            <p className="inline-flex items-center gap-2 rounded-xl bg-mint p-3 text-sm font-bold text-sage">
              <CheckCircle2 size={17} />
              {profileMessage}
            </p>
          )}

          <button
            className="primary-action h-11 justify-center"
            disabled={isSavingProfile}
            type="submit"
          >
            {isSavingProfile
              ? t("working", "Working...")
              : t("profileSaveChanges", "Save profile")}
          </button>
        </form>
      </section>

      <aside className="grid content-start gap-5">
        <section className="app-card p-5">
          <div className="mb-4 flex items-start justify-between gap-3">
            <div className="flex items-start gap-3">
              <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-mint text-sage">
                <ShieldCheck size={20} />
              </div>
              <div>
                <p className="text-sm font-bold text-frenchRed">
                  {t("profileSubscription", "Subscription")}
                </p>
                <h3 className="text-xl font-black">
                  {!quotaStatus
                    ? t("profileQuotaLoading", "Loading...")
                    : isSubscriber
                      ? t("profileSubscriber", "Subscriber")
                      : t("profileFreePlan", "Free plan")}
                </h3>
              </div>
            </div>
            <button
              className="focus-ring grid size-10 shrink-0 place-items-center rounded-lg border border-line bg-white text-slate-600 shadow-sm hover:text-frenchBlue"
              disabled={isLoadingQuota}
              onClick={loadQuotaStatus}
              title={t("profileRefreshQuota", "Refresh quota")}
              type="button"
            >
              <RefreshCw size={17} />
            </button>
          </div>

          {quotaError ? (
            <p className="rounded-xl bg-blush p-3 text-sm font-bold text-frenchRed">
              {quotaError}
            </p>
          ) : (
            <div>
              <p className="text-sm font-semibold text-slate-600">
                {t("profileAutofillRemaining", "Auto-fill remaining today")}
              </p>
              <p className="mt-2 text-4xl font-black tracking-[-0.01em]">
                {quotaStatus
                  ? `${quotaStatus.remaining}/${quotaStatus.limit}`
                  : t("profileQuotaLoading", "Loading...")}
              </p>
              <div className="mt-4 h-2 rounded-full bg-sky">
                <div
                  className="h-2 rounded-full bg-frenchBlue"
                  style={{ width: `${usagePercent}%` }}
                />
              </div>
              {quotaStatus && (
                <p className="mt-2 text-sm font-semibold text-slate-600">
                  {t("profileAutofillUsed", "{used} used today.", {
                    used: quotaStatus.used,
                  })}
                </p>
              )}
            </div>
          )}
        </section>
      </aside>

      <section className="app-card p-5 xl:col-span-2">
        <div className="mb-5 flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-sky text-frenchBlue">
            <SlidersHorizontal size={20} />
          </div>
          <div>
            <p className="text-sm font-bold text-frenchRed">
              {t("settingsLearning", "Learning")}
            </p>
            <h3 className="text-xl font-black">
              {t("settingsDailyAmounts", "Daily quiz and study amounts")}
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {t(
                "settingsDailyAmountsCopy",
                "These limits control how many cards are pulled into each new quiz or study cycle."
              )}
            </p>
          </div>
        </div>

        <form
          className="grid gap-4 md:grid-cols-2"
          onSubmit={handleLearningSettingsSubmit}
        >
          <label className="grid gap-1 text-sm font-bold">
            {t("settingsQuizVocabulary", "Quiz vocabulary questions")}
            <input
              className="focus-ring h-11 rounded-lg border border-line bg-white px-3 font-normal shadow-sm"
              max={settingLimits.quizVocabularyLimit.max}
              min={settingLimits.quizVocabularyLimit.min}
              onChange={(event) =>
                updateSettingsField("quizVocabularyLimit", event.target.value)
              }
              type="number"
              value={settingsForm.quizVocabularyLimit}
            />
          </label>

          <label className="grid gap-1 text-sm font-bold">
            {t("settingsStudyVocabulary", "Study vocabulary cards")}
            <input
              className="focus-ring h-11 rounded-lg border border-line bg-white px-3 font-normal shadow-sm"
              max={settingLimits.studyVocabularyLimit.max}
              min={settingLimits.studyVocabularyLimit.min}
              onChange={(event) =>
                updateSettingsField("studyVocabularyLimit", event.target.value)
              }
              type="number"
              value={settingsForm.studyVocabularyLimit}
            />
          </label>

          <label className="grid gap-1 text-sm font-bold">
            {t("settingsStudyGrammar", "Study grammar cards")}
            <input
              className="focus-ring h-11 rounded-lg border border-line bg-white px-3 font-normal shadow-sm"
              max={settingLimits.studyGrammarLimit.max}
              min={settingLimits.studyGrammarLimit.min}
              onChange={(event) =>
                updateSettingsField("studyGrammarLimit", event.target.value)
              }
              type="number"
              value={settingsForm.studyGrammarLimit}
            />
          </label>

          <label className="grid gap-1 text-sm font-bold">
            {t("settingsStudyPhrases", "Study short phrase cards")}
            <input
              className="focus-ring h-11 rounded-lg border border-line bg-white px-3 font-normal shadow-sm"
              max={settingLimits.studyPhraseLimit.max}
              min={settingLimits.studyPhraseLimit.min}
              onChange={(event) =>
                updateSettingsField("studyPhraseLimit", event.target.value)
              }
              type="number"
              value={settingsForm.studyPhraseLimit}
            />
          </label>

          {settingsError && (
            <p className="rounded-xl bg-blush p-3 text-sm font-bold text-frenchRed md:col-span-2">
              {settingsError}
            </p>
          )}
          {settingsMessage && (
            <p className="inline-flex items-center gap-2 rounded-xl bg-mint p-3 text-sm font-bold text-sage md:col-span-2">
              <CheckCircle2 size={17} />
              {settingsMessage}
            </p>
          )}

          <button
            className="primary-action h-11 justify-center md:col-span-2 md:w-fit"
            disabled={isSavingSettings}
            type="submit"
          >
            <Save size={17} />
            {isSavingSettings
              ? t("working", "Working...")
              : t("settingsSaveLearning", "Save learning settings")}
          </button>
        </form>
      </section>

      <section className="app-card p-5 xl:col-span-2">
        <div className="mb-5 flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-butter text-brass">
            <KeyRound size={20} />
          </div>
          <div>
            <p className="text-sm font-bold text-frenchRed">
              {t("password", "Password")}
            </p>
            <h3 className="text-xl font-black">
              {t("profileChangePassword", "Change password")}
            </h3>
          </div>
        </div>

        <form className="grid gap-4 md:grid-cols-3" onSubmit={handlePasswordSubmit}>
          <label className="grid gap-1 text-sm font-bold">
            {t("profileCurrentPassword", "Current password")}
            <input
              className="focus-ring h-11 rounded-lg border border-line bg-white px-3 font-normal shadow-sm"
              onChange={(event) =>
                setPasswordForm((current) => ({
                  ...current,
                  currentPassword: event.target.value,
                }))
              }
              type="password"
              value={passwordForm.currentPassword}
            />
          </label>

          <label className="grid gap-1 text-sm font-bold">
            {t("profileNewPassword", "New password")}
            <input
              className="focus-ring h-11 rounded-lg border border-line bg-white px-3 font-normal shadow-sm"
              onChange={(event) =>
                setPasswordForm((current) => ({
                  ...current,
                  newPassword: event.target.value,
                }))
              }
              type="password"
              value={passwordForm.newPassword}
            />
          </label>

          <label className="grid gap-1 text-sm font-bold">
            {t("profileConfirmPassword", "Confirm new password")}
            <input
              className="focus-ring h-11 rounded-lg border border-line bg-white px-3 font-normal shadow-sm"
              onChange={(event) =>
                setPasswordForm((current) => ({
                  ...current,
                  confirmPassword: event.target.value,
                }))
              }
              type="password"
              value={passwordForm.confirmPassword}
            />
          </label>

          {passwordError && (
            <p className="rounded-xl bg-blush p-3 text-sm font-bold text-frenchRed md:col-span-3">
              {passwordError}
            </p>
          )}
          {passwordMessage && (
            <p className="inline-flex items-center gap-2 rounded-xl bg-mint p-3 text-sm font-bold text-sage md:col-span-3">
              <CheckCircle2 size={17} />
              {passwordMessage}
            </p>
          )}

          <button
            className="primary-action h-11 justify-center md:col-span-3 md:w-fit"
            disabled={isChangingPassword}
            type="submit"
          >
            <KeyRound size={17} />
            {isChangingPassword
              ? t("working", "Working...")
              : t("profileUpdatePassword", "Update password")}
          </button>
        </form>
      </section>
    </div>
  );
}
