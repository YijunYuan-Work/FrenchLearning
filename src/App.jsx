import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  signInWithEmail,
  signOut as signOutUser,
  signUpWithEmail,
} from "./api/auth";
import {
  createNote,
  deleteNote as deleteStoredNote,
  listNotes,
  updateNote,
} from "./api/notes";
import {
  getLearningPreferences,
  getLanguagePreference,
  updateLanguagePreference,
} from "./api/preferences";
import { AppHeader } from "./components/AppHeader";
import { EditorModal } from "./components/EditorModal";
import { FrenchInTheWild } from "./components/FrenchInTheWild";
import { PracticeQueue } from "./components/PracticeQueue";
import { Sidebar } from "./components/Sidebar";
import { categories } from "./data/categories";
import { hasSupabaseConfig, supabase } from "./lib/supabase";
import { useDailyLearningState } from "./hooks/useDailyLearningState";
import { useLanguage } from "./i18n/LanguageContext";
import { SetupPage } from "./pages/SetupPage";
import { SignInPage } from "./pages/SignInPage";
import { autoFillFrenchVocabulary } from "./services/vocabularyAutofill";
import { normalizeTags } from "./utils/tags";
import { MAX_CONFIDENCE } from "./utils/quiz";
import { isRichTextEmpty, sanitizeRichTextHtml } from "./utils/richText";
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

