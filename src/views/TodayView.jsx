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
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
        <Metric label={t("vocabularyDue", "Vocabulary due")} value={dueCount} tone="blue" />
        <Metric label={t("dailyGoal", "Daily goal")} value={DAILY_QUIZ_LIMIT} />
        <Metric label={t("savedNotes", "Saved notes")} value={items.length} />
        <Metric label={t("mastered", "Mastered")} value={masteredCount} tone="green" />
      </div>

      <div className="mt-5 grid gap-5 xl:grid-cols-[minmax(0,1fr)_320px]">
        <section className="app-card overflow-hidden">
          <div className="border-b border-line bg-sky/45 p-5">
            <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="inline-flex items-center gap-2 text-sm font-black text-frenchBlue">
                  <Clock3 size={16} />
                  {t("twelveMinutePractice", "12-minute practice")}
                </p>
                <h3 className="mt-2 text-2xl font-black tracking-[-0.01em]">
                  {t("todayPracticePath", "Your French path for today")}
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-slate-700">
                  {t(
                    "todayPracticePathCopy",
                    "A short loop keeps practice light: capture something useful, review what is fading, then quiz what is ready."
                  )}
                </p>
              </div>
              <div className="grid size-16 shrink-0 place-items-center rounded-xl bg-white text-frenchBlue shadow-soft">
                <Route size={28} />
              </div>
            </div>
          </div>

          <div className="grid gap-3 p-4 md:grid-cols-3">
            {practiceSteps.map(({ Icon, copy, title, tone }) => (
              <div className="rounded-xl bg-white p-4 shadow-inset" key={title}>
                <div className={`grid size-10 place-items-center rounded-lg ${tone}`}>
                  <Icon size={19} />
                </div>
                <h4 className="mt-4 font-black">{title}</h4>
                <p className="mt-1 text-sm leading-6 text-slate-600">{copy}</p>
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

      <div className="mt-5 grid gap-4 lg:grid-cols-3">
        <button
          className="focus-ring app-card p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lift"
          onClick={() => openNewItem("vocabulary")}
          type="button"
        >
          <div className="grid size-10 place-items-center rounded-lg bg-frenchBlue text-white">
            <Plus size={20} />
          </div>
          <h3 className="mt-4 text-xl font-black">
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
          className="focus-ring app-card p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lift disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          disabled={studyCount === 0}
          onClick={onStartStudy}
          type="button"
        >
          <div className="grid size-10 place-items-center rounded-lg bg-sage text-white">
            <ListChecks size={20} />
          </div>
          <h3 className="mt-4 text-xl font-black">
            {t("studyCards", "Study flashcards")}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t(
              "studyCardsCopy",
              "Flip through notes that have not reached strong confidence yet. Study mode does not change confidence."
            )}
          </p>
          <p className="mt-3 text-sm font-black text-frenchBlue">
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
          className="focus-ring app-card p-5 text-left transition hover:-translate-y-0.5 hover:shadow-lift disabled:cursor-not-allowed disabled:opacity-60 disabled:hover:translate-y-0"
          disabled={dueCount === 0}
          onClick={onStartQuiz}
          type="button"
        >
          <div className="grid size-10 place-items-center rounded-lg bg-frenchRed text-white">
            <CircleHelp size={20} />
          </div>
          <h3 className="mt-4 text-xl font-black">
            {t("startQuiz", "Start today's quiz")}
          </h3>
          <p className="mt-2 text-sm leading-6 text-slate-600">
            {t(
              "startQuizCopy",
              "Test up to {count} vocabulary words. Correct answers advance confidence, and mastered words are skipped.",
              { count: DAILY_QUIZ_LIMIT }
            )}
          </p>
          <p className="mt-3 text-sm font-black text-frenchBlue">
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
