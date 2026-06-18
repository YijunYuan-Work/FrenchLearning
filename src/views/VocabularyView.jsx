import { useMemo, useState } from "react";
import { LearningCard } from "../components/LearningCard";
import { Metric } from "../components/Metric";
import { PaginationControls } from "../components/PaginationControls";
import { SelectionToolbar } from "../components/SelectionToolbar";
import { partOfSpeechOptions } from "../data/wordFields";
import { useLanguage } from "../i18n/LanguageContext";
import { NotesView } from "./NotesView";

const WORDS_PER_PAGE = 10;
const vocabularyTabs = [
  { value: "all", label: "All", labelKey: "all" },
  ...partOfSpeechOptions.filter((option) => option.value),
  { value: "uncategorized", label: "Uncategorized", labelKey: "uncategorized" },
];

export function VocabularyView(props) {
  const { t } = useLanguage();
  const [activeWordType, setActiveWordType] = useState("all");
  const [page, setPage] = useState(1);

  const vocabularyItems = useMemo(() => {
    return props.filteredItems.filter((item) => {
      if (activeWordType === "all") return true;
      if (activeWordType === "uncategorized") return !item.partOfSpeech;
      return item.partOfSpeech === activeWordType;
    });
  }, [activeWordType, props.filteredItems]);

  const totalPages = Math.max(1, Math.ceil(vocabularyItems.length / WORDS_PER_PAGE));
  const safePage = Math.min(page, totalPages);
  const visibleItems = vocabularyItems.slice(
    (safePage - 1) * WORDS_PER_PAGE,
    safePage * WORDS_PER_PAGE
  );

  const typeCounts = useMemo(() => {
    return props.filteredItems.reduce(
      (counts, item) => {
        counts.all += 1;
        counts[item.partOfSpeech || "uncategorized"] =
          (counts[item.partOfSpeech || "uncategorized"] ?? 0) + 1;
        return counts;
      },
      { all: 0 }
    );
  }, [props.filteredItems]);

  function selectWordType(type) {
    setActiveWordType(type);
    setPage(1);
  }

  if (props.items.length === 0) {
    return <NotesView {...props} />;
  }

  return (
    <div className="min-w-0">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label={t("categoryVocabulary", "Vocabulary")} value={props.filteredItems.length} />
        <Metric label={t("currentType", "Current type")} value={typeCounts[activeWordType] ?? 0} tone="blue" />
        <Metric label={t("perPage", "Per page")} value={WORDS_PER_PAGE} />
        <Metric label={t("page", "Page")} value={`${safePage}/${totalPages}`} tone="green" />
      </div>

      <NotesView
        {...props}
        filteredItems={[]}
        items={[]}
        showList={false}
        showMetrics={false}
        topContent={
          <div className="mt-5 rounded-xl border border-line bg-white/90 p-3 shadow-soft">
            <div className="flex flex-wrap gap-2">
              {vocabularyTabs.map((tab) => {
                const isActive = activeWordType === tab.value;
                const count = typeCounts[tab.value] ?? 0;
                return (
                  <button
                    className={`focus-ring inline-flex h-9 items-center gap-2 rounded-lg px-3 text-sm font-bold ${
                      isActive
                        ? "bg-frenchBlue text-white"
                        : "border border-line bg-white text-slate-700 hover:border-frenchBlue/35 hover:text-frenchBlue"
                    }`}
                    key={tab.value}
                    onClick={() => selectWordType(tab.value)}
                    type="button"
                  >
                    {t(tab.labelKey, tab.label)}
                    <span
                      className={`rounded px-1.5 py-0.5 text-xs ${
                        isActive ? "bg-white/20" : "bg-slate-100 text-slate-500"
                      }`}
                    >
                      {count}
                    </span>
                  </button>
                );
              })}
            </div>
          </div>
        }
      />

      <div className="mt-5 grid gap-3">
        <PaginationControls
          itemLabel={t("words", "words")}
          itemsPerPage={WORDS_PER_PAGE}
          onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
          onPrevious={() => setPage((current) => Math.max(1, current - 1))}
          page={safePage}
          totalItems={vocabularyItems.length}
          totalPages={totalPages}
        />
        <SelectionToolbar
          onClearSelection={props.onClearSelection}
          onDeleteSelected={props.onDeleteSelected}
          onSelectItems={props.onSelectItems}
          selectedIds={props.selectedIds}
          visibleItems={visibleItems}
        />

        {visibleItems.map((item) => (
          <LearningCard
            isSelected={props.selectedIds.includes(item.id)}
            item={item}
            key={item.id}
            markReviewed={props.markReviewed}
            onDeleteItem={props.onDeleteItem}
            onToggleSelected={props.onToggleSelected}
            openEditItem={props.openEditItem}
          />
        ))}

        {visibleItems.length === 0 && (
          <div className="rounded-xl border border-dashed border-frenchBlue/30 bg-sky/40 p-8 text-center">
            <p className="font-black">{t("noWordsInType", "No words in this type yet.")}</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {t("noWordsInTypeCopy", "Add a word or choose another word-type tab.")}
            </p>
          </div>
        )}
      </div>

      <div className="mt-4">
        <PaginationControls
          itemLabel={t("words", "words")}
          itemsPerPage={WORDS_PER_PAGE}
          onNext={() => setPage((current) => Math.min(totalPages, current + 1))}
          onPrevious={() => setPage((current) => Math.max(1, current - 1))}
          page={safePage}
          totalItems={vocabularyItems.length}
          totalPages={totalPages}
        />
      </div>
    </div>
  );
}
