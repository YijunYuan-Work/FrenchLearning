import { CheckCircle2, CircleHelp, Plus, RotateCcw, XCircle } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { Metric } from "../components/Metric";
import { genderOptions } from "../data/wordFields";
import {
  DAILY_QUIZ_LIMIT,
  createDailyQuizState,
  getEligibleVocabulary,
  getTodayKey,
  isGenderCorrect,
  isMeaningCorrect,
  loadDailyQuizState,
  MAX_CONFIDENCE,
  saveDailyQuizState,
} from "../utils/quiz";
import { useLanguage } from "../i18n/LanguageContext";

export function QuizView({
  items,
  onQuizAnswer,
  onQuizComplete,
  onQuizStateChange,
  openNewItem,
  savedQuizState,
  user,
}) {
  const { t } = useLanguage();
  const [quizState, setQuizState] = useState(() =>
    savedQuizState ?? loadDailyQuizState(items, user?.id)
  );
  const [answer, setAnswer] = useState("");
  const [genderAnswer, setGenderAnswer] = useState("");
  const [lastResult, setLastResult] = useState(null);
  const appliedSavedQuizKeyRef = useRef("");
  const reportedCompletionRef = useRef(false);

  const eligibleItems = useMemo(() => getEligibleVocabulary(items), [items]);

  useEffect(() => {
    setQuizState((current) => {
      const today = getTodayKey();
      if (current.date !== today) {
        return createDailyQuizState(items, today);
      }

      const eligible = getEligibleVocabulary(items);
      if (
        current.queueIds.length === 0 &&
        Object.keys(current.answered).length === 0 &&
        eligible.length > 0
      ) {
        return createDailyQuizState(items, today);
      }

      const existingIds = new Set(items.map((item) => item.id));
      const nextQueueIds = current.queueIds.filter((id) => existingIds.has(id));
      if (nextQueueIds.length !== current.queueIds.length) {
        return { ...current, queueIds: nextQueueIds };
      }

      return current;
    });
  }, [items]);

  useEffect(() => {
    saveDailyQuizState(quizState, user?.id);
    onQuizStateChange?.(quizState);
  }, [onQuizStateChange, quizState, user?.id]);

  useEffect(() => {
    if (!savedQuizState) return;

    const savedQuizKey = JSON.stringify(savedQuizState);
    if (appliedSavedQuizKeyRef.current === savedQuizKey) return;

    appliedSavedQuizKeyRef.current = savedQuizKey;
    setQuizState(savedQuizState);
  }, [savedQuizState]);

  const quizItems = useMemo(() => {
    const byId = new Map(items.map((item) => [item.id, item]));
    return quizState.queueIds
      .map((id) => byId.get(id))
      .filter(Boolean)
      .filter(
        (item) =>
          quizState.answered[item.id] ||
          Number(item.confidence) < MAX_CONFIDENCE
      );
  }, [items, quizState]);

  const answeredResults = quizItems
    .map((item) => quizState.answered[item.id])
    .filter(Boolean);
  const answeredCount = answeredResults.length;
  const currentItem =
    lastResult?.item ??
    quizItems.find(
      (item) =>
        !quizState.answered[item.id] &&
        Number(item.confidence) < MAX_CONFIDENCE
    ) ??
    null;
  const correctCount = answeredResults.filter((result) => result.correct).length;
  const remainingCount = Math.max(quizItems.length - answeredCount, 0);
  const isQuizComplete =
    quizItems.length > 0 && answeredCount >= quizItems.length && !lastResult;
  const currentItemNeedsGender =
    currentItem?.partOfSpeech === "noun" && Boolean(currentItem.gender);

  useEffect(() => {
    reportedCompletionRef.current = false;
  }, [quizState.date, quizState.queueIds.join("|")]);

  useEffect(() => {
    if (!isQuizComplete || reportedCompletionRef.current) return;
    reportedCompletionRef.current = true;
    onQuizComplete?.();
  }, [isQuizComplete, onQuizComplete]);

  function submitAnswer(event) {
    event.preventDefault();
    if (!currentItem || lastResult) return;

    const meaningCorrect = isMeaningCorrect(answer, currentItem.english);
    const needsGender =
      currentItem.partOfSpeech === "noun" && Boolean(currentItem.gender);
    const genderCorrect = needsGender
      ? isGenderCorrect(genderAnswer, currentItem.gender)
      : true;
    const correct = meaningCorrect && genderCorrect;
    setQuizState((current) => ({
      ...current,
      answered: {
        ...current.answered,
        [currentItem.id]: {
          answer,
          genderAnswer,
          correct,
        },
      },
    }));

    if (correct) {
      onQuizAnswer(currentItem.id, true);
    }

    setLastResult({
      answer,
      correct,
      genderAnswer,
      genderCorrect,
      item: currentItem,
      meaningCorrect,
      needsGender,
    });
  }

  function continueQuiz() {
    setAnswer("");
    setGenderAnswer("");
    setLastResult(null);
  }

  function startNewQuiz() {
    setAnswer("");
    setGenderAnswer("");
    setLastResult(null);
    setQuizState(createDailyQuizState(items, getTodayKey()));
  }

  return (
    <div className="min-w-0">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label={t("todaysQuiz", "Today's quiz")} value={`${answeredCount}/${quizItems.length}`} />
        <Metric label={t("correct", "Correct")} value={correctCount} tone="green" />
        <Metric label={t("remaining", "Remaining")} value={remainingCount} tone="blue" />
        <Metric label={t("dailyGoal", "Daily goal")} value={DAILY_QUIZ_LIMIT} />
      </div>

      <section className="app-card mt-5 p-5">
        <div className="mb-4 flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-frenchBlue text-white">
            <CircleHelp size={20} />
          </div>
          <div>
            <p className="text-sm font-bold text-frenchRed">
              {t("vocabularyQuiz", "Vocabulary quiz")}
            </p>
            <h3 className="text-xl font-black">{t("writeEnglishMeaning", "Write the English meaning.")}</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {t(
                "quizRuleCopy",
                "Correct answers move the word up one confidence level. Words at max confidence are skipped in future daily quizzes."
              )}
            </p>
          </div>
        </div>

        {isQuizComplete ? (
          <div className="rounded-xl bg-white p-6 text-center shadow-inset">
            <div className="mx-auto grid size-12 place-items-center rounded-lg bg-sage text-white">
              <CheckCircle2 size={26} />
            </div>
            <p className="mt-4 text-sm font-bold text-frenchRed">
              {t("quizResult", "Quiz result")}
            </p>
            <h3 className="mt-1 text-2xl font-black">
              {t("quizComplete", "Today's quiz is complete.")}
            </h3>
            <p className="mt-2 text-sm text-slate-600">
              {t("quizCompleteCopy", "You tested {count} words.", {
                count: answeredCount,
              })}
            </p>
            <div className="mx-auto mt-5 grid max-w-xl gap-3 sm:grid-cols-3">
              <Metric label={t("correct", "Correct")} value={correctCount} tone="green" />
              <Metric
                label={t("notQuite", "Not quite")}
                value={answeredCount - correctCount}
                tone="red"
              />
              <Metric
                label={t("remaining", "Remaining")}
                value={getEligibleVocabulary(items).length}
                tone="blue"
              />
            </div>
            <button
              className="primary-action mt-5 h-10 disabled:cursor-not-allowed disabled:opacity-50"
              disabled={getEligibleVocabulary(items).length === 0}
              onClick={startNewQuiz}
              type="button"
            >
              <RotateCcw size={17} />
              {t("startNewQuiz", "Start a new quiz")}
            </button>
          </div>
        ) : eligibleItems.length === 0 ? (
          <div className="rounded-xl border border-dashed border-frenchBlue/30 bg-sky/40 p-8 text-center">
            <p className="font-black">{t("noVocabularyDueTitle", "No vocabulary is due today.")}</p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {t("noVocabularyDueCopy", "Add vocabulary or lower-confidence words to build a daily quiz.")}
            </p>
            <button
              className="primary-action mt-4 h-10"
              onClick={() => openNewItem("vocabulary")}
              type="button"
            >
              <Plus size={17} />
              {t("addVocabulary", "Add vocabulary")}
            </button>
          </div>
        ) : !currentItem ? (
          <div className="rounded-xl border border-dashed border-frenchBlue/30 bg-sky/40 p-8 text-center">
            <p className="font-black">
              {t("quizReadyTitle", "Ready for another quiz?")}
            </p>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              {t(
                "quizReadyCopy",
                "Start a new quiz to pull the next available vocabulary set."
              )}
            </p>
            <button
              className="primary-action mt-4 h-10"
              onClick={startNewQuiz}
              type="button"
            >
              <RotateCcw size={17} />
              {t("startNewQuiz", "Start a new quiz")}
            </button>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={submitAnswer}>
            <div className="rounded-xl bg-sky/45 p-5">
              <p className="text-xs font-bold text-slate-500">
                {t("french", "French")}
              </p>
              <p className="mt-1 text-3xl font-black tracking-[-0.01em] text-ink">
                {currentItem.french}
              </p>
              {currentItem.ipa && (
                <p className="mt-2 text-sm text-slate-500">{currentItem.ipa}</p>
              )}
            </div>

            <label className="grid gap-1 text-sm font-bold">
              {t("yourAnswer", "Your answer")}
              <input
                className="focus-ring h-11 rounded-lg border border-line bg-white px-3 font-normal shadow-sm"
                disabled={Boolean(lastResult)}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder={t("typeEnglishMeaning", "Type the English meaning")}
                value={answer}
              />
            </label>

            {currentItemNeedsGender && (
              <label className="grid gap-1 text-sm font-bold">
                {t("genderAnswer", "Gender")}
                <select
                  className="focus-ring h-11 rounded-lg border border-line bg-white px-3 font-normal shadow-sm"
                  disabled={Boolean(lastResult)}
                  onChange={(event) => setGenderAnswer(event.target.value)}
                  value={genderAnswer}
                >
                  {genderOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.labelKey, option.label)}
                    </option>
                  ))}
                </select>
              </label>
            )}

            {lastResult && (
              <div
                className={`rounded-xl p-4 ${
                  lastResult.correct
                    ? "bg-mint text-sage"
                    : "bg-blush text-frenchRed"
                }`}
              >
                <div className="flex items-center gap-2 font-bold">
                  {lastResult.correct ? (
                    <CheckCircle2 size={18} />
                  ) : (
                    <XCircle size={18} />
                  )}
                  {lastResult.correct ? t("correct", "Correct") : t("notQuite", "Not quite")}
                </div>
                <p className="mt-2 text-sm">
                  {t("meaning", "Meaning")}: <span className="font-semibold">{currentItem.english}</span>
                </p>
                {lastResult.needsGender && (
                  <p className="mt-1 text-sm">
                    {t("gender", "Gender")}:{" "}
                    <span className="font-semibold">{currentItem.gender}</span>
                  </p>
                )}
                {!lastResult.correct && (
                  <div className="mt-2 grid gap-1 text-sm">
                    <p>
                      {t("meaning", "Meaning")}:{" "}
                      {lastResult.meaningCorrect
                        ? t("correct", "Correct")
                        : t("notQuite", "Not quite")}
                    </p>
                    {lastResult.needsGender && (
                      <p>
                        {t("gender", "Gender")}:{" "}
                        {lastResult.genderCorrect
                          ? t("correct", "Correct")
                          : t("notQuite", "Not quite")}
                      </p>
                    )}
                  </div>
                )}
                {lastResult.correct && (
                  <p className="mt-1 text-sm">
                    {t("confidenceAdvanced", "Confidence advanced to {value}.", {
                      value: Math.min(Number(currentItem.confidence) + 1, MAX_CONFIDENCE),
                    })}
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end">
              {lastResult ? (
                <button
                  className="primary-action h-10"
                  onClick={continueQuiz}
                  type="button"
                >
                  {t("nextWord", "Next word")}
                </button>
              ) : (
                <button
                  className="primary-action h-10 disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={
                    !answer.trim() ||
                    (currentItemNeedsGender && !genderAnswer.trim())
                  }
                  type="submit"
                >
                  {t("checkAnswer", "Check answer")}
                </button>
              )}
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
