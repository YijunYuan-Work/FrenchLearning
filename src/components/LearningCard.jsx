import { Check, CheckSquare, Edit3, Square, Trash2 } from "lucide-react";
import { categories } from "../data/categories";
import { conjugationPronouns, partOfSpeechLabel } from "../data/wordFields";

function confidenceLabel(value) {
  if (value >= 4) return "Strong";
  if (value === 3) return "Familiar";
  if (value === 2) return "Learning";
  return "Needs practice";
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
  const CategoryIcon = categories[item.category].icon;
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
      className={`rounded-md border p-4 shadow-sm ${
        isSelected
          ? "border-frenchBlue/40 bg-frenchBlue/5"
          : "border-frenchBlue/10 bg-paper"
      }`}
    >
      <div className="flex flex-col gap-3 md:flex-row md:items-start md:justify-between">
        <div className="min-w-0">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <button
              aria-label={`${isSelected ? "Unselect" : "Select"} ${item.french}`}
              className="focus-ring inline-flex size-7 items-center justify-center rounded-md border border-slate-200 bg-white text-frenchBlue"
              onClick={() => onToggleSelected(item.id)}
              type="button"
            >
              {isSelected ? <CheckSquare size={16} /> : <Square size={16} />}
            </button>
            <span className="inline-flex items-center gap-1 rounded-md bg-frenchBlue/8 px-2 py-1 text-xs font-semibold text-frenchBlue">
              <CategoryIcon size={13} />
              {categories[item.category].label}
            </span>
            <span className="rounded-md bg-sage/10 px-2 py-1 text-xs font-semibold text-sage">
              {confidenceLabel(item.confidence)}
            </span>
          </div>
          <h3 className="text-xl font-bold leading-snug">{item.french}</h3>
          <p className="mt-1 text-sm font-semibold text-slate-600">
            {item.english}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            aria-label={`Edit ${item.french}`}
            className="focus-ring inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-slate-200 bg-white text-slate-600 hover:text-frenchBlue"
            onClick={() => openEditItem(item)}
            type="button"
          >
            <Edit3 size={16} />
          </button>
          <button
            aria-label={`Delete ${item.french}`}
            className="focus-ring inline-flex size-9 shrink-0 items-center justify-center rounded-md border border-frenchRed/20 bg-white text-frenchRed hover:bg-frenchRed/5"
            onClick={() => onDeleteItem(item)}
            type="button"
          >
            <Trash2 size={16} />
          </button>
        </div>
      </div>

      <div className="mt-4 grid gap-3 md:grid-cols-2">
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Example
          </p>
          <p className="mt-1 text-sm leading-6 text-slate-800">
            {item.example}
          </p>
        </div>
        {hasGrammarDetails && (
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
              Grammar details
            </p>
            <div className="mt-1 grid gap-2 text-sm leading-6 text-slate-800">
              {item.partOfSpeech && (
                <p>
                  <span className="font-semibold">Type:</span>{" "}
                  {partOfSpeechLabel(item.partOfSpeech)}
                </p>
              )}
              {item.ipa && (
                <p>
                  <span className="font-semibold">IPA:</span> {item.ipa}
                </p>
              )}
              {item.gender && (
                <p>
                  <span className="font-semibold">Gender:</span> {item.gender}
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
        <div>
          <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
            Notes
          </p>
          <p className="mt-1 whitespace-pre-line text-sm leading-6 text-slate-800">
            {item.notes}
          </p>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 border-t border-slate-200 pt-3 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex flex-wrap gap-2">
          {(item.tags ?? []).map((tag) => (
            <span
              className="rounded-md bg-slate-100 px-2 py-1 text-xs font-medium text-slate-600"
              key={tag}
            >
              {tag}
            </span>
          ))}
        </div>
        {allowConfidenceActions ? (
          <div className="flex gap-2">
            <button
              className="focus-ring inline-flex h-9 items-center gap-2 rounded-md border border-frenchRed/20 bg-white px-3 text-xs font-semibold text-frenchRed hover:bg-frenchRed/5"
              onClick={() => markReviewed(item, -1)}
              type="button"
            >
              Needs practice
            </button>
            <button
              className="focus-ring inline-flex h-9 items-center gap-2 rounded-md bg-sage px-3 text-xs font-semibold text-white hover:bg-sage/90"
              onClick={() => markReviewed(item, 1)}
              type="button"
            >
              <Check size={15} />
              I know this
            </button>
          </div>
        ) : (
          <p className="text-xs font-semibold text-slate-500">
            Confidence changes in Quiz or Edit.
          </p>
        )}
      </div>
    </article>
  );
}
