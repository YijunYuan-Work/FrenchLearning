import { useEffect, useMemo, useRef, useState } from "react";
import {
  signInWithEmail,
  signOut as signOutUser,
  signUpWithEmail,
} from "./api/auth";
import {
  getLearningPreferences,
  getLanguagePreference,
  updateLanguagePreference,
} from "./api/preferences";
import { AppHeader } from "./components/AppHeader";
import { EditorModal } from "./components/EditorModal";
import { Sidebar } from "./components/Sidebar";
import { categories } from "./data/categories";
import { demoNotes, demoUser } from "./data/demoData";
import { hasSupabaseConfig, supabase } from "./lib/supabase";
import { useDailyLearningState } from "./hooks/useDailyLearningState";
import { useImportJob } from "./hooks/useImportJob";
import { useNotes } from "./hooks/useNotes";
import { useLanguage } from "./i18n/LanguageContext";
import { SetupPage } from "./pages/SetupPage";
import { SignInPage } from "./pages/SignInPage";
import { normalizeTags } from "./utils/tags";
import { getDisplayName } from "./utils/accountIdentity";
import { MAX_CONFIDENCE } from "./utils/quiz";
import { isRichTextEmpty, sanitizeRichTextHtml } from "./utils/richText";
import { shouldDelayStudyMount } from "./utils/studyState";
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