function wait(ms) {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function isTemporaryWiktionaryError(error) {
  return error?.code === "WIKTIONARY_TEMPORARY" || error?.status === 503;
}

function getImportRetryDelay(error, attempt) {
  const retryAfterMs = Number(error?.retryAfterMs);
  if (Number.isFinite(retryAfterMs) && retryAfterMs > 0) {
    return Math.min(retryAfterMs + 750, 30000);
  }

  return Math.min(2500 * attempt, 10000);
}

function getDisplayName(user) {
  return (
    user?.user_metadata?.name ||
    user?.user_metadata?.username ||
    user?.email?.split("@")[0] ||
    "Learner"
  );
}

export default function App() {
  const { language, setLanguage, t } = useLanguage();
  const [items, setItems] = useState([]);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(hasSupabaseConfig);
  const [authError, setAuthError] = useState("");
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [languagePreferenceLoaded, setLanguagePreferenceLoaded] = useState(false);
  const [learningSettings, setLearningSettings] = useState(defaultLearningSettings);
  const [activeSection, setActiveSection] = useState("today");
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("all");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editorError, setEditorError] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [form, setForm] = useState(emptyForm);
  const savedLanguageRef = useRef(language);
  const {
    completeDailyTask,
    dailyProgress,
    dailyQuizState,
    dailyStateLoaded,
    resetDailyLearningState,
    setDailyQuizState,
  } = useDailyLearningState(user, setDataError);

  useEffect(() => {
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
        setItems([]);
        setSelectedIds([]);
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
  }, []);

  useEffect(() => {
    if (!user) return;

    let isMounted = true;
    setDataLoading(true);
    setDataError("");

    listNotes(user.id)
      .then((savedNotes) => {
        if (!isMounted) return;
        setItems(savedNotes);
        setSelectedIds([]);
      })
      .catch((error) => {
        if (!isMounted) return;
        setDataError(error.message);
      })
      .finally(() => {
        if (isMounted) {
          setDataLoading(false);
        }
      });

    return () => {
      isMounted = false;
    };
  }, [user]);

  useEffect(() => {
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
  }, [setLanguage, user]);

  useEffect(() => {
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
  }, [user]);

  useEffect(() => {
    if (!user || !languagePreferenceLoaded) return;
    if (language === savedLanguageRef.current) return;

    updateLanguagePreference(user.id, language)
      .then((savedLanguage) => {
        savedLanguageRef.current = savedLanguage;
      })
      .catch((error) => {
        console.warn("Language preference could not be saved.", error);
      });
  }, [language, languagePreferenceLoaded, user]);

  const tags = useMemo(() => {
    const unique = new Set(items.flatMap((item) => item.tags ?? []));
    return ["all", ...Array.from(unique).sort()];
  }, [items]);

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
    setAuthLoading(true);
    setDataError("");

    try {
      await signOutUser();
      setUser(null);
      setItems([]);
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

    const normalizedFrench = form.french.trim().toLocaleLowerCase("fr");
    const duplicate = items.find(
      (item) =>
        item.id !== editingItem?.id &&
        item.category === form.category &&
        item.french.trim().toLocaleLowerCase("fr") === normalizedFrench
    );

    if (duplicate) {
      setEditorError(
        t("duplicateNote", '"{word}" already exists in {category}.', {
          word: form.french.trim(),
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
      id: editingItem?.id ?? crypto.randomUUID(),
      ...normalizeWordDetails(form),
      tags: normalizeTags(form.tags),
      confidence: Number(form.confidence),
      lastReviewed: editingItem?.lastReviewed ?? "Not reviewed",
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
      const savedItem = editingItem
        ? await updateNote(editingItem.id, nextItem, user.id)
        : await createNote(nextItem, user.id);

      setItems((current) =>
        editingItem
          ? current.map((item) => (item.id === editingItem.id ? savedItem : item))
          : [savedItem, ...current]
      );
      if (!editingItem) {
        completeDailyTask("addNote");
      }
      setSelectedIds((current) => current.filter((id) => id !== savedItem.id));
      setEditorError("");
      setDataError("");
      setIsEditorOpen(false);
    } catch (error) {
      setEditorError(error.message);
    }
  }

  async function importVocabularyWords(words, onProgress, shouldCancel) {
    if (!user) return [];

    const results = [];
    const seenInFile = new Set();
    const knownWords = new Set(
      items
        .filter((item) => item.category === "vocabulary")
        .map((item) => item.french.trim().toLocaleLowerCase("fr"))
    );

    for (const [index, rawWord] of words.entries()) {
      if (shouldCancel?.()) {
        break;
      }

      const word = rawWord.trim();
      const normalizedWord = word.toLocaleLowerCase("fr");
      onProgress?.(index + 1, words.length);

      if (!word) {
        results.push({
          word: rawWord,
          status: "skipped",
          reason: t("importReasonEmpty", "Empty entry."),
        });
        continue;
      }

      if (seenInFile.has(normalizedWord)) {
        results.push({
          word,
          status: "skipped",
          reason: t("importReasonDuplicateFile", "Duplicate in this file."),
        });
        continue;
      }
      seenInFile.add(normalizedWord);

      if (knownWords.has(normalizedWord)) {
        results.push({
          word,
          status: "skipped",
          reason: t("importReasonDuplicate", "Already exists in Vocabulary."),
        });
        continue;
      }

      try {
        let result;
        for (let attempt = 1; attempt <= 3; attempt += 1) {
          try {
            result = await autoFillFrenchVocabulary(word, language);
            break;
          } catch (error) {
            if (
              !isTemporaryWiktionaryError(error) ||
              attempt === 3 ||
              shouldCancel?.()
            ) {
              throw error;
            }

            await wait(getImportRetryDelay(error, attempt));
          }
        }

        const resultWordKey = result.word.trim().toLocaleLowerCase("fr");
        if (knownWords.has(resultWordKey)) {
          results.push({
            word,
            status: "skipped",
            reason: t("importReasonDuplicate", "Already exists in Vocabulary."),
          });
          continue;
        }

        const nextItem = {
          ...emptyForm,
          category: "vocabulary",
          french: result.word,
          partOfSpeech: result.partOfSpeech,
          ipa: result.ipa,
          gender: result.gender,
          conjugation: result.conjugation ?? createEmptyWordDetails().conjugation,
          adjectiveForms:
            result.adjectiveForms ?? createEmptyWordDetails().adjectiveForms,
          english: result.english,
          example: result.example,
          notes: result.notes,
          tags: result.tags ?? [],
          confidence: 1,
          lastReviewed: "Not reviewed",
        };
        const savedItem = await createNote(nextItem, user.id);

        knownWords.add(savedItem.french.trim().toLocaleLowerCase("fr"));
        setItems((current) => [savedItem, ...current]);
        completeDailyTask("addNote");
        results.push({
          word,
          status: "added",
          reason: t("importReasonAdded", "Added successfully."),
        });
      } catch (error) {
        results.push({
          word,
          status: "failed",
          reason: error.message,
        });
      } finally {
        if (!shouldCancel?.()) {
          await wait(900);
        }
      }
    }

    return results;
  }

  async function importPhraseRows(rows, onProgress, shouldCancel) {
    if (!user) return [];

    const results = [];
    const seenInFile = new Set();
    const knownPhrases = new Set(
      items
        .filter((item) => item.category === "phrases")
        .map((item) => item.french.trim().toLocaleLowerCase("fr"))
    );

    for (const [index, row] of rows.entries()) {
      if (shouldCancel?.()) {
        break;
      }

      const french = row.french.trim();
      const english = row.english.trim();
      const normalizedFrench = french.toLocaleLowerCase("fr");
      onProgress?.(index + 1, rows.length);

      if (!french || !english) {
        results.push({
          word: french || english || t("unknown", "Unknown"),
          item: row,
          status: "skipped",
          reason: t(
            "importReasonMissingPhraseColumns",
            "Missing French phrase or translation."
          ),
        });
        continue;
      }

      if (seenInFile.has(normalizedFrench)) {
        results.push({
          word: french,
          item: row,
          status: "skipped",
          reason: t("importReasonDuplicateFile", "Duplicate in this file."),
        });
        continue;
      }
      seenInFile.add(normalizedFrench);

      if (knownPhrases.has(normalizedFrench)) {
        results.push({
          word: french,
          item: row,
          status: "skipped",
          reason: t("importReasonDuplicatePhrase", "Already exists in Short phrases."),
        });
        continue;
      }

      try {
        const nextItem = {
          ...emptyForm,
          category: "phrases",
          french,
          english,
          example: "",
          notes: "",
          tags: row.tags ?? [],
          confidence: 1,
          lastReviewed: "Not reviewed",
          ...createEmptyWordDetails(),
        };
        const savedItem = await createNote(nextItem, user.id);

        knownPhrases.add(savedItem.french.trim().toLocaleLowerCase("fr"));
        setItems((current) => [savedItem, ...current]);
        completeDailyTask("addNote");
        results.push({
          word: french,
          item: row,
          status: "added",
          reason: t("importReasonAdded", "Added successfully."),
        });
      } catch (error) {
        results.push({
          word: french,
          item: row,
          status: "failed",
          reason: error.message,
        });
      }
    }

    return results;
  }

  async function markReviewed(item, delta) {
    if (!user) return;

    const nextItem = {
      ...item,
      confidence: Math.min(4, Math.max(1, Number(item.confidence) + delta)),
      lastReviewed: "Today",
    };

    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id ? nextItem : entry
      )
    );

    try {
      const savedItem = await updateNote(item.id, nextItem, user.id);
      setItems((current) =>
        current.map((entry) => (entry.id === item.id ? savedItem : entry))
      );
      setDataError("");
    } catch (error) {
      setDataError(error.message);
      setItems((current) =>
        current.map((entry) => (entry.id === item.id ? item : entry))
      );
    }
  }

  async function handleQuizAnswer(itemId, isCorrect) {
    if (!isCorrect || !user) return;

    const currentItem = items.find((item) => item.id === itemId);
    if (!currentItem) return;

    const nextItem = {
      ...currentItem,
      confidence: Math.min(4, Number(currentItem.confidence) + 1),
      lastReviewed: "Today",
    };

    setItems((current) =>
      current.map((entry) =>
        entry.id === itemId ? nextItem : entry
      )
    );

    try {
      const savedItem = await updateNote(itemId, nextItem, user.id);
      setItems((current) =>
        current.map((entry) => (entry.id === itemId ? savedItem : entry))
      );
      setDataError("");
    } catch (error) {
      setDataError(error.message);
      setItems((current) =>
        current.map((entry) => (entry.id === itemId ? currentItem : entry))
      );
    }
  }

  async function handleStudyConfidenceChange(itemId, nextConfidence) {
    if (!user) return;

    const currentItem = items.find((item) => item.id === itemId);
    if (!currentItem) return;

    const nextItem = {
      ...currentItem,
      confidence: Math.min(4, Math.max(1, Number(nextConfidence))),
      lastReviewed: "Today",
    };

    setItems((current) =>
      current.map((entry) => (entry.id === itemId ? nextItem : entry))
    );

    try {
      const savedItem = await updateNote(itemId, nextItem, user.id);
      setItems((current) =>
        current.map((entry) => (entry.id === itemId ? savedItem : entry))
      );
      setDataError("");
    } catch (error) {
      setDataError(error.message);
      setItems((current) =>
        current.map((entry) => (entry.id === itemId ? currentItem : entry))
      );
    }
  }

  function toggleSelected(id) {
    setSelectedIds((current) =>
      current.includes(id)
        ? current.filter((selectedId) => selectedId !== id)
        : [...current, id]
    );
  }

  function selectItems(ids, shouldSelect) {
    setSelectedIds((current) => {
      if (!shouldSelect) {
        return current.filter((id) => !ids.includes(id));
      }

      return Array.from(new Set([...current, ...ids]));
    });
  }

  function clearSelection() {
    setSelectedIds([]);
  }

  async function deleteItem(item) {
    if (!user) return;

    const shouldDelete = window.confirm(`Delete "${item.french}"?`);
    if (!shouldDelete) return;

    try {
      await deleteStoredNote(item.id, user.id);
      setItems((current) => current.filter((entry) => entry.id !== item.id));
      setSelectedIds((current) => current.filter((id) => id !== item.id));
      setDataError("");
    } catch (error) {
      setDataError(error.message);
    }
  }

  async function deleteSelected() {
    if (selectedIds.length === 0 || !user) return;
    const shouldDelete = window.confirm(
      `Delete ${selectedIds.length} selected note${selectedIds.length === 1 ? "" : "s"}?`
    );
    if (!shouldDelete) return;

    try {
      await Promise.all(
        selectedIds.map((id) => deleteStoredNote(id, user.id))
      );
      setItems((current) =>
        current.filter((entry) => !selectedIds.includes(entry.id))
      );
      setSelectedIds([]);
      setDataError("");
    } catch (error) {
      setDataError(error.message);
    }
  }

  const ActiveView = viewBySection[activeSection] ?? TodayView;
  const displayName = getDisplayName(user);
  const pageTitle =
    activeSection === "today"
      ? t("todayTitle", "Bonjour, {username}. Ready for 12 minutes of French?", {
          username: displayName,
        })
      : t(categories[activeSection].labelKey, categories[activeSection].label);

  const viewProps = {
    filteredItems,
    items,
    markReviewed,
    onClearSelection: clearSelection,
    onDeleteItem: deleteItem,
    onDeleteSelected: deleteSelected,
    onSelectItems: selectItems,
    onToggleSelected: toggleSelected,
    openEditItem,
    openNewItem,
    onQuizAnswer: handleQuizAnswer,
    onImportPhrases: importPhraseRows,
    onImportVocabulary: importVocabularyWords,
    onQuizComplete: () => completeDailyTask("quiz"),
    onQuizStateChange: dailyStateLoaded ? setDailyQuizState : undefined,
    onStartStudy: () => setActiveSection("review"),
    onStartQuiz: () => setActiveSection("quiz"),
    onStudyComplete: () => completeDailyTask("study"),
    onStudyConfidenceChange: handleStudyConfidenceChange,
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
    user,
  };

  if (!hasSupabaseConfig) {
    return <SetupPage />;
  }

  if (authLoading && !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-cloud px-4 text-ink">
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
    <div className="min-h-screen overflow-x-hidden bg-cloud text-ink">
      <div className="grid min-h-screen min-w-0 lg:grid-cols-[272px_1fr]">
        <Sidebar
          activeSection={activeSection}
          dailyProgress={dailyProgress}
          setActiveSection={setActiveSection}
        />

        <main className="min-w-0">
          <AppHeader
            activeSection={activeSection}
            onSignOut={handleSignOut}
            openNewItem={openNewItem}
            pageTitle={pageTitle}
            user={user}
          />

          <section
            className={`grid gap-4 px-3 py-4 sm:px-4 sm:py-5 md:px-7 lg:gap-5 lg:py-7 ${
              activeSection === "today" ||
              activeSection === "quiz" ||
              activeSection === "review" ||
              activeSection === "import" ||
              activeSection === "settings"
                ? ""
                : "xl:grid-cols-[minmax(0,1fr)_320px]"
            }`}
          >
            {dataError && (
              <div className="rounded-xl border border-frenchRed/25 bg-blush p-3 text-sm font-bold text-frenchRed xl:col-span-2">
                {dataError}
              </div>
            )}
            {dataLoading && (
              <div className="app-card p-3 text-sm font-bold text-slate-600 xl:col-span-2">
                {t("loadingNotes", "Loading notes...")}
              </div>
            )}
            <ActiveView {...viewProps} />

            {activeSection !== "today" &&
              activeSection !== "quiz" &&
              activeSection !== "review" &&
              activeSection !== "import" &&
              activeSection !== "settings" && (
              <aside className="grid content-start gap-4">
                <PracticeQueue items={weakItems} markReviewed={markReviewed} />
                <FrenchInTheWild />
              </aside>
            )}
          </section>
        </main>
      </div>

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
