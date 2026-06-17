import React, { useEffect, useMemo, useState } from "react";
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
import { useLanguage } from "./i18n/LanguageContext";
import { SetupPage } from "./pages/SetupPage";
import { SignInPage } from "./pages/SignInPage";
import { normalizeTags } from "./utils/tags";
import { MAX_CONFIDENCE } from "./utils/quiz";
import { GrammarView } from "./views/GrammarView";
import { PhrasesView } from "./views/PhrasesView";
import { PronunciationView } from "./views/PronunciationView";
import { QuizView } from "./views/QuizView";
import { ReviewView } from "./views/ReviewView";
import { TodayView } from "./views/TodayView";
import { VocabularyView } from "./views/VocabularyView";
import { createEmptyWordDetails, normalizeWordDetails } from "./data/wordFields";

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

export default function App() {
  const { language, setLanguage, t } = useLanguage();
  const [items, setItems] = useState([]);
  const [user, setUser] = useState(null);
  const [authLoading, setAuthLoading] = useState(hasSupabaseConfig);
  const [authError, setAuthError] = useState("");
  const [dataLoading, setDataLoading] = useState(false);
  const [dataError, setDataError] = useState("");
  const [languagePreferenceLoaded, setLanguagePreferenceLoaded] = useState(false);
  const [activeSection, setActiveSection] = useState("today");
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("all");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editorError, setEditorError] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [form, setForm] = useState(emptyForm);

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
        setLanguagePreferenceLoaded(false);
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
          setLanguage(savedLanguage);
        }
        setLanguagePreferenceLoaded(true);
      })
      .catch((error) => {
        if (!isMounted) return;
        setDataError(error.message);
        setLanguagePreferenceLoaded(true);
      });

    return () => {
      isMounted = false;
    };
  }, [setLanguage, user]);

  useEffect(() => {
    if (!user || !languagePreferenceLoaded) return;

    updateLanguagePreference(user.id, language).catch((error) => {
      setDataError(error.message);
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
        activeSection === "today"
          ? true
          : activeSection === "review"
            ? Number(item.confidence) < MAX_CONFIDENCE
            : item.category === activeSection;
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
      const authenticatedUser =
        mode === "sign-up"
          ? await signUpWithEmail(username, email, password)
          : await signInWithEmail(username, password);
      setUser(authenticatedUser);
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
      setLanguagePreferenceLoaded(false);
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

    try {
      const savedItem = editingItem
        ? await updateNote(editingItem.id, nextItem, user.id)
        : await createNote(nextItem, user.id);

      setItems((current) =>
        editingItem
          ? current.map((item) => (item.id === editingItem.id ? savedItem : item))
          : [savedItem, ...current]
      );
      setSelectedIds((current) => current.filter((id) => id !== savedItem.id));
      setEditorError("");
      setDataError("");
      setIsEditorOpen(false);
    } catch (error) {
      setEditorError(error.message);
    }
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
  const pageTitle =
    activeSection === "today"
      ? t("todayTitle", "Bonjour, John. Ready for 12 minutes of French?")
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
    onStartStudy: () => setActiveSection("review"),
    onStartQuiz: () => setActiveSection("quiz"),
    query,
    selectedTag,
    selectedIds,
    setQuery,
    setSelectedTag,
    stats,
    tags,
    weakItems,
    user,
  };

  if (!hasSupabaseConfig) {
    return <SetupPage />;
  }

  if (authLoading && !user) {
    return (
      <div className="grid min-h-screen place-items-center bg-cloud px-4 text-ink">
        <div className="rounded-md border border-frenchBlue/10 bg-paper p-5 font-semibold shadow-soft">
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
    <div className="min-h-screen bg-cloud text-ink">
      <div className="grid min-h-screen lg:grid-cols-[260px_1fr]">
        <Sidebar
          activeSection={activeSection}
          setActiveSection={setActiveSection}
          stats={stats}
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
            className={`grid gap-5 px-4 py-5 md:px-7 ${
              activeSection === "today" ||
              activeSection === "quiz" ||
              activeSection === "review"
                ? ""
                : "xl:grid-cols-[1fr_320px]"
            }`}
          >
            {dataError && (
              <div className="rounded-md border border-frenchRed/20 bg-frenchRed/10 p-3 text-sm font-semibold text-frenchRed xl:col-span-2">
                {dataError}
              </div>
            )}
            {dataLoading && (
              <div className="rounded-md border border-frenchBlue/10 bg-paper p-3 text-sm font-semibold text-slate-600 xl:col-span-2">
                {t("loadingNotes", "Loading notes...")}
              </div>
            )}
            <ActiveView {...viewProps} />

            {activeSection !== "today" &&
              activeSection !== "quiz" &&
              activeSection !== "review" && (
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
