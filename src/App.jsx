import { useEffect, useMemo, useRef, useState } from "react";
import { getLearningPreferences } from "./api/preferences";
import { AppHeader } from "./components/AppHeader";
import { EditorModal } from "./components/EditorModal";
import { Sidebar } from "./components/Sidebar";
import { categories } from "./data/categories";
import { demoNotes, demoUser } from "./data/demoData";
import { hasSupabaseConfig } from "./lib/supabase";
import { useDailyLearningState } from "./hooks/useDailyLearningState";
import { useLocalLearningDay } from "./hooks/useLocalLearningDay";
import { useImportJob } from "./hooks/useImportJob";
import { useNotes } from "./hooks/useNotes";
import { useAuthSession } from "./hooks/useAuthSession";
import { LanguageProvider, useLanguage } from "./i18n/LanguageContext";
import { isPublicDemoRoute } from "./utils/demoMode";
import { SetupPage } from "./pages/SetupPage";
import { SignInPage } from "./pages/SignInPage";
import { normalizeTags } from "./utils/tags";
import { getDisplayName } from "./utils/accountIdentity";
import { getTodayKey, MAX_CONFIDENCE } from "./utils/quiz";
import { isRichTextEmpty, sanitizeRichTextHtml } from "./utils/richText";
import { shouldDelayLearningMount } from "./utils/studyState";
import { GrammarView } from "./views/GrammarView";
import { ImportView } from "./views/ImportView";
import { PhrasesView } from "./views/PhrasesView";
import { SettingsView } from "./views/SettingsView";
import { PronunciationView } from "./views/PronunciationView";
import { QuizView } from "./views/QuizView";
import { ReviewView } from "./views/ReviewView";
import { TodayView } from "./views/TodayView";
import { VocabularyView } from "./views/VocabularyView";
import { createEmptyWordDetails, normalizeWordDetails } from "./data/wordFields";
import { createDailyProgress } from "./utils/dailyProgress";
import { defaultLearningSettings } from "./utils/learningSettings";

const emptyForm = {
  category: "vocabulary",
  french: "",
  english: "",
  example: "",
  notes: "",
  tags: "",
  confidence: 1,
  ...createEmptyWordDetails(),
};

const viewBySection = {
  today: TodayView,
  quiz: QuizView,
  vocabulary: VocabularyView,
  phrases: PhrasesView,
  grammar: GrammarView,
  pronunciation: PronunciationView,
  review: ReviewView,
  import: ImportView,
  settings: SettingsView,
};

const noteSections = new Set(["vocabulary", "phrases", "grammar", "pronunciation"]);

function getFriendlyAuthError(error) {
  const message = error?.message ?? "Something went wrong.";

  if (message.toLowerCase().includes("invalid login credentials")) {
    return "The username or password is incorrect.";
  }

  if (message.toLowerCase().includes("user already registered")) {
    return "That username is already taken.";
  }

  return message;
}

export default function App() {
  const [isDemoRoute, setIsDemoRoute] = useState(isPublicDemoRoute);

  useEffect(() => {
    const onHashChange = () => setIsDemoRoute(isPublicDemoRoute());
    window.addEventListener("hashchange", onHashChange);
    return () => window.removeEventListener("hashchange", onHashChange);
  }, []);

  return (
    <AccountSession isDemoRoute={isDemoRoute} key={isDemoRoute ? "demo" : "account"} />
  );
}

function AccountSession({ isDemoRoute }) {
  const auth = useAuthSession({ isDemo: isDemoRoute, demoUser });
  return (
    <LanguageProvider isDemo={isDemoRoute} userId={auth.user?.id} isCurrentAccount={auth.isCurrentAccount} key={auth.generation}>
      <Workspace isDemoRoute={isDemoRoute} auth={auth} />
    </LanguageProvider>
  );
}

