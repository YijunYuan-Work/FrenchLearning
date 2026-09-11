import { Plus } from "lucide-react";
import { useMemo, useState } from "react";
import { LearningCard } from "../components/LearningCard";
import { Metric } from "../components/Metric";
import { NotesToolbar } from "../components/NotesToolbar";
import { PaginationControls } from "../components/PaginationControls";
import { SelectionToolbar } from "../components/SelectionToolbar";
import { categories } from "../data/categories";
import { useLanguage } from "../i18n/LanguageContext";
import { scrollToPageTop } from "../utils/scroll";

const DEFAULT_ITEMS_PER_PAGE = 10;

export function NotesView({
  activeSection,
  allowConfidenceActions = true,
  filteredItems,
  itemsPerPage = DEFAULT_ITEMS_PER_PAGE,
  items,
  markReviewed,
  onClearSelection,
  onDeleteItem,
  onDeleteSelected,
  onSelectItems,
  onToggleSelected,
  openEditItem,
  openNewItem,
  query,
  selectedTag,
  selectedIds,
  setQuery,
  setSelectedTag,
  tags,
}) {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
  const metricItems = useMemo(() => {
    if (!activeSection || !categories[activeSection]) {
      return items;
    }

    return items.filter((item) => item.category === activeSection);
  }, [activeSection, items]);
  const sectionStats = useMemo(() => {
    const confidenceTotal = metricItems.reduce(
      (sum, item) => sum + Number(item.confidence ?? 0),
      0
    );
    const uniqueTags = new Set(metricItems.flatMap((item) => item.tags ?? []));

    return {
      average: metricItems.length
        ? Math.round((confidenceTotal / (metricItems.length * 4)) * 100)
        : 0,
      tags: uniqueTags.size,
      total: metricItems.length,
      weak: metricItems.filter((item) => Number(item.confidence) <= 2).length,
    };
  }, [metricItems]);
  const totalMetricLabel =
    activeSection && categories[activeSection]
      ? t(categories[activeSection].labelKey, categories[activeSection].label)
      : t("savedNotes", "Saved notes");
  const totalPages = Math.max(1, Math.ceil(filteredItems.length / itemsPerPage));
  const safePage = Math.min(page, totalPages);
  const visibleItems = useMemo(
    () =>
      filteredItems.slice(
        (safePage - 1) * itemsPerPage,
        safePage * itemsPerPage
      ),
    [filteredItems, itemsPerPage, safePage]
  );

  function changePage(nextPage) {
    setPage(nextPage);
    scrollToPageTop();
  }

  return (
    <div className="min-w-0">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label={totalMetricLabel} value={sectionStats.total} />
        <Metric label={t("needsPractice", "Needs practice")} value={sectionStats.weak} tone="red" />
        <Metric label={t("activeTags", "Active tags")} value={sectionStats.tags} tone="blue" />
        <Metric label={t("confidence", "Confidence")} value={`${sectionStats.average}%`} tone="green" />
      </div>

      <NotesToolbar
        query={query}
        selectedTag={selectedTag}
        setQuery={setQuery}
        setSelectedTag={setSelectedTag}
        tags={tags}
      />

      <div className="mt-5 grid gap-3">
        <PaginationControls
          itemLabel="items"
          itemsPerPage={itemsPerPage}
          onNext={() => changePage(Math.min(totalPages, safePage + 1))}
          onPrevious={() => changePage(Math.max(1, safePage - 1))}
          page={safePage}
          totalItems={filteredItems.length}
          totalPages={totalPages}
        />
        <SelectionToolbar
          onClearSelection={onClearSelection}
          onDeleteSelected={onDeleteSelected}
          onSelectItems={onSelectItems}
          selectedIds={selectedIds}
          visibleItems={visibleItems}
        />

        {visibleItems.map((item) => (
          <LearningCard
            isSelected={selectedIds.includes(item.id)}
            item={item}
            key={item.id}
            allowConfidenceActions={allowConfidenceActions}
            markReviewed={markReviewed}
            onDeleteItem={onDeleteItem}
            onToggleSelected={onToggleSelected}
            openEditItem={openEditItem}
          />
        ))}
        {filteredItems.length === 0 && (
          <div className="rounded-xl border border-dashed border-frenchBlue/30 bg-sky/40 p-8 text-center">
            <p className="font-black">
              {items.length === 0
                ? t("yourNotebookReady", "Your French notebook is ready.")
                : t("noNotesMatch", "No notes match this view.")}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {items.length === 0
                ? t(
                    "addFirstNoteCopy",
                    "Add your first vocabulary word, phrase, grammar note, or pronunciation reminder."
                  )
                : t("tryAnotherTag", "Try another tag or add a new French note.")}
            </p>
            {items.length === 0 && (
              <button
                className="primary-action mt-4 h-10"
                onClick={() => openNewItem("vocabulary")}
                type="button"
              >
                <Plus size={17} />
                {t("addFirstNote", "Add first note")}
              </button>
            )}
          </div>
        )}
        <PaginationControls
          itemLabel="items"
          itemsPerPage={itemsPerPage}
          onNext={() => changePage(Math.min(totalPages, safePage + 1))}
          onPrevious={() => changePage(Math.max(1, safePage - 1))}
          page={safePage}
          totalItems={filteredItems.length}
          totalPages={totalPages}
        />
      </div>
    </div>
  );
}
