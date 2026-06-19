import {
  BookMarked,
  CircleHelp,
  Clock3,
  ListChecks,
  Plus,
  Route,
} from "lucide-react";
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
  const masteredCount = items.filter(
    (item) => item.category === "vocabulary" && Number(item.confidence) >= 4
  ).length;
  const practiceSteps = [
    {
      title: t("addNewNote", "Add a new note"),
      copy: t("dailyStepCapture", "Capture one useful word or phrase."),
      Icon: Plus,
      tone: "bg-sky text-frenchBlue",
    },
    {
      title: t("studyCards", "Study flashcards"),
      copy: t("dailyStepStudy", "Review cards that still feel new."),
      Icon: ListChecks,
      tone: "bg-mint text-sage",
    },
    {
      title: t("startQuiz", "Start today's quiz"),
      copy: t("dailyStepQuiz", "Check recall and advance confidence."),
      Icon: CircleHelp,
      tone: "bg-blush text-frenchRed",
    },
  ];

  return (
    <div className="min-w-0">
      <div className="grid grid-cols-2 gap-2 sm:gap-3 xl:grid-cols-4">
        <Metric label={t("vocabularyDue", "Vocabulary due")} value={dueCount} tone="blue" />
        <Metric label={t("dailyGoal", "Daily goal")} value={DAILY_QUIZ_LIMIT} />
        <Metric label={t("savedNotes", "Saved notes")} value={items.length} />
        <Metric label={t("mastered", "Mastered")} value={masteredCount} tone="green" />
      </div>

      <div className="mt-4 grid gap-4 sm:mt-5 xl:grid-cols-[minmax(0,1fr)_320px] xl:gap-5">
        <section className="app-card overflow-hidden">
          <div className="border-b border-line bg-sky/45 p-4 sm:p-5">
            <div className="flex gap-3 sm:flex-col sm:gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="inline-flex items-center gap-2 text-sm font-black text-frenchBlue">
                  <Clock3 size={16} />
                  {t("twelveMinutePractice", "12-minute practice")}
                </p>
                <h3 className="mt-2 text-xl font-black tracking-[-0.01em] sm:text-2xl">
                  {t("todayPracticePath", "Your French path for today")}
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
                  {t(
                    "todayPracticePathCopy",
                    "A short loop keeps practice light: capture something useful, review what is fading, then quiz what is ready."
                  )}
                </p>
              </div>
              <div className="hidden size-16 shrink-0 place-items-center rounded-xl bg-white text-frenchBlue shadow-soft sm:grid">
                <Route size={28} />
              </div>
            </div>
          </div>

          <div className="grid gap-2 p-3 sm:gap-3 sm:p-4 md:grid-cols-3">
            {practiceSteps.map(({ Icon, copy, title, tone }) => (
              <div className="flex gap-3 rounded-xl bg-white p-3 shadow-inset sm:block sm:p-4" key={title}>
                <div className={`grid size-9 shrink-0 place-items-center rounded-lg sm:size-10 ${tone}`}>
                  <Icon size={19} />
                </div>
                <div>
                  <h4 className="font-black sm:mt-4">{title}</h4>
                  <p className="mt-1 text-sm leading-6 text-slate-600">{copy}</p>
                </div>
              </div>
            ))}
          </div>
        </section>

        <aside className="grid content-start gap-4">
          <div className="rounded-xl bg-butter p-4 shadow-inset">
            <div className="flex items-center gap-2">
              <BookMarked size={18} className="text-brass" />
              <h3 className="font-black">{t("dailyProgress", "Daily progress")}</h3>
            </div>
            <p className="mt-3 text-3xl font-black tracking-[-0.01em]">
              {Math.min(dueCount, DAILY_QUIZ_LIMIT)}/{DAILY_QUIZ_LIMIT}
            </p>
            <p className="mt-1 text-sm font-semibold leading-6 text-slate-700">
              {t("wordsReady", "{count} words ready", { count: dueCount })}
            </p>
          </div>
        </aside>
      </div>

      <div className="mt-4 grid gap-3 sm:mt-5 sm:gap-4 lg:grid-cols-3">
        <button
          className="focus-ring app-card flex gap-3 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lift sm:block sm:p-5"
          onClick={() => openNewItem("vocabulary")}
          type="button"
        >
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-frenchBlue text-white">
            <Plus size={20} />
          </div>
          <div>
            <h3 className="text-lg font-black sm:mt-4 sm:text-xl">
              {t("addNewNote", "Add a new note")}
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-600 sm:mt-2">
              {t(
                "addNewNoteCopy",
                "Capture a vocabulary word, phrase, grammar note, or pronunciation rule before you forget it."
              )}
            </p>
          </div>
        </button>

        <button
          className="focus-ring app-card flex gap-3 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lift disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:block sm:p-5"
          disabled={studyCount === 0}
          onClick={onStartStudy}
          type="button"
        >
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-sage text-white">
            <ListChecks size={20} />
          </div>
          <div>
            <h3 className="text-lg font-black sm:mt-4 sm:text-xl">
              {t("studyCards", "Study flashcards")}
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-600 sm:mt-2">
              {t(
                "studyCardsCopy",
                "Flip through notes that have not reached strong confidence yet. Study mode does not change confidence."
              )}
            </p>
            <p className="mt-2 text-sm font-black text-frenchBlue sm:mt-3">
              {studyCount > 0
                ? t(
                    studyCount === 1 ? "cardReady" : "cardsReady",
                    `${studyCount} card${studyCount === 1 ? "" : "s"} ready`,
                    { count: studyCount }
                  )
                : t("noCardsNeedStudy", "No cards need study")}
            </p>
          </div>
        </button>

        <button
          className="focus-ring app-card flex gap-3 p-4 text-left transition hover:-translate-y-0.5 hover:shadow-lift disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0 sm:block sm:p-5"
          disabled={dueCount === 0}
          onClick={onStartQuiz}
          type="button"
        >
          <div className="grid size-10 shrink-0 place-items-center rounded-lg bg-frenchRed text-white">
            <CircleHelp size={20} />
          </div>
          <div>
            <h3 className="text-lg font-black sm:mt-4 sm:text-xl">
              {t("startQuiz", "Start today's quiz")}
            </h3>
            <p className="mt-1 text-sm leading-6 text-slate-600 sm:mt-2">
              {t(
                "startQuizCopy",
                "Test up to {count} vocabulary words. Correct answers advance confidence, and mastered words are skipped.",
                { count: DAILY_QUIZ_LIMIT }
              )}
            </p>
            <p className="mt-2 text-sm font-black text-frenchBlue sm:mt-3">
              {dueCount > 0
                ? t(
                    dueCount === 1 ? "wordReady" : "wordsReady",
                    `${dueCount} word${dueCount === 1 ? "" : "s"} ready`,
                    { count: dueCount }
                  )
                : t("noVocabularyDue", "No vocabulary is due today")}
            </p>
          </div>
        </button>
      </div>
    </div>
  );
}
