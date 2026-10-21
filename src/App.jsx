import { lazy, Suspense, useEffect, useMemo, useRef, useState } from "react";
import { getLearningPreferences } from "./api/preferences";
import { AppHeader } from "./components/AppHeader";
import { EditorModal } from "./components/EditorModal";
import { LibraryDialog } from "./components/LibraryDialog";
import { Sidebar } from "./components/Sidebar";
import { ViewBoundary } from "./components/ViewBoundary";
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
import { assertNoDuplicateNote, normalizeNoteInput } from "./utils/noteIntegrity";
import { getTodayKey, MAX_CONFIDENCE } from "./utils/quiz";
import { shouldDelayLearningMount } from "./utils/studyState";
import { TodayView } from "./views/TodayView";
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

const GrammarView = lazy(() => import("./views/GrammarView").then((module) => ({ default: module.GrammarView })));
const ImportView = lazy(() => import("./views/ImportView").then((module) => ({ default: module.ImportView })));
const PhrasesView = lazy(() => import("./views/PhrasesView").then((module) => ({ default: module.PhrasesView })));
const SettingsView = lazy(() => import("./views/SettingsView").then((module) => ({ default: module.SettingsView })));
const PronunciationView = lazy(() => import("./views/PronunciationView").then((module) => ({ default: module.PronunciationView })));
const QuizView = lazy(() => import("./views/QuizView").then((module) => ({ default: module.QuizView })));
const ReviewView = lazy(() => import("./views/ReviewView").then((module) => ({ default: module.ReviewView })));
const VocabularyView = lazy(() => import("./views/VocabularyView").then((module) => ({ default: module.VocabularyView })));

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
  const { t, language, languagePreferenceStatus, retryLanguagePreference } = useLanguage();
  const { user, loading: authLoading, error: authError, isCurrentAccount, updateUser: setUser,
    handleAuthSubmit, handleSignOut } = auth;
  const [dataError, setDataError] = useState("");
  const confirmingDeletion = useRef(false);
  const deletionDecision = useRef(null);
  const [deletePrompt, setDeletePrompt] = useState(null);
  useEffect(() => () => { deletionDecision.current?.(false); }, []);
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
  const [editorSession, setEditorSession] = useState(null);
  const editorSessionRef = useRef(null);
  const [isSavingNote, setIsSavingNote] = useState(false);
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
    selectImportFile,
    changeImportMode,
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
    beginEditor();
    setEditingItem(null);
    setEditorError("");
    setForm({ ...emptyForm, category });
  }

  function openEditItem(item) {
    beginEditor();
    setEditingItem(item);
    setEditorError("");
    setForm({
      ...item,
      ...normalizeWordDetails(item),
      tags: (item.tags ?? []).join(", "),
    });
  }

  function beginEditor() {
    const session = { id: crypto.randomUUID(), saving: false };
    editorSessionRef.current = session;
    setEditorSession(session);
    setIsSavingNote(false);
  }

  function closeEditor(session) {
    if (editorSessionRef.current !== session) return;
    editorSessionRef.current = null;
    setEditorSession(null);
    setIsSavingNote(false);
  }

  function updateEditorForm(session, update) {
    if (editorSessionRef.current !== session || session.saving || !isCurrentAccount()) return;
    setForm((current) => editorSessionRef.current === session && !session.saving && isCurrentAccount()
      ? update(current) : current);
  }

  async function saveItem(event, session) {
    event.preventDefault();
    if (!user || !isCurrentAccount() || editorSessionRef.current !== session || session.saving) return;

    let nextItem;
    try {
      nextItem = normalizeNoteInput({
        ...form,
        id: editingItem?.id ?? crypto.randomUUID(),
        lastReviewed: editingItem?.lastReviewed ?? "Not reviewed",
        createdAt: editingItem?.createdAt ?? new Date().toISOString(),
      }, { tagText: true });
      assertNoDuplicateNote(nextItem, items, editingItem?.id);
    } catch (error) {
      setEditorError(t(`noteValidation${error.field}`, error.message));
      return;
    }

    session.saving = true;
    setIsSavingNote(true);
    setEditorError("");
    try {
      await notes.save(nextItem, editingItem?.id, editingItem
        ? { ...editingItem, ...normalizeWordDetails(editingItem) } : undefined);
      if (!isCurrentAccount()) return;
      if (!editingItem) {
        completeTask("addNote");
      }
      if (editorSessionRef.current === session) {
        setEditorError("");
        closeEditor(session);
      }
    } catch (error) {
      if (isCurrentAccount() && editorSessionRef.current === session) setEditorError(t(`noteValidation${error.field}`, error.message));
    } finally {
      session.saving = false;
      if (isCurrentAccount() && editorSessionRef.current === session) setIsSavingNote(false);
    }
  }

  async function deleteItem(item) {
    await confirmDeletion(t("deleteSingleConfirm", 'Delete "{word}"?', { word: item.french }), () => notes.deleteOne(item.id));
  }

  async function deleteSelected() {
    if (selectedIds.length === 0 || !user) return;
    await confirmDeletion(
      t("deleteSelectionConfirm", "Delete {count} selected notes?", { count: selectedIds.length }),
      notes.deleteSelected,
      items.filter((item) => selectedIds.includes(item.id)).map((item) => item.french),
    );
  }

  async function confirmDeletion(message, remove, names = []) {
    if (!user || !isCurrentAccount() || confirmingDeletion.current || notes.isDeleting) return;
    confirmingDeletion.current = true;
    try {
      const accepted = await new Promise((resolve) => {
        deletionDecision.current = resolve;
        setDeletePrompt({ message, names });
      });
      if (accepted && isCurrentAccount()) await remove();
    } finally {
      confirmingDeletion.current = false;
    }
  }

  function decideDeletion(accepted) {
    const resolve = deletionDecision.current;
    deletionDecision.current = null;
    setDeletePrompt(null);
    resolve?.(accepted);
  }

  const ActiveView = viewBySection[activeSection] ?? TodayView;
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
  const pageTitle = t(categories[activeSection].labelKey, categories[activeSection].label);

  const viewProps = {
    learningDay,
    isDemo: isDemoRoute,
    isCurrentAccount,
    activeSection,
    dailyProgress: visibleDailyProgress,
    dailyProgressReady: isDemoRoute || dailyStateLoaded,
    learningDataReady: isDemoRoute || (notes.isLoaded && settingsLoad.userId === userId && settingsLoad.status === "ready"),
    learningLoadFailed: loadFailures.length > 0,
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
    onSelectImportFile: selectImportFile,
    onChangeImportMode: changeImportMode,
    onQuizComplete: () => completeTask("quiz", learningDay),
    onQuizStateChange: isDemoRoute || dailyStateLoaded ? setDailyQuizState : undefined,
    onStartStudy: () => setActiveSection("review"),
    onExitStudy: () => setActiveSection("today"),
    onStartQuiz: () => setActiveSection("quiz"),
    onExitQuiz: () => setActiveSection("today"),
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
    tags,
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
        <div className="app-card p-5 font-semibold" role="status">
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
    <div className={`cahier-workspace${activeSection === "review" ? " is-studying" : activeSection === "quiz" ? " is-quizzing" : ["vocabulary", "phrases", "grammar", "pronunciation"].includes(activeSection) ? " is-library" : ["import", "settings"].includes(activeSection) ? " is-bureau" : ""}`} lang={language === "zh" ? "zh-CN" : "en"}>
      <Sidebar
        activeSection={activeSection}
        setActiveSection={setActiveSection}
        isDemo={isDemoRoute}
        onSignOut={handleSignOut}
        user={user}
      />

      <main className="cahier-main">
        <AppHeader
          activeSection={activeSection}
          openNewItem={openNewItem}
          pageTitle={pageTitle}
          learningDay={learningDay}
        />

        <section className="cahier-content">
          {notes.dataWarningCount > 0 && (
            <p className="rounded-lg border border-line bg-paper p-3 text-sm text-slate-700" role="status">
              {t("noteDataWarning", "{count} saved notes have invalid data. Safe defaults are used where possible; unrecognizable notes are hidden. Stored data was not changed.", { count: notes.dataWarningCount })}
            </p>
          )}
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
            <div className="rounded-xl border border-frenchRed/25 bg-blush p-3 text-sm font-medium text-frenchRed" role="alert">
              {dataError || authError}
            </div>
          )}
          {(notes.isDeleting || notes.deletionResult) && (
            <div className="library-delete-status flex flex-wrap items-center justify-between gap-3 rounded-lg border border-line bg-paper p-3 text-sm" role="status" aria-live="polite">
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
          {activeSection !== "today" && notes.isLoading && items.length === 0 && !isLearningStateLoading && (
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
            <ViewBoundary key={activeSection} message={t("viewLoadFailed", "This page could not be opened. Check your connection and reload the page to try again.")} reloadLabel={t("reloadPage", "Reload page")}>
              <Suspense fallback={<p className="view-loading" role="status">{t("viewLoading", "Opening page...")}</p>}>
                <ActiveView key={["quiz", "review"].includes(activeSection) ? `${activeSection}:${learningDay}` : activeSection} {...viewProps} />
              </Suspense>
            </ViewBoundary>
          )}
        </section>
      </main>

      {deletePrompt && <LibraryDialog title={deletePrompt.message} confirm onClose={() => decideDeletion(false)}>
        {deletePrompt.names.length > 0 && <p className="library-confirm-list" lang="fr">{deletePrompt.names.slice(0, 4).join(" · ")}{deletePrompt.names.length > 4 ? ` · +${deletePrompt.names.length - 4}` : ""}</p>}
        <p>{t("deleteNotesWarning", "This permanently removes the selected notes. It cannot be undone.")}</p>
        <div className="library-sheet-actions"><button className="secondary-action" onClick={() => decideDeletion(false)} type="button">{t("cancel", "Cancel")}</button><button className="primary-action library-danger" aria-label={t("confirmDeletion", "Confirm deletion")} onClick={() => decideDeletion(true)} type="button">{t("delete", "Delete")}</button></div>
      </LibraryDialog>}
      {editorSession && (
        <EditorModal
          key={editorSession.id}
          isDemo={isDemoRoute}
          isCurrentAccount={isCurrentAccount}
          isSaving={isSavingNote}
          userId={user.id}
          error={editorError}
          form={form}
          onChange={() => setEditorError("")}
          setForm={(update) => updateEditorForm(editorSession, update)}
          onClose={() => closeEditor(editorSession)}
          onSave={(event) => saveItem(event, editorSession)}
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
