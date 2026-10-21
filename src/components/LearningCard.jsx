import { Check, Edit3, MoreHorizontal, Trash2 } from "lucide-react";
import { useState } from "react";
import { conjugationPronouns, partOfSpeechLabel } from "../data/wordFields";
import { useLanguage } from "../i18n/LanguageContext";
import { LibraryDialog } from "./LibraryDialog";
import { RichTextContent } from "./RichTextEditor";

function confidenceLabel(value, t) {
  if (value >= 4) return t("confidenceStrong", "Strong");
  if (value === 3) return t("confidenceFamiliar", "Familiar");
  if (value === 2) return t("confidenceLearning", "Learning");
  return t("confidenceNeedsPractice", "Needs practice");
}

export function EntrySelection({
  item,
  isSelected,
  isDeleting,
  onToggleSelected,
}) {
  const { t } = useLanguage();
  const label = t(
    isSelected ? "unselectNote" : "selectNote",
    isSelected ? "Unselect {word}" : "Select {word}",
    { word: item.french },
  );
  return (
    <label className="library-checkbox" title={label}>
      <input
        type="checkbox"
        aria-label={label}
        checked={Boolean(isSelected)}
        disabled={isDeleting}
        onChange={() => onToggleSelected(item.id)}
      />
      <span aria-hidden="true">{isSelected && <Check size={12} />}</span>
    </label>
  );
}

export function EntryActions({
  item,
  isDeleting,
  openEditItem,
  onDeleteItem,
  onToggleSelected,
  isSelected,
  allowConfidenceActions = true,
  markReviewed,
}) {
  const { t } = useLanguage();
  const [open, setOpen] = useState(false);
  const editLabel = t("editNoteNamed", "Edit {word}", { word: item.french });
  const deleteLabel = t("deleteNoteNamed", "Delete {word}", {
    word: item.french,
  });
  return (
    <>
      <div className="library-entry-actions">
        <button
          className="icon-action"
          aria-label={editLabel}
          title={editLabel}
          onClick={() => openEditItem(item)}
          type="button"
        >
          <Edit3 size={16} />
        </button>
        <button
          className="icon-action library-delete-action"
          disabled={isDeleting}
          aria-label={deleteLabel}
          title={deleteLabel}
          onClick={() => onDeleteItem(item)}
          type="button"
        >
          <Trash2 size={16} />
        </button>
      </div>
      <button
        className="icon-action library-entry-more"
        aria-label={t("noteActions", "Actions for {word}", {
          word: item.french,
        })}
        aria-haspopup="dialog"
        disabled={isDeleting}
        onClick={() => setOpen(true)}
        type="button"
      >
        <MoreHorizontal size={20} />
      </button>
      {open && (
        <LibraryDialog title={item.french} onClose={() => setOpen(false)}>
          <EntryConfidence
            item={item}
            isDeleting={isDeleting}
            allowConfidenceActions={allowConfidenceActions}
            markReviewed={markReviewed}
          />
          <div className="library-action-list">
            <button
              onClick={() => {
                setOpen(false);
                openEditItem(item);
              }}
              type="button"
            >
              <Edit3 size={18} />
              {t("editNote", "Edit note")}
            </button>
            {onToggleSelected && (
              <button
                disabled={isDeleting}
                onClick={() => {
                  onToggleSelected(item.id);
                  setOpen(false);
                }}
                type="button"
              >
                <Check size={18} />
                {isSelected ? t("unselect", "Unselect") : t("select", "Select")}
              </button>
            )}
            <button
              className="library-delete-action"
              disabled={isDeleting}
              onClick={() => {
                setOpen(false);
                onDeleteItem(item);
              }}
              type="button"
            >
              <Trash2 size={18} />
              {t("delete", "Delete")}
            </button>
          </div>
        </LibraryDialog>
      )}
    </>
  );
}

export function EntryConfidence({
  item,
  allowConfidenceActions = true,
  markReviewed,
  isDeleting,
}) {
  const { t } = useLanguage();
  return (
    <div className="library-confidence">
      <span
        className="library-meter"
        role="img"
        aria-label={t("confidenceValue", "Confidence {value} of 4", {
          value: item.confidence,
        })}
      >
        {[1, 2, 3, 4].map((step) => (
          <i
            key={step}
            className={step <= item.confidence ? "is-filled" : ""}
          />
        ))}
      </span>
      <span className="library-confidence-label">
        {confidenceLabel(item.confidence, t)}
      </span>
      {allowConfidenceActions && (
        <div className="library-confidence-actions">
          <button
            disabled={isDeleting}
            onClick={() => markReviewed(item, -1)}
            type="button"
          >
            {t("needsPractice", "Needs practice")}
          </button>
          <button
            disabled={isDeleting}
            onClick={() => markReviewed(item, 1)}
            type="button"
          >
            {t("iKnowThis", "I know this")}
          </button>
        </div>
      )}
    </div>
  );
}

