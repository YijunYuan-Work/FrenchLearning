import { Plus, Search, Tags } from "lucide-react";
import { useMemo, useState } from "react";
import { LearningCard } from "../components/LearningCard";
import { Metric } from "../components/Metric";
import { PaginationControls } from "../components/PaginationControls";
import { SelectionToolbar } from "../components/SelectionToolbar";
import { useLanguage } from "../i18n/LanguageContext";

const DEFAULT_ITEMS_PER_PAGE = 10;

export function NotesView({
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
  showList = true,
  showMetrics = true,
  stats,
  tags,
  topContent,
}) {
  const { t } = useLanguage();
  const [page, setPage] = useState(1);
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

  return (
    <div className="min-w-0">
      {showMetrics && (
        <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
          <Metric label={t("savedNotes", "Saved notes")} value={stats.total} />
          <Metric label={t("needsPractice", "Needs practice")} value={stats.weak} tone="red" />
          <Metric label={t("activeTags", "Active tags")} value={stats.tags} tone="blue" />
          <Metric label={t("confidence", "Confidence")} value={`${stats.average}%`} tone="green" />
        </div>
      )}

      <div className="mt-5 flex flex-col gap-3 rounded-md border border-frenchBlue/10 bg-paper p-3 md:flex-row">
        <label className="relative flex-1">
          <Search
            className="pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-slate-400"
            size={18}
          />
          <input
            className="focus-ring h-11 w-full rounded-md border border-slate-200 bg-white pl-10 pr-3 text-sm"
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t("searchPlaceholder", "Search words, phrases, grammar, tags...")}
            value={query}
          />
        </label>
        <label className="flex min-w-[210px] items-center gap-2 rounded-md border border-slate-200 bg-white px-3">
          <Tags size={17} className="text-slate-500" />
          <select
            className="focus-ring h-10 flex-1 bg-transparent text-sm"
            onChange={(event) => setSelectedTag(event.target.value)}
            value={selectedTag}
          >
            {tags.map((tag) => (
              <option key={tag} value={tag}>
                {tag === "all" ? t("allTags", "All tags") : tag}
              </option>
            ))}
          </select>
        </label>
      </div>

      {topContent}

      {showList && (
        <div className="mt-5 grid gap-3">
          <PaginationControls
            itemLabel="items"
            itemsPerPage={itemsPerPage}
            onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
            onPrevious={() => setPage((current) => Math.max(1, current - 1))}
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
            <div className="rounded-md border border-dashed border-frenchBlue/25 bg-paper p-8 text-center">
              <p className="font-semibold">
                {items.length === 0
                  ? t("yourNotebookReady", "Your French notebook is ready.")
                  : t("noNotesMatch", "No notes match this view.")}
              </p>
              <p className="mt-1 text-sm text-slate-600">
                {items.length === 0
                  ? t(
                      "addFirstNoteCopy",
                      "Add your first vocabulary word, phrase, grammar note, or pronunciation reminder."
                    )
                  : t("tryAnotherTag", "Try another tag or add a new French note.")}
              </p>
              {items.length === 0 && (
                <button
                  className="focus-ring mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-frenchBlue px-4 text-sm font-semibold text-white hover:bg-frenchBlue/90"
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
            onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
            onPrevious={() => setPage((current) => Math.max(1, current - 1))}
            page={safePage}
            totalItems={filteredItems.length}
            totalPages={totalPages}
          />
        </div>
      )}
    </div>
  );
}
