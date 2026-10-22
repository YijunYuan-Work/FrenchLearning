import { Fragment, useMemo, useState } from "react";
import { LearningCard } from "../components/LearningCard";
import { LibraryEmpty, LibraryOverview } from "../components/LibraryOverview";
import { NotesToolbar } from "../components/NotesToolbar";
import { PaginationControls } from "../components/PaginationControls";
import { SelectionToolbar } from "../components/SelectionToolbar";
import { partOfSpeechOptions } from "../data/wordFields";
import { useLanguage } from "../i18n/LanguageContext";
import { scrollToPageTop } from "../utils/scroll";

const WORDS_PER_PAGE = 10;
const frenchCollator = new Intl.Collator("fr", {
  numeric: true,
  sensitivity: "base",
});
const vocabularyTabs = [
  { value: "all", label: "All", labelKey: "all" },
  ...partOfSpeechOptions.filter((option) => option.value),
  { value: "uncategorized", label: "Uncategorized", labelKey: "uncategorized" },
];

function initial(item) {
  return (
    item.french
      .trim()
      .normalize("NFD")
      .replace(/[\u0300-\u036f]/g, "")
      .replace(/[œŒ]/g, "o")
      .replace(/[æÆ]/g, "a")
      .at(0) ?? "#"
  ).toLocaleUpperCase("fr");
}

export function VocabularyView(props) {
  const { t } = useLanguage();
  const [activeWordType, setActiveWordType] = useState("all");
  const [page, setPage] = useState(1);
  const [sortOrder, setSortOrder] = useState("alphabetical");

  const vocabularyItems = useMemo(() => {
    const matchingItems = props.filteredItems.filter((item) => {
      if (activeWordType === "all") return true;
      if (activeWordType === "uncategorized") return !item.partOfSpeech;
      return item.partOfSpeech === activeWordType;
    });

    return matchingItems
      .map((item, index) => ({ item, index }))
      .sort((left, right) => {
        if (sortOrder === "dateAdded") {
          const leftTime = Date.parse(left.item.createdAt ?? "");
          const rightTime = Date.parse(right.item.createdAt ?? "");

          if (
            Number.isFinite(leftTime) &&
            Number.isFinite(rightTime) &&
            leftTime !== rightTime
          ) {
            return rightTime - leftTime;
          }

          return left.index - right.index;
        }

        return (
          frenchCollator.compare(
            left.item.french ?? "",
            right.item.french ?? "",
          ) || left.index - right.index
        );
      })
      .map(({ item }) => item);
  }, [activeWordType, props.filteredItems, sortOrder]);

  const totalPages = Math.max(
    1,
    Math.ceil(vocabularyItems.length / WORDS_PER_PAGE),
  );
  const safePage = Math.min(page, totalPages);
  const visibleItems = vocabularyItems.slice(
    (safePage - 1) * WORDS_PER_PAGE,
    safePage * WORDS_PER_PAGE,
  );
  const letterCounts = vocabularyItems.reduce((counts, item) => {
    const letter = initial(item);
    counts[letter] = (counts[letter] ?? 0) + 1;
    return counts;
  }, {});

  const typeCounts = useMemo(() => {
    return props.filteredItems.reduce(
      (counts, item) => {
        counts.all += 1;
        counts[item.partOfSpeech || "uncategorized"] =
          (counts[item.partOfSpeech || "uncategorized"] ?? 0) + 1;
        return counts;
      },
      { all: 0 },
    );
  }, [props.filteredItems]);
  function selectWordType(type) {
    setActiveWordType(type);
    setPage(1);
    scrollToPageTop();
  }

  function changePage(nextPage) {
    setPage(nextPage);
    scrollToPageTop();
  }

  function changeSortOrder(nextSortOrder) {
    setSortOrder(nextSortOrder);
    setPage(1);
    scrollToPageTop();
  }

  function resetFilters() {
    props.setQuery("");
    props.setSelectedTag("all");
    selectWordType("all");
  }
  return (
    <div className="library-page library-vocabulary-page">
      <LibraryOverview items={props.filteredItems} activeSection="vocabulary" />
      <NotesToolbar
        {...props}
        sortOrder={sortOrder}
        onSortChange={changeSortOrder}
      />
      <div
        className="library-type-tabs"
        role="group"
        aria-label={t("wordType", "Word type")}
      >
        {vocabularyTabs.map((tab) => (
          <button
            aria-pressed={activeWordType === tab.value}
            className={activeWordType === tab.value ? "is-active" : ""}
            key={tab.value}
            onClick={() => selectWordType(tab.value)}
            type="button"
          >
            {t(tab.labelKey, tab.label)}
            <i>{typeCounts[tab.value] ?? 0}</i>
          </button>
        ))}
      </div>
      <SelectionToolbar {...props} visibleItems={visibleItems} />
      <div
        className="library-results"
        key={`${props.query}:${props.selectedTag}:${sortOrder}:${activeWordType}:${safePage}`}
      >
        {visibleItems.map((item, index) => (
          <Fragment key={item.id}>
            {sortOrder === "alphabetical" &&
              (index === 0 ||
                initial(visibleItems[index - 1]) !== initial(item)) && (
                <div className="library-letter">
                  <span>{initial(item)}</span>
                  <small>
                    {t(
                      letterCounts[initial(item)] === 1
                        ? "libraryOneEntry"
                        : "libraryEntryCount",
                      letterCounts[initial(item)] === 1
                        ? "1 entry"
                        : "{count} entries",
                      { count: letterCounts[initial(item)] },
                    )}
                  </small>
                </div>
              )}
            <LearningCard
              {...props}
              item={item}
              isSelected={props.selectedIds.includes(item.id)}
              onTag={props.setSelectedTag}
            />
          </Fragment>
        ))}
      </div>
      {!visibleItems.length && (
        <LibraryEmpty
          {...props}
          activeSection="vocabulary"
          isNew={props.items.length === 0}
          onReset={resetFilters}
        />
      )}
      <PaginationControls
        itemLabel={t("words", "words")}
        itemsPerPage={WORDS_PER_PAGE}
        onNext={() => changePage(Math.min(totalPages, safePage + 1))}
        onPrevious={() => changePage(Math.max(1, safePage - 1))}
        page={safePage}
        totalItems={vocabularyItems.length}
        totalPages={totalPages}
      />
    </div>
  );
}
