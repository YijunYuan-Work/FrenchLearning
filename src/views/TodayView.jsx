import {
  ArrowRight,
  BookMarked,
  CheckCircle2,
  CircleHelp,
  ListChecks,
  Plus,
} from "lucide-react";
import { useMemo } from "react";
import { Metric } from "../components/Metric";
import {
  DAILY_QUIZ_LIMIT,
  getEligibleVocabulary,
  MAX_CONFIDENCE,
} from "../utils/quiz";
import { useLanguage } from "../i18n/LanguageContext";

export function TodayView({
  dailyProgress,
  items,
  learningSettings,
  onStartQuiz,
  onStartStudy,
  openNewItem,
}) {
  const { t } = useLanguage();
  const quizLimit = learningSettings?.quizVocabularyLimit ?? DAILY_QUIZ_LIMIT;
  const eligibleItems = useMemo(() => getEligibleVocabulary(items), [items]);
  const dueCount = Math.min(eligibleItems.length, quizLimit);
  const studyCount = useMemo(
    () =>
      items.filter(
        (item) =>
          ["vocabulary", "grammar", "phrases"].includes(item.category) &&
          Number(item.confidence) < MAX_CONFIDENCE
      ).length,
    [items]
  );
  const masteredCount = items.filter(
    (item) => item.category === "vocabulary" && Number(item.confidence) >= 4
  ).length;
  const planTasks = [
    {
      key: "addNote",
      title: t("dailyTaskAddNote", "Add a note"),
      copy: t("dailyStepCapture", "Capture one useful word or phrase."),
      isDone: Boolean(dailyProgress?.addNote),
      isReady: true,
      Icon: Plus,
      onClick: () => openNewItem("vocabulary"),
      readyLabel: t("dailyPlanReady", "Ready"),
      tone: "bg-sky text-frenchBlue",
    },
    {
      key: "study",
      title: t("dailyTaskStudy", "Complete daily study"),
      copy: t("dailyStepStudy", "Review cards that still feel new."),
      isDone: Boolean(dailyProgress?.study),
      isReady: studyCount > 0,
      Icon: ListChecks,
      onClick: onStartStudy,
      readyLabel:
        studyCount > 0
          ? t(
              studyCount === 1 ? "cardReady" : "cardsReady",
              `${studyCount} card${studyCount === 1 ? "" : "s"} ready`,
              { count: studyCount }
            )
          : t("noCardsNeedStudy", "No cards need study"),
      tone: "bg-mint text-sage",
    },
    {
      key: "quiz",
      title: t("dailyTaskQuiz", "Complete daily quiz"),
      copy: t("dailyStepQuiz", "Check recall and advance confidence."),
      isDone: Boolean(dailyProgress?.quiz),
      isReady: dueCount > 0,
      Icon: CircleHelp,
      onClick: onStartQuiz,
      readyLabel:
        dueCount > 0
          ? t(
              dueCount === 1 ? "wordReady" : "wordsReady",
              `${dueCount} word${dueCount === 1 ? "" : "s"} ready`,
              { count: dueCount }
            )
          : t("noVocabularyDue", "No vocabulary is due today"),
      tone: "bg-blush text-frenchRed",
    },
  ];
  const completedTasks = planTasks.filter((task) => task.isDone).length;

  return (
    <div className="min-w-0">
      <div className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_340px] xl:gap-5">
        <section className="app-card overflow-hidden">
          <div className="mesh-panel border-b border-line p-4 sm:p-6">
            <div className="flex gap-3 sm:flex-col sm:gap-4 md:flex-row md:items-center md:justify-between">
              <div>
                <p className="inline-flex items-center gap-2 text-sm font-medium text-frenchBlue">
                  <CheckCircle2 size={16} />
                  {t("dailyPlanLabel", "Daily plan")}
                </p>
                <h3 className="mt-2 text-2xl font-light leading-tight tracking-[-0.02em] sm:text-3xl">
                  {t("todayPlanTitle", "Finish today's French plan")}
                </h3>
                <p className="mt-2 max-w-2xl text-sm leading-6 text-inkSecondary">
                  {t(
                    "dailyPlanCopy",
                    "Three small tasks keep practice clear: capture one note, study your cards, then complete the quiz."
                  )}
                </p>
              </div>
              <div className="hidden min-w-28 rounded-xl bg-white p-4 text-center shadow-lift sm:block">
                <p className="numeric text-3xl font-medium text-frenchBlue">
                  {completedTasks}/3
                </p>
                <p className="mt-1 text-xs font-medium text-inkMute">
                  {t("dailyPlanDoneShort", "tasks done")}
                </p>
              </div>
            </div>
          </div>

          <div className="grid gap-2 p-3 sm:gap-3 sm:p-4">
            {planTasks.map(({ Icon, copy, isDone, isReady, onClick, readyLabel, title, tone }) => (
              <button
                className="focus-ring flex min-h-[88px] cursor-pointer items-center gap-3 rounded-xl border border-line bg-white p-3 text-left shadow-inset transition hover:border-frenchBlue/35 hover:shadow-soft disabled:cursor-not-allowed disabled:opacity-60 sm:p-4"
                disabled={!isReady && !isDone}
                key={title}
                onClick={onClick}
                type="button"
              >
                <div className={`grid size-10 shrink-0 place-items-center rounded-md ${isDone ? "bg-mint text-sage" : tone}`}>
                  <Icon size={19} />
                </div>
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <h4 className="font-medium">{title}</h4>
                    <span
                      className={`rounded-full px-2 py-1 text-xs font-medium ${
                        isDone
                          ? "bg-mint text-sage"
                          : isReady
                            ? "bg-sky text-frenchBlue"
                            : "bg-slate-100 text-inkMute"
                      }`}
                    >
                      {isDone
                        ? t("dailyPlanDone", "Done")
                        : isReady
                          ? readyLabel
                          : t("dailyPlanNotReady", "Not ready")}
                    </span>
                  </div>
                  <p className="mt-1 text-sm leading-6 text-inkSecondary">{copy}</p>
                </div>
                <ArrowRight size={18} className="shrink-0 text-inkMute" />
              </button>
            ))}
          </div>
        </section>

        <aside className="grid content-start gap-3 sm:grid-cols-2 xl:grid-cols-1">
          <div className="rounded-xl bg-butter p-4 shadow-inset">
            <div className="flex items-center gap-2">
              <BookMarked size={18} className="text-brass" />
              <h3 className="font-medium">{t("todaysQuiz", "Today's quiz")}</h3>
            </div>
            <p className="numeric mt-3 text-3xl font-medium tracking-[-0.03em]">
              {dueCount}/{quizLimit}
            </p>
            <p className="mt-1 text-sm font-normal leading-6 text-inkSecondary">
              {t("wordsReady", "{count} words ready", { count: dueCount })}
            </p>
          </div>

          <div className="grid grid-cols-2 gap-2 sm:col-span-1 xl:col-span-1">
            <Metric label={t("vocabularyDue", "Vocabulary due")} value={dueCount} tone="blue" />
            <Metric label={t("dailyGoal", "Daily goal")} value={quizLimit} />
            <Metric label={t("savedNotes", "Saved notes")} value={items.length} />
            <Metric label={t("mastered", "Mastered")} value={masteredCount} tone="green" />
          </div>
        </aside>
      </div>
    </div>
  );
}
