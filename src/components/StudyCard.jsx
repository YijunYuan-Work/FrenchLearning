import { Edit3 } from "lucide-react";
import { categories } from "../data/categories";
import { conjugationPronouns, partOfSpeechLabel } from "../data/wordFields";
import { useLanguage } from "../i18n/LanguageContext";
import { RichTextContent } from "./RichTextEditor";

function confidenceLabel(value, t) {
  if (value >= 4) return t("confidenceStrong", "Strong");
  if (value === 3) return t("confidenceFamiliar", "Familiar");
  if (value === 2) return t("confidenceLearning", "Learning");
  return t("confidenceNeedsPractice", "Needs practice");
}

function Meter({ value }) {
  return <span className="study-meter" aria-hidden="true">{[1, 2, 3, 4].map((step) => <span className={step <= value ? "is-filled" : ""} key={step} />)}</span>;
}

function Detail({ label, children, wide = false, className = "" }) {
  return <div className={`study-detail${wide ? " is-wide" : ""} ${className}`}><p className="study-detail-label">{label}</p><div>{children}</div></div>;
}

export function StudyCard({ item, index, isFlipped, onFlip, openEditItem, onConfidenceChange }) {
  const { t } = useLanguage();
  const isGrammar = item.category === "grammar";
  const isPhrase = item.category === "phrases";
  const canAdjust = isGrammar || isPhrase;
  const categoryLabel = t(categories[item.category].labelKey, categories[item.category].label);
  const confidence = Number(item.confidence);
  const hasConjugation = item.partOfSpeech === "verb" && conjugationPronouns.some((pronoun) => item.conjugation?.[pronoun]);
  const hasAdjectiveForms = item.partOfSpeech === "adjective" && Object.values(item.adjectiveForms ?? {}).some(Boolean);

  function onRadioKey(event, value) {
    const delta = event.key === "ArrowRight" || event.key === "ArrowDown" ? 1 : event.key === "ArrowLeft" || event.key === "ArrowUp" ? -1 : 0;
    if (!delta) return;
    event.preventDefault();
    const next = (value - 1 + delta + 4) % 4 + 1;
    event.currentTarget.parentElement.querySelectorAll('[role="radio"]')[next - 1]?.focus();
    onConfidenceChange?.(item.id, next);
  }

  return <div className="study-lift">
    <div className={`study-flipper${isFlipped ? " is-flipped" : ""}`}>
      <button className={`study-face study-front${item.french.length > 22 ? " is-long" : item.french.length > 14 ? " is-medium" : ""}`}
        aria-label={t("revealStudyDetails", "Reveal details for {word}", { word: item.french })}
        aria-hidden={isFlipped} inert={isFlipped} tabIndex={isFlipped ? -1 : 0} onClick={onFlip} type="button">
        <span className="study-card-number" aria-hidden="true">nº {String(index + 1).padStart(2, "0")}</span>
        <span className="study-card-category">{categoryLabel}</span>
        <span className="study-french" lang="fr">{item.french}</span>
      </button>
      <div className="study-face study-back" aria-hidden={!isFlipped} inert={!isFlipped}>
        <header className="study-card-header">
          <div><div className="study-card-meta"><span>{categoryLabel}</span><em>{confidenceLabel(confidence, t)}</em></div>
            <h3 lang="fr">{item.french}</h3>
            {item.english && !isPhrase && <p className="study-meaning">{item.english}</p>}
          </div>
          <button className="study-edit" aria-label={t("editNote", "Edit note")} title={t("editNote", "Edit note")} onClick={() => openEditItem(item)} type="button"><Edit3 size={15} /><span>{t("editNote", "Edit note")}</span></button>
        </header>
        <div className="study-details" tabIndex={isFlipped ? 0 : -1} role="region" aria-label={t("studyCardDetails", "Card details")} key={item.id}>
          {canAdjust ? <Detail label={t("confidence", "Confidence")} wide>
            <div className="study-confidence" role="radiogroup" aria-label={t("confidence", "Confidence")}>
              {[1, 2, 3, 4].map((value) => <button className={confidence === value ? "is-active" : ""} role="radio" aria-checked={confidence === value} tabIndex={confidence === value ? 0 : -1}
                onKeyDown={(event) => onRadioKey(event, value)} key={value} onClick={() => onConfidenceChange?.(item.id, value)} type="button"><Meter value={value} /><span>{confidenceLabel(value, t)}</span></button>)}
            </div>
          </Detail> : <div className="study-readonly-confidence"><Meter value={confidence} /><span className="sr-only">{t("confidence", "Confidence")}: {confidenceLabel(confidence, t)}</span></div>}
          {isPhrase && <Detail label={t("translation", "Translation")} wide className="study-translation">{item.english || t("unknown", "Unknown")}</Detail>}
          {!isGrammar && !isPhrase && <Detail label={t("example", "Example")} className="study-example"><p lang="fr">{item.example || t("noExampleYet", "No example yet.")}</p></Detail>}
          {(item.partOfSpeech || item.ipa || item.gender) && <Detail label={t("wordDetails", "Word details")}>
            <dl className="study-word-details">
              {item.partOfSpeech && <><dt>{t("type", "Type")}</dt><dd>{partOfSpeechLabel(item.partOfSpeech, t)}</dd></>}
              {item.ipa && <><dt>IPA</dt><dd lang="fr">{item.ipa}</dd></>}
              {item.gender && <><dt>{t("gender", "Gender")}</dt><dd>{item.gender}</dd></>}
            </dl>
          </Detail>}
          {hasConjugation && <Detail label={t("conjugation", "Conjugation")} wide><dl className="study-forms" lang="fr">{conjugationPronouns.map((pronoun) => item.conjugation?.[pronoun] ? <div key={pronoun}><dt>{pronoun}</dt><dd>{item.conjugation[pronoun]}</dd></div> : null)}</dl></Detail>}
          {hasAdjectiveForms && <Detail label={t("adjectiveForms", "Adjective forms")} wide><dl className="study-forms" lang="fr">{[["masculine", "masc."], ["feminine", "fem."], ["masculinePlural", "masc. pl."], ["femininePlural", "fem. pl."]].map(([field, label]) => item.adjectiveForms?.[field] ? <div key={field}><dt>{label}</dt><dd>{item.adjectiveForms[field]}</dd></div> : null)}</dl></Detail>}
          {!isPhrase && <Detail label={isGrammar ? t("grammarNote", "Grammar note") : t("notes", "Notes")} wide={isGrammar}>
            {isGrammar && item.notes ? <RichTextContent html={item.notes} /> : <p className="whitespace-pre-line">{item.notes || t("noNotesYet", "No notes yet.")}</p>}
          </Detail>}
          {(item.tags ?? []).length > 0 && <Detail label={t("tags", "Tags")} wide><div className="study-tags">{item.tags.map((tag) => <span key={tag}>#{tag}</span>)}</div></Detail>}
        </div>
      </div>
    </div>
  </div>;
}
