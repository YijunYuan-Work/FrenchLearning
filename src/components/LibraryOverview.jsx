import { Plus } from "lucide-react";
import { categories } from "../data/categories";
import { useLanguage } from "../i18n/LanguageContext";

export function LibraryOverview({ items, activeSection }) {
  const { t } = useLanguage();
  const total = items.length;
  const stats = [
    [
      t(categories[activeSection].labelKey, categories[activeSection].label),
      total,
    ],
    [
      t("needsPractice", "Needs practice"),
      items.filter((item) => Number(item.confidence) <= 2).length,
    ],
    [
      t("activeTags", "Active tags"),
      new Set(items.flatMap((item) => item.tags ?? [])).size,
    ],
    [
      t("confidence", "Confidence"),
      `${total ? Math.round((items.reduce((sum, item) => sum + Number(item.confidence), 0) / (total * 4)) * 100) : 0}%`,
    ],
  ];
  return (
    <dl className="library-stats">
      {stats.map(([label, value]) => (
        <div key={label}>
          <dt>{label}</dt>
          <dd>{value}</dd>
        </div>
      ))}
    </dl>
  );
}

export function LibraryEmpty({ isNew, openNewItem, activeSection, onReset }) {
  const { t } = useLanguage();
  const Heading = isNew ? "h2" : "h3";
  return (
    <div className={`library-empty${isNew ? " is-new" : ""}`}>
      <span className="library-empty-mark" aria-hidden="true">
        {isNew ? (
          <>
            <span>A</span><span>B</span><span>C…</span>
          </>
        ) : (
          "∅"
        )}
      </span>
      <div>
        <Heading className="editorial-title">
          {isNew
            ? t("yourNotebookReady", "Your French notebook is ready.")
            : t("noNotesMatch", "No notes match this view.")}
        </Heading>
        <p>
          {isNew
            ? t(
                "addFirstNoteCopy",
                "Add your first vocabulary word, phrase, grammar note, or pronunciation reminder.",
              )
            : t("tryAnotherTag", "Try another tag or add a new French note.")}
        </p>
        {isNew ? (
          <button
            className="primary-action"
            onClick={() => openNewItem(activeSection)}
            type="button"
          >
            <Plus size={16} />
            {t("addFirstNote", "Add first note")}
          </button>
        ) : (
          <button className="secondary-action" onClick={onReset} type="button">
            {t("clearLibraryFilters", "Clear search & filters")}
          </button>
        )}
      </div>
    </div>
  );
}
