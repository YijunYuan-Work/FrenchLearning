import { useMemo, useState } from "react";
import { LearningCard } from "../components/LearningCard";
import { LibraryEmpty, LibraryOverview } from "../components/LibraryOverview";
import { NotesToolbar } from "../components/NotesToolbar";
import { PaginationControls } from "../components/PaginationControls";
import { SelectionToolbar } from "../components/SelectionToolbar";
import { useLanguage } from "../i18n/LanguageContext";
import { scrollToPageTop } from "../utils/scroll";

export function NotesView(props) {
  const { t } = useLanguage();
  const {
    activeSection,
    items,
    filteredItems,
    query,
    selectedTag,
    itemsPerPage = 10,
    renderItems,
  } = props;
  const [page, setPage] = useState(1);
  const metricItems = useMemo(
    () => items.filter((item) => item.category === activeSection),
    [items, activeSection],
  );
  const totalPages = Math.max(
    1,
    Math.ceil(filteredItems.length / itemsPerPage),
  );
  const safePage = Math.min(page, totalPages);
  const visibleItems = filteredItems.slice(
    (safePage - 1) * itemsPerPage,
    safePage * itemsPerPage,
  );
  function changePage(value) {
    setPage(value);
    scrollToPageTop();
  }
  function resetFilters() {
    props.setQuery("");
    props.setSelectedTag("all");
  }
  const content = renderItems ? (
    renderItems(visibleItems, (safePage - 1) * itemsPerPage)
  ) : (
    <div
      className={
        activeSection === "pronunciation" ? "library-fiches" : "library-entries"
      }
    >
      {activeSection === "phrases" && (
        <div className="library-phrase-labels" aria-hidden="true">
          <span /> <span lang="fr">Français</span>
          <span>{t("translation", "Translation")}</span>
          <span>{t("libraryStatus", "Status")}</span>
        </div>
      )}
      {visibleItems.map((item, index) => (
        <LearningCard
          {...props}
          item={item}
          key={item.id}
          index={(safePage - 1) * itemsPerPage + index}
          isSelected={props.selectedIds.includes(item.id)}
          onTag={props.setSelectedTag}
        />
      ))}
    </div>
  );
  return (
    <div className={`library-page library-${activeSection}-page`}>
      <LibraryOverview items={metricItems} activeSection={activeSection} />
      <NotesToolbar {...props} />
      <SelectionToolbar {...props} visibleItems={visibleItems} />
      {filteredItems.length ? (
        <div
          className="library-results"
          key={`${query}:${selectedTag}:${safePage}`}
        >
          {content}
        </div>
      ) : (
        <LibraryEmpty
          {...props}
          isNew={items.length === 0}
          onReset={resetFilters}
        />
      )}
      <PaginationControls
        itemLabel={t("libraryItems", "notes")}
        itemsPerPage={itemsPerPage}
        onNext={() => changePage(Math.min(totalPages, safePage + 1))}
        onPrevious={() => changePage(Math.max(1, safePage - 1))}
        page={safePage}
        totalItems={filteredItems.length}
        totalPages={totalPages}
      />
    </div>
  );
}