function Workspace({ isDemoRoute, auth }) {
  const learningDay = useLocalLearningDay();
  const { t, languagePreferenceStatus, retryLanguagePreference } = useLanguage();
  const { user, loading: authLoading, error: authError, isCurrentAccount, updateUser: setUser,
    handleAuthSubmit, handleSignOut } = auth;
  const [dataError, setDataError] = useState("");
  const confirmingDeletion = useRef(false);
  const [learningSettings, setLearningSettings] = useState(defaultLearningSettings);
  const [settingsLoad, setSettingsLoad] = useState({ userId: null, status: "idle", error: "" });
  const [settingsLoadAttempt, setSettingsLoadAttempt] = useState(0);
  const userId = user?.id;
  const [demoDailyProgress, setDemoDailyProgress] = useState(() => ({
    ...createDailyProgress(),
    addNote: true,
  }));
  const [activeSection, setActiveSection] = useState("today");
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("all");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editorError, setEditorError] = useState("");
  const [form, setForm] = useState(emptyForm);
  const notes = useNotes({
    demoItems: demoNotes,
    isDemo: isDemoRoute,
    isCurrentAccount,
    setError: setDataError,
    user,
  });
  const { items, selectedIds } = notes;
  const {
    completeDailyTask,
    dailyProgress,
    dailyQuizState,
    dailyStudyState,
    dailyStateLoaded,
    dailyStateError,
    dailySaveError,
    dailySaveConflict,
    retryDailySaves,
    reloadSavedDailyProgress,
    retryDailyLearningState,
    setDailyQuizState,
    persistDailyQuizState,
    setDailyStudyState,
  } = useDailyLearningState(isDemoRoute ? null : user, isCurrentAccount, learningDay);
  const {
    cancelImportJob,
    importJob,
    startImportJob,
    updateImportJob,
  } = useImportJob({
    createImportedNote: notes.createImportedNote,
    isDemo: isDemoRoute,
    isCurrentAccount,
    items,
    onNotesAdded: () => completeTask("addNote"),
    t,
    user,
  });

  useEffect(() => {
    if (isDemoRoute) {
      return undefined;
    }

    if (!userId) {
      setLearningSettings(defaultLearningSettings);
      setSettingsLoad({ userId: null, status: "idle", error: "" });
      return undefined;
    }

    let isMounted = true;
    setSettingsLoad({ userId, status: "loading", error: "" });

    getLearningPreferences(userId)
      .then((savedSettings) => {
        if (!isMounted || !isCurrentAccount()) return;
        setLearningSettings(savedSettings);
        setSettingsLoad({ userId, status: "ready", error: "" });
      })
      .catch((error) => {
        if (!isMounted || !isCurrentAccount()) return;
        setSettingsLoad({ userId, status: "error", error: error.message || "Could not load learning settings." });
      });

    return () => {
      isMounted = false;
    };
  }, [isCurrentAccount, isDemoRoute, settingsLoadAttempt, userId]);

  const tags = useMemo(() => {
    const tagSourceItems = noteSections.has(activeSection)
      ? items.filter((item) => item.category === activeSection)
      : items;
    const unique = new Set(tagSourceItems.flatMap((item) => item.tags ?? []));
    return ["all", ...Array.from(unique).sort()];
  }, [activeSection, items]);

  useEffect(() => {
    if (selectedTag === "all" || tags.includes(selectedTag)) return;
    setSelectedTag("all");
  }, [selectedTag, tags]);

  const weakItems = useMemo(
    () => items.filter((item) => item.confidence <= 2),
    [items]
  );

  const filteredItems = useMemo(() => {
    const searchable = query.trim().toLowerCase();
    return items.filter((item) => {
      const matchesSection =
        activeSection === "today" ||
        activeSection === "import" ||
        activeSection === "settings" ||
        (activeSection === "review"
          ? Number(item.confidence) < MAX_CONFIDENCE
          : item.category === activeSection);
      const matchesTag =
        selectedTag === "all" || (item.tags ?? []).includes(selectedTag);
      const haystack = [
        item.french,
        item.english,
        item.example,
        item.notes,
        item.category,
        item.partOfSpeech,
        item.ipa,
        item.gender,
        ...Object.values(item.conjugation ?? {}),
        ...Object.values(item.adjectiveForms ?? {}),
        ...(item.tags ?? []),
      ]
        .join(" ")
        .toLowerCase();
      return matchesSection && matchesTag && haystack.includes(searchable);
    });
  }, [activeSection, items, query, selectedTag]);

  const stats = useMemo(() => {
    const confidenceTotal = items.reduce((sum, item) => sum + item.confidence, 0);
    return {
      total: items.length,
      weak: weakItems.length,
      tags: tags.length - 1,
      average: items.length
        ? Math.round((confidenceTotal / (items.length * 4)) * 100)
        : 0,
    };
  }, [items, tags.length, weakItems.length]);

  const visibleDailyProgress = isDemoRoute
    ? (demoDailyProgress.date === learningDay ? demoDailyProgress : createDailyProgress(learningDay))
    : dailyProgress;

  function completeTask(task, sessionDay) {
    const today = getTodayKey();
    if (sessionDay && sessionDay !== today) return;
    if (isDemoRoute) {
      setDemoDailyProgress((current) => ({
        ...(current.date === today ? current : createDailyProgress(today)),
        [task]: true,
      }));
      return;
    }

    completeDailyTask(task, sessionDay);
  }

  function openNewItem(category = "vocabulary") {
    setEditingItem(null);
    setEditorError("");
    setForm({ ...emptyForm, category });
    setIsEditorOpen(true);
  }

  function openEditItem(item) {
    setEditingItem(item);
    setEditorError("");
    setForm({
      ...item,
      ...normalizeWordDetails(item),
      tags: (item.tags ?? []).join(", "),
    });
    setIsEditorOpen(true);
  }

  async function saveItem(event) {
    event.preventDefault();
    if (!user || !isCurrentAccount()) return;

    const trimmedFrench = form.french.trim();
    const normalizedFrench = trimmedFrench.toLocaleLowerCase("fr");
    const duplicate = items.find(
      (item) =>
        item.id !== editingItem?.id &&
        item.category === form.category &&
        item.french.trim().toLocaleLowerCase("fr") === normalizedFrench
    );

    if (duplicate) {
      setEditorError(
        t("duplicateNote", '"{word}" already exists in {category}.', {
          word: trimmedFrench,
          category: t(
            categories[form.category].labelKey,
            categories[form.category].label
          ),
        })
      );
      return;
    }

    const nextItem = {
      ...form,
      french: trimmedFrench,
      id: editingItem?.id ?? crypto.randomUUID(),
      ...normalizeWordDetails(form),
      tags: normalizeTags(form.tags),
      confidence: Number(form.confidence),
      lastReviewed: editingItem?.lastReviewed ?? "Not reviewed",
      createdAt: editingItem?.createdAt ?? new Date().toISOString(),
    };
    if (nextItem.category === "grammar") {
      const sanitizedNotes = sanitizeRichTextHtml(nextItem.notes);
      Object.assign(nextItem, {
        english: "",
        example: "",
        notes: isRichTextEmpty(sanitizedNotes) ? "" : sanitizedNotes,
        ...createEmptyWordDetails(),
      });
    }
    if (nextItem.category === "phrases") {
      Object.assign(nextItem, {
        example: "",
        notes: "",
        ...createEmptyWordDetails(),
      });
    }

    try {
      await notes.save(nextItem, editingItem?.id, editingItem
        ? { ...editingItem, ...normalizeWordDetails(editingItem) } : undefined);
      if (!isCurrentAccount()) return;
      if (!editingItem) {
        completeTask("addNote");
      }
      setEditorError("");
      setIsEditorOpen(false);
    } catch (error) {
      if (isCurrentAccount()) setEditorError(error.message);
    }
  }

  async function deleteItem(item) {
    await confirmDeletion(`Delete "${item.french}"?`, () => notes.deleteOne(item.id));
  }

  async function deleteSelected() {
    if (selectedIds.length === 0 || !user) return;
    await confirmDeletion(
      `Delete ${selectedIds.length} selected note${selectedIds.length === 1 ? "" : "s"}?`,
      notes.deleteSelected,
    );
  }

  async function confirmDeletion(message, remove) {
    if (!user || !isCurrentAccount() || confirmingDeletion.current || notes.isDeleting) return;
    confirmingDeletion.current = true;
    try {
      if (window.confirm(message)) await remove();
    } finally {
      confirmingDeletion.current = false;
    }
  }

  const ActiveView = viewBySection[activeSection] ?? TodayView;
  const displayName = getDisplayName(user);
  const isLearningStateLoading = shouldDelayLearningMount({
    activeSection,
    dailyStateLoaded,
    notesLoaded: notes.isLoaded,
    learningSettingsLoaded: settingsLoad.userId === userId && settingsLoad.status === "ready",
    isDemo: isDemoRoute,
  });
  const loadFailures = isDemoRoute ? [] : [
    {
      key: "daily",
      error: dailyStateError,
      message: t("dailyStateLoadFailed", "Your saved learning progress could not be loaded. It has not been reset."),
      retry: retryDailyLearningState,
    },
    {
      key: "notes",
      error: notes.loadError,
      message: t("notesLoadFailed", "Your notes could not be loaded. Your saved learning session is unchanged."),
      retry: notes.retryLoad,
    },
    {
      key: "settings",
      error: settingsLoad.userId === userId ? settingsLoad.error : "",
      message: t("learningSettingsLoadFailed", "Your learning settings could not be loaded. Retry before starting a session."),
      retry: () => setSettingsLoadAttempt((current) => current + 1),
    },
  ].filter((failure) => failure.error);
  const pageTitle =
    activeSection === "today"
      ? t("todayTitle", "Bonjour, {username}. Ready for 12 minutes of French?", {
          username: displayName,
        })
      : t(categories[activeSection].labelKey, categories[activeSection].label);

  const viewProps = {
    learningDay,
    isDemo: isDemoRoute,
    isCurrentAccount,
    activeSection,
    dailyProgress: visibleDailyProgress,
    dailyProgressReady: isDemoRoute || dailyStateLoaded,
    filteredItems,
    items,
    isDeleting: notes.isDeleting,
    markReviewed: notes.markReviewed,
    onClearSelection: notes.clearSelection,
    onDeleteItem: deleteItem,
    onDeleteSelected: deleteSelected,
    onSelectItems: notes.selectItems,
    onToggleSelected: notes.toggleSelected,
    openEditItem,
    openNewItem,
    onQuizAnswer: (...args) => {
      if (learningDay === getTodayKey()) return notes.recordQuizCorrect(...args);
      return Promise.reject(new Error("The learning day changed. Reopen the quiz."));
    },
    onPersistQuizState: persistDailyQuizState,
    importJob,
    onCancelImport: cancelImportJob,
    onStartImport: startImportJob,
    onUpdateImportJob: updateImportJob,
    onQuizComplete: () => completeTask("quiz", learningDay),
    onQuizStateChange: isDemoRoute || dailyStateLoaded ? setDailyQuizState : undefined,
    onStartStudy: () => setActiveSection("review"),
    onStartQuiz: () => setActiveSection("quiz"),
    onStudyComplete: () => completeTask("study", learningDay),
    onStudyConfidenceChange: notes.setStudyConfidence,
    onStudyStateChange: setDailyStudyState,
    onLearningSettingsUpdated: setLearningSettings,
    onUserUpdated: setUser,
    learningSettings,
    query,
    selectedTag,
    selectedIds,
    setQuery,
    setSelectedTag,
    stats,
    tags,
    weakItems,
    savedQuizState: dailyQuizState,
    savedStudyState: dailyStudyState,
    user,
  };

  if (!isDemoRoute && !hasSupabaseConfig) {
    return <SetupPage />;
  }

  if (authLoading && !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-cloud/80 px-4 text-ink">
        <div className="app-card p-5 font-semibold">
          {t("loadingWorkspace", "Loading your French workspace...")}
        </div>
      </div>
    );
  }

  if (!user) {
    return (
      <SignInPage
        error={authError ? getFriendlyAuthError({ message: authError }) : ""}
        isLoading={authLoading}
        onAuthSubmit={handleAuthSubmit}
      />
    );
  }

  return (
    <div className="min-h-screen overflow-x-hidden bg-cloud/80 pt-[61px] text-ink md:pl-64 md:pt-0">
      <Sidebar
        activeSection={activeSection}
        setActiveSection={setActiveSection}
      />

      <main className="mx-auto min-w-0 max-w-7xl">
        <AppHeader
          activeSection={activeSection}
          isDemo={isDemoRoute}
          onSignOut={handleSignOut}
          openNewItem={openNewItem}
          pageTitle={pageTitle}
          user={user}
        />

        <section className="grid gap-4 px-3 pb-6 pt-2 sm:px-4 sm:pb-8 md:px-7 lg:gap-5">
          {languagePreferenceStatus.error && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-frenchRed/25 bg-blush p-3 text-sm text-frenchRed" role="alert">
              <p>{languagePreferenceStatus.error === "load"
                ? t("languagePreferenceLoadFailed", "Your saved language could not be loaded. Your current choice is not synced.")
                : t("languagePreferenceSaveFailed", "Your language choice could not be saved. Retry to sync it.")}</p>
              <button className="secondary-action h-9" onClick={retryLanguagePreference} type="button">
                {t("retryLanguagePreference", "Retry language preference")}
              </button>
            </div>
          )}
          {(dataError || authError) && (
            <div className="rounded-xl border border-frenchRed/25 bg-blush p-3 text-sm font-medium text-frenchRed">
              {dataError || authError}
            </div>
          )}
          {(notes.isDeleting || notes.deletionResult) && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-paper p-3 text-sm" role="status" aria-live="polite">
              <p>{notes.isDeleting
                ? t("deletingNotes", "Deleting notes...")
                : t("deleteNotesResult", "Deleted: {deleted}. Failed: {failed}.", notes.deletionResult)}
                {!notes.isDeleting && notes.deletionResult?.failed > 0 && (
                  <> {t("deleteNotesRetryCopy", "Failed notes remain selected. Check your connection and retry.")}</>
                )}
              </p>
              {!notes.isDeleting && notes.deletionResult?.failed > 0 && (
                <button className="secondary-action h-9" type="button" onClick={() => confirmDeletion(
                  t("retryDeleteConfirm", "Retry deleting {count} failed notes?", { count: notes.deletionResult.failed }),
                  notes.retryFailedDeletions,
                )}>
                  {t("retryFailedDeletions", "Retry failed deletions")}
                </button>
              )}
            </div>
          )}
          {loadFailures.map(({ key, message, retry }) => (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-frenchRed/25 bg-blush p-3 text-sm text-frenchRed" key={key} role="alert">
              <p>{message}</p>
              <button className="secondary-action h-9" onClick={retry} type="button">
                {t("retryLoad", "Retry")}
              </button>
            </div>
          ))}
          {dailySaveError && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-lg border border-frenchRed/25 bg-blush p-3 text-sm text-frenchRed" role="alert">
              <p>{t("dailySaveFailed", "Some learning progress is not saved.")} {dailySaveConflict
                ? t("dailySaveConflict", "This session changed in another tab or device.")
                : dailySaveError}</p>
              <button className="secondary-action h-9" onClick={retryDailySaves} type="button">
                {t("retryDailySave", "Retry saving")}
              </button>
              {dailySaveConflict && (
                <button className="secondary-action h-9" type="button" onClick={() => {
                  if (window.confirm(t("reloadProgressConfirm", "Reload saved progress? Unsaved changes in this tab will be discarded."))) reloadSavedDailyProgress();
                }}>
                  {t("reloadSavedProgress", "Reload saved progress")}
                </button>
              )}
            </div>
          )}
          {notes.isLoading && items.length === 0 && !isLearningStateLoading && (
            <div className="app-card p-3 text-sm font-medium text-inkSecondary">
              {t("loadingNotes", "Loading notes...")}
            </div>
          )}
          {isLearningStateLoading ? (
            <div className="app-card p-5 text-sm font-medium text-inkSecondary" role="status">
              {loadFailures.length > 0
                ? t("learningSessionWaiting", "Retry loading your data to resume your saved session.")
                : t("loadingLearningState", "Loading your saved learning session...")}
            </div>
          ) : (
            <ActiveView key={["quiz", "review"].includes(activeSection) ? `${activeSection}:${learningDay}` : activeSection} {...viewProps} />
          )}
        </section>
      </main>

      {isEditorOpen && (
        <EditorModal
          isDemo={isDemoRoute}
          isCurrentAccount={isCurrentAccount}
          userId={user.id}
          error={editorError}
          form={form}
          onChange={() => setEditorError("")}
          setForm={setForm}
          onClose={() => setIsEditorOpen(false)}
          onSave={saveItem}
          title={
            editingItem
              ? t("editLearningNote", "Edit learning note")
              : t("addLearningNote", "Add learning note")
          }
        />
      )}
    </div>
  );
}
