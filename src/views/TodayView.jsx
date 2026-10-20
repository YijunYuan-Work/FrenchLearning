import { ArrowRight, Check, CircleCheck } from "lucide-react";
import { useMemo } from "react";
import { DAILY_QUIZ_LIMIT, getEligibleVocabulary, MAX_CONFIDENCE } from "../utils/quiz";
import { useLanguage } from "../i18n/LanguageContext";
import { getDisplayName } from "../utils/accountIdentity";

export function TodayView({
  dailyProgress,
  dailyProgressReady = true,
  items,
  learningSettings,
  learningDataReady = true,
  learningLoadFailed = false,
  learningDay,
  onStartQuiz,
  onStartStudy,
  openNewItem,
  user,
}) {
  const { language, t } = useLanguage();
  const quizLimit = learningSettings?.quizVocabularyLimit ?? DAILY_QUIZ_LIMIT;
  const eligibleItems = useMemo(() => getEligibleVocabulary(items), [items]);
  const dueCount = Math.min(eligibleItems.length, quizLimit);
  const studyCount = useMemo(() => items.filter((item) =>
    ["vocabulary", "grammar", "phrases"].includes(item.category) && Number(item.confidence) < MAX_CONFIDENCE
  ).length, [items]);
  const planTasks = [
    {
      key: "addNote", numeral: "I.",
      title: t("dailyTaskAddNote", "Add a note"),
      copy: t("dailyStepCapture", "Capture one useful word or phrase."),
      isDone: dailyProgressReady && Boolean(dailyProgress?.addNote),
      isReady: true,
      onClick: () => openNewItem("vocabulary"),
      readyLabel: t("dailyPlanReady", "Ready"),
    },
    {
      key: "study", numeral: "II.",
      title: t("dailyTaskStudy", "Complete daily study"),
      copy: t("dailyStepStudy", "Review cards that still feel new."),
      isDone: dailyProgressReady && Boolean(dailyProgress?.study),
      isReady: learningDataReady && studyCount > 0,
      onClick: onStartStudy,
      readyLabel: t(studyCount === 1 ? "cardReady" : "cardsReady", `${studyCount} card${studyCount === 1 ? "" : "s"} ready`, { count: studyCount }),
      reason: t("noCardsNeedStudy", "No cards need study"),
    },
    {
      key: "quiz", numeral: "III.",
      title: t("dailyTaskQuiz", "Complete daily quiz"),
      copy: t("dailyStepQuiz", "Check recall and advance confidence."),
      isDone: dailyProgressReady && Boolean(dailyProgress?.quiz),
      isReady: learningDataReady && dueCount > 0,
      onClick: onStartQuiz,
      readyLabel: t(dueCount === 1 ? "wordReady" : "wordsReady", `${dueCount} word${dueCount === 1 ? "" : "s"} ready`, { count: dueCount }),
      reason: t("noVocabularyDue", "No vocabulary is due today"),
    },
  ];
  const completedTasks = planTasks.filter((task) => task.isDone).length;
  const nextTask = planTasks.find((task) => task.isReady && !task.isDone)?.key;
  const waitingLabel = learningLoadFailed
    ? t("todayDataUnavailable", "Data unavailable — retry above")
    : t("todayDataLoading", "Loading your notes and settings...");
  const shortDate = new Date(`${learningDay}T12:00:00`).toLocaleDateString(language === "zh" ? "zh-CN" : "fr-FR", { day: "numeric", month: "short" });

  return (
    <div className="today-page">
      <div className="today-intro">
        <div className="today-heading">
          <h2 className="today-greeting" lang="fr">{t("todayGreeting", "Bonjour, {username}.", { username: getDisplayName(user) })}<span className="today-mobile-date"> · <time dateTime={learningDay} lang={language === "zh" ? "zh-CN" : "fr"}>{shortDate}</time></span></h2>
          <p className="today-plan-label"><CircleCheck size={15} aria-hidden="true" />{t("dailyPlanLabel", "Daily plan")}</p>
          <h3 className="today-title editorial-title">{language === "en" ? <>Finish today&apos;s <em>French</em> plan</> : t("todayPlanTitle", "Finish today's French plan")}</h3>
          <p className="today-copy">{t("dailyPlanCopy", "Three small tasks keep practice clear: capture one note, study your cards, then complete the quiz.")}</p>
        </div>
        <div
          className={`today-progress${completedTasks === 3 ? " is-complete" : ""}`}
          role="status"
          aria-live="polite"
          aria-label={dailyProgressReady ? t("todayProgressCount", "{count} of 3 tasks done", { count: completedTasks }) : t("dailyProgressPending", "Progress not loaded")}
        >
          <div className="today-counter" aria-hidden="true">
            {dailyProgressReady ? (
              <span className="today-counter-window"><span className="today-counter-stack" style={{ transform: `translateY(-${completedTasks * 25}%)` }}>{[0, 1, 2, 3].map((digit) => <span key={digit}>{digit}</span>)}</span></span>
            ) : <span className="today-counter-pending">–</span>}
            <span className="today-counter-total">/ 3</span>
          </div>
          <div className="today-segments" aria-hidden="true">{planTasks.map((task) => <span key={task.key}><span style={{ transform: task.isDone ? "scaleX(1)" : "scaleX(0)" }} /></span>)}</div>
          <span className="today-progress-label">{dailyProgressReady ? t("dailyPlanDoneShort", "tasks done") : t("dailyProgressPending", "Progress not loaded")}</span>
        </div>
      </div>

      <section className="today-tasks" aria-label={t("dailyPlanLabel", "Daily plan")}>
        {planTasks.map((task) => {
          const isWaiting = task.key !== "addNote" && !learningDataReady;
          const label = task.isDone ? t("dailyPlanDone", "Done") : isWaiting ? waitingLabel : task.isReady ? task.readyLabel : t("dailyPlanNotReady", "Not ready");
          return (
            <button
              className={`today-task today-task--${task.key}${task.isDone ? " is-done" : ""}${task.key === nextTask ? " is-next" : ""}`}
              disabled={isWaiting || (!task.isReady && !task.isDone)}
              key={task.key}
              onClick={task.onClick}
              type="button"
            >
              <span className="today-task-mark" aria-hidden="true"><span className="today-task-numeral">{task.numeral}</span><span className="today-task-seal"><Check size={20} /></span></span>
              <span className="today-task-content">
                <span className="today-task-title">{task.title}</span>
                <span className="today-task-copy">{task.copy}</span>
                {!task.isDone && !task.isReady && !isWaiting && <span className="today-task-reason">{task.reason}</span>}
              </span>
              <span className="today-task-status">{label}{task.isDone && language === "en" && <span className="today-done-gloss" aria-hidden="true" lang="fr"> · Fait</span>}</span>
              <ArrowRight size={18} className="today-task-arrow" aria-hidden="true" />
            </button>
          );
        })}
      </section>

      {dailyProgressReady && completedTasks === 3 && <div className="today-celebration"><p lang="fr">Tout est fait.</p><span>{t("todayAllDone", "All three tasks are done for today. À demain.")}</span></div>}
      {learningDataReady && items.length === 0 && <p className="today-empty"><span lang="fr" aria-hidden="true">N.B.</span><span>{t("todayEmptyNotebook", "Your notebook is still empty. Start with I — every study card and quiz word grows from the notes you write.")}</span></p>}
    </div>
  );
}