function isPublicDemoRoute() {
  return window.location.hash.replace(/^#/, "").replace(/\/$/, "") === "/demo";
}

export default function App() {
  const isDemoRoute = isPublicDemoRoute();
  const { language, setLanguage, t } = useLanguage();
  const [user, setUser] = useState(() => (isDemoRoute ? demoUser : null));
  const [authLoading, setAuthLoading] = useState(
    isDemoRoute ? false : hasSupabaseConfig
  );
  const [authError, setAuthError] = useState("");
  const [dataError, setDataError] = useState("");
  const [languagePreferenceLoaded, setLanguagePreferenceLoaded] = useState(
    isDemoRoute
  );
  const [learningSettings, setLearningSettings] = useState(defaultLearningSettings);
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
  const savedLanguageRef = useRef(language);
  const notes = useNotes({
    demoItems: demoNotes,
    isDemo: isDemoRoute,
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
    resetDailyLearningState,
    setDailyQuizState,
    setDailyStudyState,
  } = useDailyLearningState(isDemoRoute ? null : user, setDataError);
  const {
    cancelImportJob,
    importJob,
    startImportJob,
    updateImportJob,
  } = useImportJob({
    createImportedNote: notes.createImportedNote,
    isDemo: isDemoRoute,
    items,
    onNotesAdded: () => completeTask("addNote"),
    t,
    user,
  });

  useEffect(() => {
    if (isDemoRoute) return undefined;
    if (!hasSupabaseConfig) return undefined;

    let isMounted = true;

    supabase.auth.getSession().then(({ data }) => {
      if (!isMounted) return;
      setUser(data.session?.user ?? null);
      setAuthLoading(false);
    });

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event, session) => {
      setUser(session?.user ?? null);
      setAuthLoading(false);
      setAuthError("");
      if (!session?.user) {
        setActiveSection("today");
        resetDailyLearningState();
        setLanguagePreferenceLoaded(false);
        setLearningSettings(defaultLearningSettings);
      }
    });

    return () => {
      isMounted = false;
      subscription.unsubscribe();
    };
  }, [isDemoRoute, resetDailyLearningState]);

  useEffect(() => {
    if (isDemoRoute) {
      setLanguagePreferenceLoaded(true);
      savedLanguageRef.current = language;
      return undefined;
    }

    if (!user) {
      setLanguagePreferenceLoaded(false);
      return undefined;
    }

    let isMounted = true;
    setLanguagePreferenceLoaded(false);

    getLanguagePreference(user.id)
      .then((savedLanguage) => {
        if (!isMounted) return;
        if (savedLanguage) {
          savedLanguageRef.current = savedLanguage;
          setLanguage(savedLanguage);
        } else {
          savedLanguageRef.current = language;
        }
        setLanguagePreferenceLoaded(true);
      })
      .catch((error) => {
        if (!isMounted) return;
        console.warn("Language preference could not be loaded.", error);
        savedLanguageRef.current = language;
        setLanguagePreferenceLoaded(true);
      });

    return () => {
      isMounted = false;
    };
  }, [isDemoRoute, language, setLanguage, user]);

  useEffect(() => {
    if (isDemoRoute) {
      setLearningSettings(defaultLearningSettings);
      return undefined;
    }

    if (!user) {
      setLearningSettings(defaultLearningSettings);
      return undefined;
    }

    let isMounted = true;

    getLearningPreferences(user.id)
      .then((savedSettings) => {
        if (!isMounted) return;
        setLearningSettings(savedSettings);
      })
      .catch((error) => {
        if (!isMounted) return;
        console.warn("Learning settings could not be loaded.", error);
        setLearningSettings(defaultLearningSettings);
      });

    return () => {
      isMounted = false;
    };
  }, [isDemoRoute, user]);

  useEffect(() => {
    if (isDemoRoute) return;
    if (!user || !languagePreferenceLoaded) return;
    if (language === savedLanguageRef.current) return;

    updateLanguagePreference(user.id, language)
      .then((savedLanguage) => {
        savedLanguageRef.current = savedLanguage;
      })
      .catch((error) => {
        console.warn("Language preference could not be saved.", error);
      });
  }, [isDemoRoute, language, languagePreferenceLoaded, user]);

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

  const visibleDailyProgress = isDemoRoute ? demoDailyProgress : dailyProgress;

  function completeTask(task) {
    if (isDemoRoute) {
      setDemoDailyProgress((current) => ({
        ...current,
        date: createDailyProgress().date,
        [task]: true,
      }));
      return;
    }

    completeDailyTask(task);
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

  async function handleAuthSubmit({ email, mode, password, username }) {
    setAuthLoading(true);
    setAuthError("");

    try {
      if (mode === "sign-up") {
        await signUpWithEmail(username, email, password);
      } else {
        await signInWithEmail(username, password);
      }
    } catch (error) {
      setAuthError(getFriendlyAuthError(error));
    } finally {
      setAuthLoading(false);
    }
  }

  async function handleSignOut() {
    if (isDemoRoute) {
      window.location.href = "/";
      return;
    }

    setAuthLoading(true);
    setDataError("");

    try {
      await signOutUser();
      setUser(null);
      resetDailyLearningState();
      setLanguagePreferenceLoaded(false);
      setLearningSettings(defaultLearningSettings);
    } catch (error) {
      setDataError(error.message);
    } finally {
      setAuthLoading(false);
    }
  }

  async function saveItem(event) {
    event.preventDefault();
    if (!user) return;

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
      await notes.save(nextItem, editingItem?.id);
      if (!editingItem) {
        completeTask("addNote");
      }
      setEditorError("");
      setIsEditorOpen(false);
    } catch (error) {
      setEditorError(error.message);
    }
  }

  async function deleteItem(item) {
    if (!user) return;

    const shouldDelete = window.confirm(`Delete "${item.french}"?`);
    if (!shouldDelete) return;

    await notes.deleteOne(item.id);
  }

  async function deleteSelected() {
    if (selectedIds.length === 0 || !user) return;
    const shouldDelete = window.confirm(
      `Delete ${selectedIds.length} selected note${selectedIds.length === 1 ? "" : "s"}?`
    );
    if (!shouldDelete) return;

    await notes.deleteSelected();
  }

  const ActiveView = viewBySection[activeSection] ?? TodayView;
  const displayName = getDisplayName(user);
  const isStudyStateLoading = shouldDelayStudyMount({
    activeSection,
    dailyStateLoaded,
    isDemo: isDemoRoute,
  });
  const isQuizStateLoading =
    !isDemoRoute && activeSection === "quiz" && !dailyStateLoaded;
  const pageTitle =
    activeSection === "today"
      ? t("todayTitle", "Bonjour, {username}. Ready for 12 minutes of French?", {
          username: displayName,
        })
      : t(categories[activeSection].labelKey, categories[activeSection].label);

  const viewProps = {
    activeSection,
    dailyProgress: visibleDailyProgress,
    filteredItems,
    items,
    markReviewed: notes.markReviewed,
    onClearSelection: notes.clearSelection,
    onDeleteItem: deleteItem,
    onDeleteSelected: deleteSelected,
    onSelectItems: notes.selectItems,
    onToggleSelected: notes.toggleSelected,
    openEditItem,
    openNewItem,
    onQuizAnswer: notes.recordQuizCorrect,
    importJob,
    onCancelImport: cancelImportJob,
    onStartImport: startImportJob,
    onUpdateImportJob: updateImportJob,
    onQuizComplete: () => completeTask("quiz"),
    onQuizStateChange: dailyStateLoaded ? setDailyQuizState : undefined,
    onStartStudy: () => setActiveSection("review"),
    onStartQuiz: () => setActiveSection("quiz"),
    onStudyComplete: () => completeTask("study"),
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
        error={authError}
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
          {dataError && (
            <div className="rounded-xl border border-frenchRed/25 bg-blush p-3 text-sm font-medium text-frenchRed">
              {dataError}
            </div>
          )}
          {notes.isLoading && items.length === 0 && (
            <div className="app-card p-3 text-sm font-medium text-inkSecondary">
              {t("loadingNotes", "Loading notes...")}
            </div>
          )}
          {isStudyStateLoading || isQuizStateLoading ? (
            <div className="app-card p-5 text-sm font-medium text-inkSecondary">
              {t("loadingLearningState", "Loading your saved learning session...")}
            </div>
          ) : (
            <ActiveView {...viewProps} />
          )}
        </section>
      </main>

      {isEditorOpen && (
        <EditorModal
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