export function EntryTags({ item, onTag }) {
  return (
    <div className="library-tags">
      {(item.tags ?? []).map((tag) =>
        onTag ? (
          <button key={tag} onClick={() => onTag(tag)} type="button">
            #{tag}
          </button>
        ) : (
          <span key={tag}>#{tag}</span>
        ),
      )}
    </div>
  );
}

function WordForms({ item }) {
  const forms = [
    ...(item.partOfSpeech === "verb"
      ? conjugationPronouns.map((key) => [key, item.conjugation?.[key]])
      : []),
    ...[
      ["masculine", "m."],
      ["feminine", "f."],
      ["masculinePlural", "m. pl."],
      ["femininePlural", "f. pl."],
    ].map(([key, label]) => [label, item.adjectiveForms?.[key]]),
  ];
  if (!forms.some(([, value]) => value)) return null;
  return (
    <dl className="library-forms">
      {forms
        .filter(([, value]) => value)
        .map(([key, value]) => (
          <div key={key}>
            <dt>{key}</dt>
            <dd lang="fr">{value}</dd>
          </div>
        ))}
    </dl>
  );
}

export function LearningCard(props) {
  const { t } = useLanguage();
  const { item, isSelected, isDeleting, onTag, index = 0 } = props;
  const isPhrase = item.category === "phrases";
  const isPronunciation = item.category === "pronunciation";
  return (
    <article
      className={`library-entry ${isPhrase ? "library-phrase" : isPronunciation ? "library-fiche" : "library-word"}${isSelected ? " is-selected" : ""}${isDeleting ? " is-deleting" : ""}`}
      data-note-id={item.id}
    >
      {isPronunciation ? (
        <div className="library-fiche-top">
          <EntrySelection {...props} />
          <span lang="fr">fiche {index + 1}</span>
          <EntryActions {...props} />
        </div>
      ) : (
        <EntrySelection {...props} />
      )}
      <div className="library-headword">
        <h3
          lang="fr"
          className={item.french.length > (isPhrase ? 40 : 14) ? "is-long" : ""}
        >
          {isPhrase && (
            <span aria-hidden="true" className="library-quote">
              «
            </span>
          )}
          {item.french}
        </h3>
        {!isPhrase && !isPronunciation && (
          <div className="library-word-meta">
            {(item.partOfSpeech || item.gender) && (
              <span>
                {item.partOfSpeech && partOfSpeechLabel(item.partOfSpeech, t)}
                {item.gender
                  ? `${item.partOfSpeech ? " · " : ""}${t(item.gender === "masculine" ? "masculine" : item.gender === "feminine" ? "feminine" : "masculineOrFeminine", item.gender)}`
                  : ""}
              </span>
            )}
            {item.ipa && <span>{item.ipa}</span>}
          </div>
        )}
      </div>
      <div className="library-sense">
        {item.english && <p className="library-meaning">{item.english}</p>}
        {isPronunciation && item.ipa && (
          <p className="library-ipa">{item.ipa}</p>
        )}
        {!isPhrase && item.example && (
          <p className="library-example" lang="fr">
            {isPronunciation ? item.example : `« ${item.example} »`}
          </p>
        )}
        {!isPhrase && <WordForms item={item} />}
        {!isPhrase && item.notes && (
          <p className="library-note">
            <i lang="fr">N.B.</i> {item.notes}
          </p>
        )}
        <EntryTags item={item} onTag={onTag} />
      </div>
      <div className="library-entry-status">
        <EntryConfidence {...props} />
        {!isPronunciation && <EntryActions {...props} />}
      </div>
    </article>
  );
}

export function GrammarArticle({ item, index, ...props }) {
  return (
    <article
      className="library-grammar-reader"
      key={item.id}
      data-note-id={item.id}
    >
      <div className="library-reader-meta">
        <span lang="fr">Note {index + 1}</span>
        <EntryActions {...props} item={item} />
      </div>
      <h3 lang="fr" tabIndex={-1}>
        {item.french}
      </h3>
      <div className="library-reader-status">
        <EntryConfidence {...props} item={item} />
        <EntryTags item={item} onTag={props.onTag} />
      </div>
      <div className="editorial-rule" />
      <RichTextContent html={item.notes} />
    </article>
  );
}
