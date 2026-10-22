import { ChevronLeft, ChevronRight } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { EntrySelection, GrammarArticle } from "../components/LearningCard";
import { useLanguage } from "../i18n/LanguageContext";
import { scrollToPageTop } from "../utils/scroll";
import { NotesView } from "./NotesView";

function GrammarJournal({ visibleItems, offset, ...props }) {
  const { t } = useLanguage();
  const [selectedId, setSelectedId] = useState(null);
  const [reading, setReading] = useState(false);
  const readerRef = useRef(null);
  const contentsRef = useRef(null);
  const selected =
    visibleItems.find((item) => item.id === selectedId) ?? visibleItems[0];
  const index = visibleItems.indexOf(selected);
  useEffect(() => {
    if (
      (selectedId || reading) &&
      (reading || window.matchMedia("(min-width: 1024px)").matches)
    )
      readerRef.current?.querySelector("h3")?.focus({ preventScroll: true });
    else if (selectedId)
      contentsRef.current
        ?.querySelector('[aria-current="page"]')
        ?.focus({ preventScroll: true });
  }, [selected?.id, selectedId, reading]);
  function open(item) {
    setSelectedId(item.id);
    setReading(true);
    if (window.matchMedia("(max-width: 1023px)").matches) scrollToPageTop();
  }
  return (
    <div className={`library-grammar-journal${reading ? " is-reading" : ""}`}>
      <nav
        className="library-contents"
        ref={contentsRef}
        aria-label={t("grammarContents", "Grammar contents")}
      >
        <h3>{t("tableOfContents", "Table of contents")}</h3>
        {visibleItems.map((item, position) => (
          <div
            className={selected?.id === item.id ? "is-current" : ""}
            key={item.id}
          >
            <EntrySelection
              {...props}
              item={item}
              isSelected={props.selectedIds.includes(item.id)}
            />
            <button
              className="library-contents-link"
              aria-current={selected?.id === item.id ? "page" : undefined}
              onClick={() => open(item)}
              type="button"
            >
              <i>{offset + position + 1}.</i>
              <span lang="fr">{item.french}</span>
              <ChevronRight size={16} />
            </button>
          </div>
        ))}
      </nav>
      {selected && (
        <div className="library-reader-wrap" ref={readerRef}>
          <button
            className="text-action library-reader-back"
            onClick={() => {
              setReading(false);
              scrollToPageTop();
            }}
            type="button"
          >
            <ChevronLeft size={18} />
            {t("backToContents", "Back to contents")}
          </button>
          <GrammarArticle
            {...props}
            item={selected}
            index={offset + index}
            isSelected={props.selectedIds.includes(selected.id)}
            onTag={props.setSelectedTag}
          />
          <nav
            className="library-reader-navigation"
            aria-label={t(
              "grammarReaderNavigation",
              "Grammar reader navigation",
            )}
          >
            <button
              className="text-action"
              disabled={index <= 0}
              onClick={() => open(visibleItems[index - 1])}
              type="button"
            >
              <ChevronLeft size={16} />
              {t("previousNote", "Previous note")}
            </button>
            <button
              className="text-action"
              disabled={index >= visibleItems.length - 1}
              onClick={() => open(visibleItems[index + 1])}
              type="button"
            >
              {t("nextNote", "Next note")}
              <ChevronRight size={16} />
            </button>
          </nav>
        </div>
      )}
    </div>
  );
}

export function GrammarView(props) {
  return (
    <NotesView
      {...props}
      renderItems={(visibleItems, offset) => (
        <GrammarJournal
          {...props}
          visibleItems={visibleItems}
          offset={offset}
        />
      )}
    />
  );
}
