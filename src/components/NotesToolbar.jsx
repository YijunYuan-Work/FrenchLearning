import { Search, SlidersHorizontal } from "lucide-react";
import { useState } from "react";
import { useLanguage } from "../i18n/LanguageContext";
import { LibraryDialog } from "./LibraryDialog";

export function NotesToolbar({
  query,
  selectedTag,
  setQuery,
  setSelectedTag,
  tags,
  sortOrder,
  onSortChange,
}) {
  const { t } = useLanguage();
  const [showFilters, setShowFilters] = useState(false);
  function filters(inSheet = false) {
    return (
      <>
        {inSheet ? (
          <fieldset className="library-tag-chips">
            <legend>{t("tags", "Tags")}</legend>
            <div>
              {tags.map((tag) => (
                <label
                  className={tag === selectedTag ? "is-active" : ""}
                  key={tag}
                >
                  <input
                    type="radio"
                    name="library-tags-sheet"
                    checked={tag === selectedTag}
                    onChange={() => setSelectedTag(tag)}
                  />
                  <span>
                    {tag === "all" ? t("allTags", "All tags") : `#${tag}`}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : (
          <label className="library-tag-select">
            <span>{t("tags", "Tags")}</span>
            <select
              aria-label={t("filterByTag", "Filter by tag")}
              value={selectedTag}
              onChange={(event) => setSelectedTag(event.target.value)}
            >
              {tags.map((tag) => (
                <option key={tag} value={tag}>
                  {tag === "all" ? t("allTags", "All tags") : `#${tag}`}
                </option>
              ))}
            </select>
          </label>
        )}
        {onSortChange && (
          <fieldset className="library-sort">
            <legend>{t("sortVocabulary", "Sort vocabulary")}</legend>
            <div>
              {[
                [
                  "alphabetical",
                  "sortAlphabetical",
                  "Alphabetical (A-Z)",
                  "A – Z",
                ],
                ["dateAdded", "sortDateAdded", "Date added (newest)", "Newest"],
              ].map(([value, key, fallback, short]) => (
                <label
                  className={sortOrder === value ? "is-active" : ""}
                  key={value}
                >
                  <input
                    type="radio"
                    name={inSheet ? "library-sort-sheet" : "library-sort"}
                    aria-label={t(key, fallback)}
                    checked={sortOrder === value}
                    onChange={() => onSortChange(value)}
                  />
                  <span>
                    {t(
                      value === "alphabetical" ? "libraryAZ" : "libraryNewest",
                      short,
                    )}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        )}
      </>
    );
  }
  return (
    <>
      <div className={`library-toolbar${onSortChange ? " has-sort" : ""}`}>
        <label className="library-search">
          <Search size={18} aria-hidden="true" />
          <span className="sr-only">{t("searchNotes", "Search notes")}</span>
          <input
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder={t(
              "searchPlaceholder",
              "Search words, phrases, grammar, tags...",
            )}
          />
        </label>
        <div className="library-desktop-filters">{filters()}</div>
        <button
          className="icon-action library-mobile-filter"
          aria-label={t("libraryFilters", "Filters & sort")}
          aria-haspopup="dialog"
          onClick={() => setShowFilters(true)}
          type="button"
        >
          <SlidersHorizontal size={19} />
          {(selectedTag !== "all" ||
            (sortOrder && sortOrder !== "alphabetical")) && (
            <span className="library-filter-dot" />
          )}
        </button>
      </div>
      {showFilters && (
        <LibraryDialog
          title={t("libraryFilters", "Filters & sort")}
          onClose={() => setShowFilters(false)}
        >
          <div className="library-sheet-filters">{filters(true)}</div>
          <div className="library-sheet-actions">
            <button
              className="secondary-action"
              onClick={() => {
                setSelectedTag("all");
                onSortChange?.("alphabetical");
              }}
              type="button"
            >
              {t("reset", "Reset")}
            </button>
            <button
              className="primary-action"
              onClick={() => setShowFilters(false)}
              type="button"
            >
              {t("applyFilters", "Apply filters")}
            </button>
          </div>
        </LibraryDialog>
      )}
    </>
  );
}
