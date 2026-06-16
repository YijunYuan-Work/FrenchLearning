import React, { useEffect, useMemo, useState } from "react";
import { AppHeader } from "./components/AppHeader";
import { EditorModal } from "./components/EditorModal";
import { FrenchInTheWild } from "./components/FrenchInTheWild";
import { PracticeQueue } from "./components/PracticeQueue";
import { Sidebar } from "./components/Sidebar";
import { categories } from "./data/categories";
import { legacySampleIds, loadItems, saveItems } from "./data/storage";
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

export default function App() {
  const [items, setItems] = useState(loadItems);
  const [activeSection, setActiveSection] = useState("today");
  const [query, setQuery] = useState("");
  const [selectedTag, setSelectedTag] = useState("all");
  const [isEditorOpen, setIsEditorOpen] = useState(false);
  const [editingItem, setEditingItem] = useState(null);
  const [editorError, setEditorError] = useState("");
  const [selectedIds, setSelectedIds] = useState([]);
  const [form, setForm] = useState(emptyForm);

  useEffect(() => {
    saveItems(items);
  }, [items]);

  useEffect(() => {
    if (items.some((item) => legacySampleIds.has(item.id))) {
      setItems([]);
      setQuery("");
      setSelectedTag("all");
      setActiveSection("today");
    }
  }, [items]);

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

  function saveItem(event) {
    event.preventDefault();
    const normalizedFrench = form.french.trim().toLocaleLowerCase("fr");
    const duplicate = items.find(
      (item) =>
        item.id !== editingItem?.id &&
        item.category === form.category &&
        item.french.trim().toLocaleLowerCase("fr") === normalizedFrench
    );

    if (duplicate) {
      setEditorError(
        `"${form.french.trim()}" already exists in ${categories[form.category].label}.`
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

    setItems((current) =>
      editingItem
        ? current.map((item) => (item.id === editingItem.id ? nextItem : item))
        : [nextItem, ...current]
    );
    setSelectedIds((current) => current.filter((id) => id !== nextItem.id));
    setEditorError("");
    setIsEditorOpen(false);
  }

  function markReviewed(item, delta) {
    setItems((current) =>
      current.map((entry) =>
        entry.id === item.id
          ? {
              ...entry,
              confidence: Math.min(4, Math.max(1, entry.confidence + delta)),
              lastReviewed: "Today",
            }
          : entry
      )
    );
  }

  function handleQuizAnswer(itemId, isCorrect) {
    if (!isCorrect) return;

    setItems((current) =>
      current.map((entry) =>
        entry.id === itemId
          ? {
              ...entry,
              confidence: Math.min(4, Number(entry.confidence) + 1),
              lastReviewed: "Today",
            }
          : entry
      )
    );
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

  function deleteItem(item) {
    const shouldDelete = window.confirm(`Delete "${item.french}"?`);
    if (!shouldDelete) return;

    setItems((current) => current.filter((entry) => entry.id !== item.id));
    setSelectedIds((current) => current.filter((id) => id !== item.id));
  }

  function deleteSelected() {
    if (selectedIds.length === 0) return;
    const shouldDelete = window.confirm(
      `Delete ${selectedIds.length} selected note${selectedIds.length === 1 ? "" : "s"}?`
    );
    if (!shouldDelete) return;

    setItems((current) =>
      current.filter((entry) => !selectedIds.includes(entry.id))
    );
    setSelectedIds([]);
  }

  const ActiveView = viewBySection[activeSection] ?? TodayView;
  const pageTitle =
    activeSection === "today"
      ? "Bonjour, John. Ready for 12 minutes of French?"
      : categories[activeSection].label;

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
  };

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
            openNewItem={openNewItem}
            pageTitle={pageTitle}
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
          title={editingItem ? "Edit learning note" : "Add learning note"}
        />
      )}
    </div>
  );
}
