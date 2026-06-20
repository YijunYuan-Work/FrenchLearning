import { Check, CheckSquare, Edit3, Square, Trash2 } from "lucide-react";
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

export function LearningCard({
  allowConfidenceActions = true,
  isSelected,
  item,
  markReviewed,
  onDeleteItem,
  onToggleSelected,
  openEditItem,
}) {
  const { t } = useLanguage();
  const CategoryIcon = categories[item.category].icon;
  const isGrammarNote = item.category === "grammar";
  const isPhraseNote = item.category === "phrases";
  const hasConjugation =
    item.partOfSpeech === "verb" &&
    conjugationPronouns.some((pronoun) => item.conjugation?.[pronoun]);
  const hasAdjectiveForms =
    item.partOfSpeech === "adjective" &&
    Object.values(item.adjectiveForms ?? {}).some(Boolean);
  const hasGrammarDetails =
    item.partOfSpeech ||
    item.ipa ||
    item.gender ||
    hasConjugation ||
    hasAdjectiveForms;

  return (
    <article
      className={`rounded-xl border p-4 transition ${
        isSelected
          ? "border-frenchBlue/35 bg-sky/70 shadow-soft"
          : "border-line bg-paper shadow-soft hover:shadow-lift"
      }`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              aria-label={`${isSelected ? "Unselect" : "Select"} ${item.french}`}
              className="focus-ring inline-flex size-7 items-center justify-center rounded-lg border border-line bg-white text-frenchBlue"
              onClick={() => onToggleSelected(item.id)}
              type="button"
            >
              {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
            </button>
            <span className="inline-flex items-center gap-1 rounded-lg bg-sky px-2 py-1 text-xs font-bold text-frenchBlue">
              <CategoryIcon size={13} />
              {t(categories[item.category].labelKey, categories[item.category].label)}
            </span>
            <span className="rounded-lg bg-mint px-2 py-1 text-xs font-bold text-sage">
              {confidenceLabel(item.confidence, t)}
            </span>
          </div>
          <h3 className="text-xl font-black leading-snug tracking-[-0.01em]">{item.french}</h3>
          {item.english && !isPhraseNote && (
            <p className="mt-1 text-sm font-bold text-slate-600">
              {item.english}
            </p>
          )}
        </div>
        <div className="flex gap-2">
          <button
            aria-label={`Edit ${item.french}`}
            className="focus-ring inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-line bg-white text-slate-600 hover:text-frenchBlue"
            onClick={() => openEditItem(item)}
            type="button"
          >
            <Edit3 size={16} />
          </button>
          <button
            aria-label={`Delete ${item.french}`}
            className="focus-ring inline-flex size-9 shrink-0 items-center justify-center rounded-lg border border-frenchRed/25 bg-white text-frenchRed hover:bg-blush"
            onClick={() => onDeleteItem(item)}
            type="button"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      {isPhraseNote ? (
        <div className="mt-4 grid gap-3 rounded-xl bg-sky/35 p-3 md:grid-cols-2">
          <div>
            <p className="text-xs font-bold text-slate-500">
              {t("originalFrench", "Original French")}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-800">
              {item.french}
            </p>
          </div>
          <div>
            <p className="text-xs font-bold text-slate-500">
              {t("translation", "Translation")}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-800">
              {item.english}
            </p>
          </div>
        </div>
      ) : (
        <div className="mt-4 grid gap-3 md:grid-cols-2">
          {!isGrammarNote && item.example && (
            <div>
              <p className="text-xs font-bold text-slate-500">
                {t("example", "Example")}
              </p>
              <p className="mt-1 text-sm leading-6 text-slate-800">
                {item.example}
              </p>
            </div>
          )}
          {hasGrammarDetails && (
            <div>
              <p className="text-xs font-bold text-slate-500">
                {t("grammarDetails", "Grammar details")}
              </p>
              <div className="mt-1 grid gap-2 text-sm leading-6 text-slate-800">
                {item.partOfSpeech && (
                  <p>
                    <span className="font-semibold">{t("type", "Type")}:</span>{" "}
                    {partOfSpeechLabel(item.partOfSpeech, t)}
                  </p>
                )}
                {item.ipa && (
                  <p>
                    <span className="font-semibold">IPA:</span> {item.ipa}
                  </p>
                )}
                {item.gender && (
                  <p>
                    <span className="font-semibold">{t("gender", "Gender")}:</span> {item.gender}
                  </p>
                )}
                {hasConjugation && (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {conjugationPronouns.map((pronoun) =>
                      item.conjugation?.[pronoun] ? (
                        <div className="flex gap-2" key={pronoun}>
                          <dt className="font-semibold">{pronoun}</dt>
                          <dd>{item.conjugation[pronoun]}</dd>
                        </div>
                      ) : null
                    )}
                  </dl>
                )}
                {hasAdjectiveForms && (
                  <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                    {[
                      ["masculine", "masc."],
                      ["feminine", "fem."],
                      ["masculinePlural", "masc. pl."],
                      ["femininePlural", "fem. pl."],
                    ].map(([field, label]) =>
                      item.adjectiveForms?.[field] ? (
                        <div className="flex gap-2" key={field}>
                          <dt className="font-semibold">{label}</dt>
                          <dd>{item.adjectiveForms[field]}</dd>
                        </div>
                      ) : null
                    )}
                  </dl>
                )}
              </div>
            </div>
          )}
          {item.notes && (
            <div className={isGrammarNote ? "md:col-span-2" : ""}>
              <p className="text-xs font-bold text-slate-500">
                {isGrammarNote ? t("grammarNote", "Grammar note") : t("notes", "Notes")}
              </p>
              {isGrammarNote ? (
                <RichTextContent html={item.notes} />
              ) : (
                <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-800">
                  {item.notes}
                </p>
              )}
            </div>
          )}
        </div>
      )}

      <div className="mt-4 flex flex-col gap-3 border-t border-line pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {(item.tags ?? []).map((tag) => (
            <span
              className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600"
              key={tag}
            >
              {tag}
            </span>
          ))}
        </div>
        {allowConfidenceActions ? (
          <div className="flex gap-2">
            <button
              className="focus-ring inline-flex h-9 items-center gap-2 rounded-lg border border-frenchRed/25 bg-white px-3 text-xs font-bold text-frenchRed hover:bg-blush"
              onClick={() => markReviewed(item, -1)}
              type="button"
            >
              {t("needsPractice", "Needs practice")}
            </button>
            <button
              className="focus-ring inline-flex h-9 items-center gap-2 rounded-lg bg-sage px-3 text-xs font-bold text-white hover:bg-sage/90"
              onClick={() => markReviewed(item, 1)}
              type="button"
            >
              <Check size={15} />
            {t("iKnowThis", "I know this")}
            </button>
          </div>
        ) : (
          <p className="text-xs font-bold text-slate-500">
            {t("confidenceChangesInQuiz", "Confidence changes in Quiz or Edit.")}
          </p>
        )}
      </div>
    </article>
  );
}
