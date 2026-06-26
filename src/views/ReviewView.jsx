import {
  CheckCircle2,
  ChevronLeft,
  ChevronRight,
  Edit3,
  Plus,
  RotateCcw,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { categories } from "../data/categories";
import { conjugationPronouns, partOfSpeechLabel } from "../data/wordFields";
import { useLanguage } from "../i18n/LanguageContext";
import {
  getTodayKey,
  MAX_CONFIDENCE,
  shuffleItems,
  uniqueLearningItems,
} from "../utils/quiz";
import { RichTextContent } from "../components/RichTextEditor";
import { defaultLearningSettings } from "../utils/learningSettings";

const studyCategories = [
  ["vocabulary", "studyVocabularyLimit"],
  ["phrases", "studyPhraseLimit"],
  ["grammar", "studyGrammarLimit"],
];

function confidenceLabel(value, t) {
  if (value >= 4) return t("confidenceStrong", "Strong");
  if (value === 3) return t("confidenceFamiliar", "Familiar");
  if (value === 2) return t("confidenceLearning", "Learning");
  return t("confidenceNeedsPractice", "Needs practice");
}

function DetailBlock({ label, children }) {
  if (!children) return null;

  return (
    <div>
      <p className="text-xs font-bold text-slate-500">
        {label}
      </p>
      <div className="mt-1 text-sm leading-6 text-slate-800">{children}</div>
    </div>
  );
}

function createStudyCycle(studyItems, settings, excludedIds = []) {
  const excluded = new Set(excludedIds);
  const cycleIds = studyCategories.flatMap(([category, limitKey]) =>
    shuffleItems(
      uniqueLearningItems(
        studyItems.filter(
          (item) => item.category === category && !excluded.has(item.id)
        )
      )
    )
      .slice(0, settings[limitKey] ?? defaultLearningSettings[limitKey])
      .map((item) => item.id)
  );

  return {
    cycleIds,
    seenIds: Array.from(new Set([...excludedIds, ...cycleIds])),
  };
}

export function ReviewView({
  items,
  learningSettings = defaultLearningSettings,
  onStudyConfidenceChange,
  onStudyComplete,
  onStudyStateChange,
  openEditItem,
  openNewItem,
  savedStudyState,
}) {
  const { t } = useLanguage();
  const studySettings = useMemo(
    () => ({
      ...defaultLearningSettings,
      ...learningSettings,
    }),
    [learningSettings]
  );
  const studyItems = useMemo(
    () =>
      uniqueLearningItems(
        items.filter(
          (item) =>
            ["vocabulary", "grammar", "phrases"].includes(item.category) &&
            Number(item.confidence) < MAX_CONFIDENCE
        )
      )
        .sort((a, b) => {
          const confidenceGap = Number(a.confidence) - Number(b.confidence);
          if (confidenceGap !== 0) return confidenceGap;
          return a.french.localeCompare(b.french, "fr");
        }),
    [items]
  );
  const itemsById = useMemo(
    () => new Map(items.map((item) => [item.id, item])),
    [items]
  );
  const savedStateIsCurrent = savedStudyState?.date === getTodayKey();
  const [cardIndex, setCardIndex] = useState(() =>
    savedStateIsCurrent ? Number(savedStudyState.cardIndex) || 0 : 0
  );
  const [studyCycle, setStudyCycle] = useState(() =>
    savedStateIsCurrent
      ? {
          cycleIds: savedStudyState.cycleIds ?? [],
          seenIds: savedStudyState.seenIds ?? [],
        }
      : createStudyCycle(studyItems, studySettings)
  );
  const [isFlipped, setIsFlipped] = useState(() =>
    savedStateIsCurrent ? Boolean(savedStudyState.isFlipped) : false
  );
  const [isStudyComplete, setIsStudyComplete] = useState(() =>
    savedStateIsCurrent ? Boolean(savedStudyState.isStudyComplete) : false
  );
  const cycleIds = studyCycle.cycleIds;
  const previousCycleLengthRef = useRef(cycleIds.length);
  const cycleItems = useMemo(
    () => cycleIds.map((id) => itemsById.get(id)).filter(Boolean),
    [cycleIds, itemsById]
  );
  const currentItem = cycleItems[cardIndex];
  const cycleGroups = useMemo(
    () =>
      studyCategories.map(([category, limitKey]) => {
        const groupItems = cycleItems.filter((item) => item.category === category);
        const reviewedCount = cycleItems
          .slice(0, cardIndex + 1)
          .filter((item) => item.category === category).length;
        const isCurrent = currentItem?.category === category;
        const limit = studySettings[limitKey] ?? defaultLearningSettings[limitKey];

        return {
          category,
          isCurrent,
          limit,
          reviewedCount: Math.min(reviewedCount, groupItems.length),
          total: groupItems.length,
        };
      }),
    [cardIndex, currentItem?.category, cycleItems, studySettings]
  );
  const hasUnseenStudyItems = useMemo(() => {
    const seen = new Set(studyCycle.seenIds);
    return studyItems.some((item) => !seen.has(item.id));
  }, [studyCycle.seenIds, studyItems]);

  useEffect(() => {
    setStudyCycle((current) => {
      const existingIds = new Set(items.map((item) => item.id));
      const nextCycleIds = current.cycleIds.filter((id) => existingIds.has(id));
      const nextSeenIds = current.seenIds.filter((id) => existingIds.has(id));

      if (nextCycleIds.length === 0 && studyItems.length > 0 && !isStudyComplete) {
        return createStudyCycle(studyItems, studySettings);
      }

      if (
        nextCycleIds.length !== current.cycleIds.length ||
        nextSeenIds.length !== current.seenIds.length
      ) {
        return { cycleIds: nextCycleIds, seenIds: nextSeenIds };
      }

      return current;
    });
  }, [items, isStudyComplete, studyItems, studySettings]);

  useEffect(() => {
    setCardIndex((current) =>
      Math.min(current, Math.max(0, cycleItems.length - 1))
    );
    if (previousCycleLengthRef.current !== cycleItems.length) {
      setIsFlipped(false);
      previousCycleLengthRef.current = cycleItems.length;
    }
  }, [cycleItems.length]);

  useEffect(() => {
    onStudyStateChange?.({
      cardIndex,
      cycleIds: studyCycle.cycleIds,
      date: getTodayKey(),
      isFlipped,
      isStudyComplete,
      seenIds: studyCycle.seenIds,
    });
  }, [
    cardIndex,
    isFlipped,
    isStudyComplete,
    onStudyStateChange,
    studyCycle.cycleIds,
    studyCycle.seenIds,
  ]);

  function moveToCard(nextIndex) {
    setCardIndex(nextIndex);
    setIsFlipped(false);
  }

  function startNewStudyCycle() {
    setStudyCycle((current) =>
      createStudyCycle(studyItems, studySettings, current.seenIds)
    );
    setCardIndex(0);
    setIsFlipped(false);
    setIsStudyComplete(false);
  }

  function finishStudyCycle() {
    setIsStudyComplete(true);
    onStudyComplete?.();
  }

  if (!currentItem) {
    const hasStudiedEverything = studyItems.length > 0 && cycleItems.length === 0;
    return (
      <div className="rounded-xl border border-dashed border-frenchBlue/30 bg-sky/40 p-8 text-center">
        <p className="font-black">
          {hasStudiedEverything
            ? t("studyNoUnseenTitle", "All available study cards have appeared.")
            : t("noStudyCards", "No study cards are due.")}
        </p>
        <p className="mt-1 text-sm leading-6 text-slate-600">
          {hasStudiedEverything
            ? t(
                "studyNoUnseenCopy",
                "Add more notes or return after confidence levels change."
              )
            : t(
                "noStudyCardsCopy",
                "Add a new note or edit an existing note if you want something in the Study deck."
              )}
        </p>
        {!hasStudiedEverything && (
          <button
            className="primary-action mt-4 h-10"
            onClick={() => openNewItem("vocabulary")}
            type="button"
          >
            <Plus size={17} />
            {t("addNote", "Add note")}
          </button>
        )}
      </div>
    );
  }

  const CategoryIcon = categories[currentItem.category].icon;
  const isGrammarNote = currentItem.category === "grammar";
  const isPhraseNote = currentItem.category === "phrases";
  const canAdjustConfidence = isGrammarNote || isPhraseNote;
  const currentGroup = cycleGroups.find((group) => group.isCurrent);
  if (isStudyComplete) {
    return (
      <div className="app-card mx-auto w-full max-w-4xl p-8 text-center">
        <div className="mx-auto grid size-12 place-items-center rounded-lg bg-sage text-white">
          <CheckCircle2 size={26} />
        </div>
        <p className="mt-4 text-sm font-bold text-frenchRed">
          {t("studyComplete", "Study complete")}
        </p>
        <h2 className="mt-1 text-2xl font-black">
          {t("studyCompleteTitle", "Nice work. You finished this study cycle.")}
        </h2>
        <p className="mt-2 text-sm leading-6 text-slate-600">
          {t("studyCompleteCopy", "You reviewed {count} cards.", {
            count: cycleItems.length,
          })}
        </p>
        <button
          className="primary-action mt-5 h-10 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={!hasUnseenStudyItems}
          onClick={startNewStudyCycle}
          type="button"
        >
          <RotateCcw size={17} />
          {t("startNewStudy", "Start a new study cycle")}
        </button>
      </div>
    );
  }

  const isLastCard = cardIndex === cycleItems.length - 1;
  const hasConjugation =
    currentItem.partOfSpeech === "verb" &&
    conjugationPronouns.some((pronoun) => currentItem.conjugation?.[pronoun]);
  const hasAdjectiveForms =
    currentItem.partOfSpeech === "adjective" &&
    Object.values(currentItem.adjectiveForms ?? {}).some(Boolean);

  return (
    <div className="mx-auto w-full max-w-4xl">
      <div className="mb-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <p className="text-sm font-bold text-frenchRed">{t("studyMode", "Study mode")}</p>
          <h2 className="text-2xl font-black">{t("flashcards", "Flashcards")}</h2>
          {currentGroup && (
            <p className="mt-1 text-sm font-bold text-slate-600">
              {t("studyCurrentSection", "{section} {current}/{total}", {
                section: t(
                  categories[currentGroup.category].labelKey,
                  categories[currentGroup.category].label
                ),
                current: currentGroup.reviewedCount,
                total: currentGroup.total,
              })}
            </p>
          )}
        </div>
        <div className="rounded-lg border border-line bg-white px-3 py-2 text-sm font-bold text-slate-600 shadow-sm">
          {t("cardProgress", "Card {current} of {total}", {
            current: cardIndex + 1,
            total: cycleItems.length,
          })}
        </div>
      </div>

      <div className="mb-4 grid gap-2 rounded-xl bg-white p-2 shadow-inset md:grid-cols-3">
        {cycleGroups.map((group) => {
          const Icon = categories[group.category].icon;
          return (
            <div
              className={`rounded-lg border px-3 py-2 transition ${
                group.isCurrent
                  ? "border-frenchBlue bg-sky text-frenchBlue"
                  : "border-line bg-white text-slate-600"
              }`}
              key={group.category}
            >
              <div className="flex items-center justify-between gap-2">
                <span className="inline-flex items-center gap-2 text-sm font-black">
                  <Icon size={16} />
                  {t(
                    categories[group.category].labelKey,
                    categories[group.category].label
                  )}
                </span>
                <span className="text-sm font-black">
                  {group.reviewedCount}/{group.total}
                </span>
              </div>
              <p className="mt-1 text-xs font-semibold opacity-75">
                {t("studyLimitIndicator", "Limit {limit}, available {total}", {
                  limit: group.limit,
                  total: group.total,
                })}
              </p>
            </div>
          );
        })}
      </div>

      <div className="app-card p-3">
        <div className="flip-scene min-h-[360px]">
          <div className={`flip-card ${isFlipped ? "is-flipped" : ""}`}>
            <button
              aria-label={`Reveal details for ${currentItem.french}`}
              aria-hidden={isFlipped}
              className="focus-ring flip-card-face grid min-h-[360px] w-full place-items-center rounded-xl border border-dashed border-frenchBlue/30 bg-sky/35 p-6 text-center hover:border-frenchBlue/45"
              onClick={() => setIsFlipped(true)}
              tabIndex={isFlipped ? -1 : 0}
              type="button"
            >
              <span className="break-words text-4xl font-black leading-tight tracking-[-0.02em] text-ink md:text-6xl">
                {currentItem.french}
              </span>
            </button>

            <div
              aria-hidden={!isFlipped}
              className="flip-card-face flip-card-back min-h-[360px] rounded-xl border border-line bg-white p-5"
              inert={!isFlipped ? "" : undefined}
            >
              <div className="flex flex-col gap-3 border-b border-line pb-4 sm:flex-row sm:items-start sm:justify-between">
                <div>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="inline-flex items-center gap-1 rounded-lg bg-sky px-2 py-1 text-xs font-bold text-frenchBlue">
                      <CategoryIcon size={13} />
                      {t(categories[currentItem.category].labelKey, categories[currentItem.category].label)}
                    </span>
                    <span className="rounded-lg bg-mint px-2 py-1 text-xs font-bold text-sage">
                      {confidenceLabel(Number(currentItem.confidence), t)}
                    </span>
                  </div>
                  <h3 className="mt-3 text-3xl font-black leading-tight tracking-[-0.01em]">
                    {currentItem.french}
                  </h3>
                  {currentItem.english && !isPhraseNote && (
                    <p className="mt-2 text-lg font-bold text-slate-700">
                      {currentItem.english}
                    </p>
                  )}
                </div>
                <button
                  className="secondary-action h-9 shrink-0 px-3 text-xs"
                  onClick={() => openEditItem(currentItem)}
                  type="button"
                >
                  <Edit3 size={15} />
                  {t("editNote", "Edit note")}
                </button>
              </div>

              <div className="mt-5 grid gap-5 md:grid-cols-2">
                {canAdjustConfidence && (
                  <DetailBlock label={t("confidence", "Confidence")}>
                    <div className="flex flex-wrap gap-2">
                      {[1, 2, 3, 4].map((value) => {
                        const isActive = Number(currentItem.confidence) === value;
                        return (
                          <button
                            className={`focus-ring rounded-lg px-3 py-2 text-xs font-black transition ${
                              isActive
                                ? "bg-frenchBlue text-white shadow-soft"
                                : "bg-sky text-frenchBlue hover:bg-frenchBlue hover:text-white"
                            }`}
                            key={value}
                            onClick={() =>
                              onStudyConfidenceChange?.(currentItem.id, value)
                            }
                            type="button"
                          >
                            {confidenceLabel(value, t)}
                          </button>
                        );
                      })}
                    </div>
                  </DetailBlock>
                )}
                {isPhraseNote && (
                  <DetailBlock label={t("translation", "Translation")}>
                    {currentItem.english || t("unknown", "Unknown")}
                  </DetailBlock>
                )}
                {!isGrammarNote && !isPhraseNote && (
                  <DetailBlock label={t("example", "Example")}>
                    {currentItem.example || t("noExampleYet", "No example yet.")}
                  </DetailBlock>
                )}
                {!isPhraseNote && (
                  <DetailBlock label={isGrammarNote ? t("grammarNote", "Grammar note") : t("notes", "Notes")}>
                    {isGrammarNote && currentItem.notes ? (
                      <RichTextContent html={currentItem.notes} />
                    ) : (
                      <p className="whitespace-pre-line">
                        {currentItem.notes || t("noNotesYet", "No notes yet.")}
                      </p>
                    )}
                  </DetailBlock>
                )}
                {(currentItem.partOfSpeech || currentItem.ipa || currentItem.gender) && (
                  <DetailBlock label={t("wordDetails", "Word details")}>
                    <div className="grid gap-1">
                      {currentItem.partOfSpeech && (
                        <p>
                          <span className="font-semibold">{t("type", "Type")}:</span>{" "}
                          {partOfSpeechLabel(currentItem.partOfSpeech, t)}
                        </p>
                      )}
                      {currentItem.ipa && (
                        <p>
                          <span className="font-semibold">IPA:</span>{" "}
                          {currentItem.ipa}
                        </p>
                      )}
                      {currentItem.gender && (
                        <p>
                          <span className="font-semibold">{t("gender", "Gender")}:</span>{" "}
                          {currentItem.gender}
                        </p>
                      )}
                    </div>
                  </DetailBlock>
                )}
                {hasConjugation && (
                  <DetailBlock label={t("conjugation", "Conjugation")}>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {conjugationPronouns.map((pronoun) =>
                        currentItem.conjugation?.[pronoun] ? (
                          <div className="flex gap-2" key={pronoun}>
                            <dt className="font-semibold">{pronoun}</dt>
                            <dd>{currentItem.conjugation[pronoun]}</dd>
                          </div>
                        ) : null
                      )}
                    </dl>
                  </DetailBlock>
                )}
                {hasAdjectiveForms && (
                  <DetailBlock label={t("adjectiveForms", "Adjective forms")}>
                    <dl className="grid grid-cols-2 gap-x-4 gap-y-1">
                      {[
                        ["masculine", "masc."],
                        ["feminine", "fem."],
                        ["masculinePlural", "masc. pl."],
                        ["femininePlural", "fem. pl."],
                      ].map(([field, label]) =>
                        currentItem.adjectiveForms?.[field] ? (
                          <div className="flex gap-2" key={field}>
                            <dt className="font-semibold">{label}</dt>
                            <dd>{currentItem.adjectiveForms[field]}</dd>
                          </div>
                        ) : null
                      )}
                    </dl>
                  </DetailBlock>
                )}
                {(currentItem.tags ?? []).length > 0 && (
                  <DetailBlock label={t("tags", "Tags")}>
                    <div className="flex flex-wrap gap-2">
                      {currentItem.tags.map((tag) => (
                        <span
                          className="rounded-lg bg-slate-100 px-2 py-1 text-xs font-bold text-slate-600"
                          key={tag}
                        >
                          {tag}
                        </span>
                      ))}
                    </div>
                  </DetailBlock>
                )}
              </div>
            </div>
          </div>
        </div>
      </div>

      <div className="mt-4 flex flex-col gap-3 sm:flex-row sm:items-center sm:justify-between">
        <button
          className="secondary-action h-10 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={cardIndex === 0}
          onClick={() => moveToCard(cardIndex - 1)}
          type="button"
        >
          <ChevronLeft size={17} />
          {t("previous", "Previous")}
        </button>
        <button
          className="secondary-action h-10"
          onClick={() => setIsFlipped((current) => !current)}
          type="button"
        >
          <RotateCcw size={17} />
          {isFlipped ? t("showFront", "Show front") : t("showDetails", "Show details")}
        </button>
        <button
          className="primary-action h-10"
          onClick={() =>
            isLastCard ? finishStudyCycle() : moveToCard(cardIndex + 1)
          }
          type="button"
        >
          {isLastCard ? t("finishStudy", "Finish study") : t("next", "Next")}
          <ChevronRight size={17} />
        </button>
      </div>
    </div>
  );
}
