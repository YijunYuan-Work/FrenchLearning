import { CircleHelp, ListChecks, Plus } from "lucide-react";
import { useMemo } from "react";
import { Metric } from "../components/Metric";
import {
  DAILY_QUIZ_LIMIT,
  getEligibleVocabulary,
  MAX_CONFIDENCE,
} from "../utils/quiz";
import { useLanguage } from "../i18n/LanguageContext";

export function TodayView({ items, onStartQuiz, onStartStudy, openNewItem }) {
  const { t } = useLanguage();
  const eligibleItems = useMemo(() => getEligibleVocabulary(items), [items]);
  const dueCount = Math.min(eligibleItems.length, DAILY_QUIZ_LIMIT);
  const studyCount = useMemo(
    () => items.filter((item) => Number(item.confidence) < MAX_CONFIDENCE).length,
    [items]
  );

  return (
    <div className="min-w-0">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label={t("vocabularyDue", "Vocabulary due")} value={dueCount} tone="blue" />
        <Metric label={t("dailyGoal", "Daily goal")} value={DAILY_QUIZ_LIMIT} />
        <Metric label={t("savedNotes", "Saved notes")} value={items.length} />
        <Metric
          label={t("mastered", "Mastered")}
          value={
            items.filter(
              (item) => item.category === "vocabulary" && Number(item.confidence) >= 4
            ).length
          }
          tone="green"
        />
      </div>

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <button
          className="focus-ring rounded-md border border-frenchBlue/10 bg-paper p-5 text-left shadow-sm hover:border-frenchBlue/30 hover:bg-white"
          onClick={() => openNewItem("vocabulary")}
          type="button"
        >
          <div className="grid size-10 place-items-center rounded-md bg-frenchBlue text-white">
            <Plus size={20} />
          </div>
          <h3 className="mt-4 text-xl font-bold">
            {t("addNewNote", "Add a new note")}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t(
              "addNewNoteCopy",
              "Capture a vocabulary word, phrase, grammar note, or pronunciation rule before you forget it."
            )}
          </p>
        </button>

        <button
          className="focus-ring rounded-md border border-frenchBlue/10 bg-paper p-5 text-left shadow-sm hover:border-frenchBlue/30 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={studyCount === 0}
          onClick={onStartStudy}
          type="button"
        >
          <div className="grid size-10 place-items-center rounded-md bg-sage text-white">
            <ListChecks size={20} />
          </div>
          <h3 className="mt-4 text-xl font-bold">
            {t("studyCards", "Study flashcards")}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t(
              "studyCardsCopy",
              "Flip through notes that have not reached strong confidence yet. Study mode does not change confidence."
            )}
          </p>
          <p className="mt-3 text-sm font-semibold text-frenchBlue">
            {studyCount > 0
              ? t(
                  studyCount === 1 ? "cardReady" : "cardsReady",
                  `${studyCount} card${studyCount === 1 ? "" : "s"} ready`,
                  { count: studyCount }
                )
              : t("noCardsNeedStudy", "No cards need study")}
          </p>
        </button>

        <button
          className="focus-ring rounded-md border border-frenchBlue/10 bg-paper p-5 text-left shadow-sm hover:border-frenchBlue/30 hover:bg-white disabled:cursor-not-allowed disabled:opacity-60"
          disabled={dueCount === 0}
          onClick={onStartQuiz}
          type="button"
        >
          <div className="grid size-10 place-items-center rounded-md bg-frenchRed text-white">
            <CircleHelp size={20} />
          </div>
          <h3 className="mt-4 text-xl font-bold">
            {t("startQuiz", "Start today's quiz")}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t(
              "startQuizCopy",
              "Test up to {count} vocabulary words. Correct answers advance confidence, and mastered words are skipped.",
              { count: DAILY_QUIZ_LIMIT }
            )}
          </p>
          <p className="mt-3 text-sm font-semibold text-frenchBlue">
            {dueCount > 0
              ? t(
                  dueCount === 1 ? "wordReady" : "wordsReady",
                  `${dueCount} word${dueCount === 1 ? "" : "s"} ready`,
                  { count: dueCount }
                )
              : t("noVocabularyDue", "No vocabulary is due today")}
          </p>
        </button>
      </div>
    </div>
  );
}
