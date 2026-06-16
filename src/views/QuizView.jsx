import { CheckCircle2, CircleHelp, Plus, XCircle } from "lucide-react";
import { useEffect, useMemo, useState } from "react";
import { Metric } from "../components/Metric";
import {
  DAILY_QUIZ_LIMIT,
  createDailyQuizState,
  getEligibleVocabulary,
  getTodayKey,
  isMeaningCorrect,
  loadDailyQuizState,
  MAX_CONFIDENCE,
  saveDailyQuizState,
} from "../utils/quiz";

export function QuizView({ items, onQuizAnswer, openNewItem, user }) {
  const [quizState, setQuizState] = useState(() =>
    loadDailyQuizState(items, user?.id)
  );
  const [answer, setAnswer] = useState("");
  const [lastResult, setLastResult] = useState(null);

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
  }, [quizState, user?.id]);

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

  const answeredCount = quizItems.filter(
    (item) => quizState.answered[item.id]
  ).length;
  const currentItem =
    lastResult?.item ??
    quizItems.find(
      (item) =>
        !quizState.answered[item.id] &&
        Number(item.confidence) < MAX_CONFIDENCE
    ) ??
    null;
  const correctCount = Object.values(quizState.answered).filter(
    (result) => result.correct
  ).length;
  const remainingCount = Math.max(quizItems.length - answeredCount, 0);

  function submitAnswer(event) {
    event.preventDefault();
    if (!currentItem || lastResult) return;

    const correct = isMeaningCorrect(answer, currentItem.english);
    setQuizState((current) => ({
      ...current,
      answered: {
        ...current.answered,
        [currentItem.id]: {
          answer,
          correct,
        },
      },
    }));

    if (correct) {
      onQuizAnswer(currentItem.id, true);
    }

    setLastResult({ answer, correct, item: currentItem });
  }

  function continueQuiz() {
    setAnswer("");
    setLastResult(null);
  }

  return (
    <div className="min-w-0">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label="Today's quiz" value={`${answeredCount}/${quizItems.length}`} />
        <Metric label="Correct" value={correctCount} tone="green" />
        <Metric label="Remaining" value={remainingCount} tone="blue" />
        <Metric label="Daily goal" value={DAILY_QUIZ_LIMIT} />
      </div>

      <section className="mt-5 rounded-md border border-frenchBlue/10 bg-paper p-5 shadow-sm">
        <div className="mb-4 flex items-start gap-3">
          <div className="grid size-10 shrink-0 place-items-center rounded-md bg-frenchBlue text-white">
            <CircleHelp size={20} />
          </div>
          <div>
            <p className="text-sm font-semibold text-frenchRed">
              Vocabulary quiz
            </p>
            <h3 className="text-xl font-bold">Write the English meaning.</h3>
            <p className="mt-1 text-sm leading-6 text-slate-600">
              Correct answers move the word up one confidence level. Words at
              max confidence are skipped in future daily quizzes.
            </p>
          </div>
        </div>

        {eligibleItems.length === 0 ? (
          <div className="rounded-md border border-dashed border-frenchBlue/25 bg-white p-8 text-center">
            <p className="font-semibold">No vocabulary is due today.</p>
            <p className="mt-1 text-sm text-slate-600">
              Add vocabulary or lower-confidence words to build a daily quiz.
            </p>
            <button
              className="focus-ring mt-4 inline-flex h-10 items-center justify-center gap-2 rounded-md bg-frenchBlue px-4 text-sm font-semibold text-white hover:bg-frenchBlue/90"
              onClick={() => openNewItem("vocabulary")}
              type="button"
            >
              <Plus size={17} />
              Add vocabulary
            </button>
          </div>
        ) : !currentItem ? (
          <div className="rounded-md bg-sage/10 p-6 text-center text-sage">
            <CheckCircle2 className="mx-auto mb-2" size={28} />
            <p className="font-semibold">Today's quiz is complete.</p>
            <p className="mt-1 text-sm">
              You tested {answeredCount} word{answeredCount === 1 ? "" : "s"}.
            </p>
          </div>
        ) : (
          <form className="grid gap-4" onSubmit={submitAnswer}>
            <div className="rounded-md bg-white p-5">
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                French
              </p>
              <p className="mt-1 text-3xl font-bold text-ink">
                {currentItem.french}
              </p>
              {currentItem.ipa && (
                <p className="mt-2 text-sm text-slate-500">{currentItem.ipa}</p>
              )}
            </div>

            <label className="grid gap-1 text-sm font-semibold">
              Your answer
              <input
                className="focus-ring h-11 rounded-md border border-slate-200 bg-white px-3 font-normal"
                disabled={Boolean(lastResult)}
                onChange={(event) => setAnswer(event.target.value)}
                placeholder="Type the English meaning"
                value={answer}
              />
            </label>

            {lastResult && (
              <div
                className={`rounded-md p-4 ${
                  lastResult.correct
                    ? "bg-sage/10 text-sage"
                    : "bg-frenchRed/10 text-frenchRed"
                }`}
              >
                <div className="flex items-center gap-2 font-semibold">
                  {lastResult.correct ? (
                    <CheckCircle2 size={18} />
                  ) : (
                    <XCircle size={18} />
                  )}
                  {lastResult.correct ? "Correct" : "Not quite"}
                </div>
                <p className="mt-2 text-sm">
                  Meaning: <span className="font-semibold">{currentItem.english}</span>
                </p>
                {lastResult.correct && (
                  <p className="mt-1 text-sm">
                    Confidence advanced to {Math.min(Number(currentItem.confidence) + 1, MAX_CONFIDENCE)}.
                  </p>
                )}
              </div>
            )}

            <div className="flex justify-end">
              {lastResult ? (
                <button
                  className="focus-ring h-10 rounded-md bg-frenchBlue px-4 text-sm font-semibold text-white"
                  onClick={continueQuiz}
                  type="button"
                >
                  Next word
                </button>
              ) : (
                <button
                  className="focus-ring h-10 rounded-md bg-frenchBlue px-4 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
                  disabled={!answer.trim()}
                  type="submit"
                >
                  Check answer
                </button>
              )}
            </div>
          </form>
        )}
      </section>
    </div>
  );
}
