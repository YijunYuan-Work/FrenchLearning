import { ArrowRight, Check, CheckCircle2, ChevronLeft, CloudOff, Eye, Feather, Plus, RotateCcw, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { genderOptions } from "../data/wordFields";
import { useLanguage } from "../i18n/LanguageContext";
import { isCompletedQuizAnswer } from "../utils/quiz";

function GenderChoices({ value, onChange, disabled, t }) {
  const name = useId();
  return <fieldset className="quiz-gender" disabled={disabled}>
    <legend>{t("genderAnswer", "Gender")}</legend>
    <div className="quiz-gender-options" role="radiogroup" aria-label={t("genderAnswer", "Gender")}>
      {genderOptions.filter((option) => option.value).map((option, index) => {
        const label = t(option.labelKey, option.label);
        return <label key={option.value} className={value === option.value ? "is-selected" : ""}>
          <input type="radio" name={name} value={option.value} checked={value === option.value} onChange={() => onChange(option.value)} aria-label={label} />
          <em aria-hidden="true" lang="fr">{["le", "la", "le/la"][index]}</em>
          <span aria-hidden="true">{index === 2 ? t("quizEitherGender", "Masc. or fem.") : label}</span>
        </label>;
      })}
    </div>
  </fieldset>;
}

function QuizFeedback({ item, result, t }) {
  const Icon = result.correct ? Check : result.revealedAnswer ? Eye : X;
  return <div className={`quiz-feedback${result.correct ? " is-correct" : result.revealedAnswer ? " is-revealed" : " is-incorrect"}`} role="status" aria-live="polite">
    <div className="quiz-verdict"><span aria-hidden="true"><Icon size={16} /></span><h3>{result.correct ? t("correct", "Correct") : result.revealedAnswer ? t("quizAnswerRevealed", "Answer revealed") : t("notQuite", "Not quite")}</h3></div>
    <dl className="quiz-result-details">
      <dt>{t("meaning", "Meaning")}</dt><dd><strong>{item.english}</strong></dd>
      <dd className={result.correct || result.meaningCorrect ? "is-correct" : "is-incorrect"}>{!result.revealedAnswer && (result.correct || result.meaningCorrect ? t("correct", "Correct") : t("notQuite", "Not quite"))}</dd>
      {item.partOfSpeech === "noun" && item.gender && <><dt>{t("gender", "Gender")}</dt><dd><strong>{t(genderOptions.find((option) => option.value === item.gender)?.labelKey, item.gender)}</strong></dd><dd className={result.correct || result.genderCorrect ? "is-correct" : "is-incorrect"}>{!result.revealedAnswer && (result.correct || result.genderCorrect ? t("correct", "Correct") : t("notQuite", "Not quite"))}</dd></>}
    </dl>
    {result.correct && <div className="quiz-confidence">
      <span className="quiz-confidence-meter" aria-hidden="true">{[1, 2, 3, 4].map((step) => <span key={step}><i className={`${step <= result.confidence ? "is-filled" : ""}${step === result.confidence ? " is-new" : ""}`} /></span>)}</span>
      <p>{t("confidenceAdvanced", "Confidence advanced to {value}.", { value: result.confidence })}</p>
    </div>}
    {result.revealedAnswer && <p className="quiz-revealed-copy">{t("answerRevealedNoConfidence", "Answer revealed. Confidence was not changed.")}</p>}
  </div>;
}

export function QuizExperience({
  answer, genderAnswer, setAnswer, setGenderAnswer, currentItem, currentItemNeedsGender,
  quizState, quizLimit, answeredCount, correctCount, remainingCount, eligibleCount, quizItemCount,
  unseenCount, isQuizComplete, isSavingAnswer, answerSaveError, pendingAnswer, lastResult,
  onSubmit, onContinue, onReveal, onMarkCorrect, onRetry, onStartNew, onExit, openNewItem,
}) {
  const { t } = useLanguage();
  const answerId = useId();
  const rootRef = useRef(null);
  const inputRef = useRef(null);
  const nextRef = useRef(null);
  const retryRef = useRef(null);
  const headingRef = useRef(null);
  const movingRef = useRef(null);
  const questionRef = useRef(currentItem?.id);
  const [isMoving, setIsMoving] = useState(false);
  const questionId = currentItem?.id;
  const saveBlocked = Boolean(isSavingAnswer || pendingAnswer || answerSaveError);
  const locked = Boolean(lastResult || saveBlocked || isMoving);
  // A local complete snapshot can still be waiting for its final durable acknowledgement.
  const unconfirmed = saveBlocked && isCompletedQuizAnswer(quizState.answered[currentItem?.id]);
  const visibleAnswered = answeredCount - (unconfirmed ? 1 : 0);
  const visibleCorrect = correctCount - (unconfirmed && quizState.answered[currentItem?.id].correct ? 1 : 0);
  const visibleRemaining = remainingCount + (unconfirmed ? 1 : 0);
  const total = quizState.queueIds.length;
  const questionNumber = Math.max(0, quizState.queueIds.indexOf(currentItem?.id)) + 1;
  const noVocabulary = eligibleCount === 0 && quizItemCount === 0;
  const queueKey = `${quizState.date}:${quizState.queueIds.join("|")}`;

  useEffect(() => {
    const root = rootRef.current;
    const viewport = window.visualViewport;
    const update = () => {
      // Pin to the visible viewport at normal zoom, not to a fabricated keyboard height.
      if (viewport && viewport.scale === 1) {
        root.style.setProperty("--quiz-visible-height", `${viewport.height}px`);
        root.style.setProperty("--quiz-offset-top", `${viewport.offsetTop}px`);
        root.dataset.keyboard = String(window.innerHeight - viewport.height > 100);
      } else {
        root.style.removeProperty("--quiz-visible-height");
        root.style.removeProperty("--quiz-offset-top");
        root.dataset.keyboard = "false";
      }
    };
    update();
    viewport?.addEventListener("resize", update);
    viewport?.addEventListener("scroll", update);
    window.addEventListener("resize", update);
    return () => {
      viewport?.removeEventListener("resize", update);
      viewport?.removeEventListener("scroll", update);
      window.removeEventListener("resize", update);
      clearTimeout(movingRef.current);
    };
  }, []);

  useEffect(() => {
    if (questionRef.current !== questionId) {
      clearTimeout(movingRef.current);
      movingRef.current = null;
      questionRef.current = questionId;
      setIsMoving(false);
    }
    if (document.querySelector('[aria-modal="true"], dialog[open]') || isSavingAnswer) return;
    if (saveBlocked) retryRef.current?.focus({ preventScroll: true });
    else if (lastResult) nextRef.current?.focus({ preventScroll: true });
    else if (isQuizComplete) headingRef.current?.focus({ preventScroll: true });
    else if (questionId && !movingRef.current) inputRef.current?.focus({ preventScroll: true });
  }, [questionId, lastResult, saveBlocked, isSavingAnswer, isQuizComplete, queueKey]);

  function continueWithMotion() {
    if (movingRef.current || saveBlocked || !lastResult) return;
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) { onContinue(); return; }
    const question = currentItem.id;
    setIsMoving(true);
    movingRef.current = setTimeout(() => {
      movingRef.current = null;
      setIsMoving(false);
      if (questionRef.current === question) onContinue();
    }, 180);
  }

  function progressSegments() {
    return <div className="quiz-segments" aria-hidden="true">{quizState.queueIds.map((id) => {
      const result = quizState.answered[id];
      const pending = result?.status === "pending" || (id === currentItem?.id && saveBlocked);
      const state = pending ? "is-pending" : isCompletedQuizAnswer(result) ? result.correct ? "is-correct" : "is-incorrect" : id === currentItem?.id ? "is-current" : "";
      return <span key={id} className={state} />;
    })}</div>;
  }

  return <section className={`quiz-page${lastResult ? " has-result" : ""}${isQuizComplete ? " is-complete" : ""}`} ref={rootRef} aria-label={t("quizSession", "Quiz session")}>
    <header className="quiz-heading">
      <button className="icon-action quiz-back" aria-label={t("backToToday", "Back to Today")} onClick={onExit} type="button"><ChevronLeft size={22} /></button>
      <div className="quiz-intro">
        <p className="quiz-mode">{t("vocabularyQuiz", "Vocabulary quiz")}</p>
        <h2 className="editorial-title">{t("quizWriteBefore", "Write the ")}<em>{t("quizMeaningLanguage", "English")}</em>{t("quizWriteAfter", " meaning.")}</h2>
      </div>
      <div className="quiz-position" aria-live="polite" aria-atomic="true" aria-label={t("quizAnsweredProgress", "{count} of {total} answered", { count: visibleAnswered, total })}>
        <span className="quiz-count"><strong>{visibleAnswered}</strong><em>/{total}</em></span><span>{t("todaysQuiz", "Today's quiz")}</span>
      </div>
    </header>
    <div className="quiz-ledger">
      {progressSegments()}
      <dl className="quiz-stats" aria-live="polite" aria-atomic="true">
        {[["correct", "Correct", visibleCorrect], ["notQuite", "Not quite", visibleAnswered - visibleCorrect], ["remaining", "Remaining", visibleRemaining], ["dailyGoal", "Daily goal", quizLimit]].map(([key, label, count]) => <div key={key}><dt>{t(key, label)}</dt><dd>{count}</dd></div>)}
      </dl>
    </div>

    {isQuizComplete ? <div className="quiz-complete quiz-end" role="status">
      <div className="quiz-complete-intro"><p className="eyebrow">{t("quizResult", "Quiz result")} <span lang="fr" aria-hidden="true">· résultat</span></p>
        <h2 className="editorial-title" tabIndex={-1} ref={headingRef}>{t("quizCompleteLead", "Today's quiz is ")}<em>{t("quizCompleteEnd", "complete.")}</em></h2>
        <p>{t("quizCompleteCopy", "You tested {count} words.", { count: answeredCount })}</p>
        {correctCount === answeredCount && answeredCount > 0 && <p className="quiz-perfect" lang="fr">Sans faute.</p>}
      </div>
      <dl className="quiz-score-ledger">{[["correct", "Correct", correctCount], ["notQuite", "Not quite", answeredCount - correctCount], ["remaining", "Remaining", unseenCount]].map(([key, label, count]) => <div key={key}><dt>{t(key, label)}</dt><dd>{count}</dd></div>)}</dl>
      <div className="quiz-restart"><button className="primary-action" disabled={unseenCount === 0} onClick={onStartNew} type="button"><RotateCcw size={17} />{t("startNewQuiz", "Start a new quiz")}</button>{unseenCount === 0 && <p>{t("quizNoWordsRemain", "No unseen words remain today.")}</p>}</div>
    </div> : !currentItem ? <div className="quiz-empty quiz-end">
      <p className="quiz-empty-mark" aria-hidden="true">« … »</p>
      <h2 className="editorial-title">{noVocabulary ? t("noVocabularyDueTitle", "No vocabulary is due today.") : unseenCount > 0 ? t("quizReadyTitle", "Ready for another quiz?") : t("quizNoUnseenTitle", "All available quiz words have appeared.")}</h2>
      <p>{noVocabulary ? t("noVocabularyDueCopy", "Add vocabulary or lower-confidence words to build a daily quiz.") : unseenCount > 0 ? t("quizReadyCopy", "Start a new quiz to pull the next available vocabulary set.") : t("quizNoUnseenCopy", "Add more vocabulary or come back after confidence levels change.")}</p>
      {noVocabulary ? <button className="primary-action" onClick={() => openNewItem("vocabulary")} type="button"><Plus size={17} />{t("addVocabulary", "Add vocabulary")}</button> : <button className="primary-action" disabled={unseenCount === 0} onClick={onStartNew} type="button"><RotateCcw size={17} />{t("startNewQuiz", "Start a new quiz")}</button>}
    </div> : <form className={`quiz-spread${isMoving ? " is-leaving" : ""}`} onSubmit={onSubmit} key={currentItem.id}>
      <div className="quiz-prompt">
        <div className="quiz-prompt-meta"><span aria-hidden="true">nº {String(questionNumber).padStart(2, "0")}</span><span className="quiz-french-label">{t("french", "French")}</span><span className="quiz-mobile-instruction">{t("writeEnglishMeaning", "Write the English meaning.")}</span></div>
        <div className="quiz-word-block"><p className={`quiz-word${currentItem.french.length > 14 ? " is-long" : ""}`} lang="fr" data-testid="quiz-word">{currentItem.french}</p>{currentItem.ipa && <p className="quiz-ipa" lang="fr">{currentItem.ipa}</p>}</div>
      </div>
      <div className="quiz-answer-page">
        <div className="quiz-writing">
          <label className="quiz-answer-label" htmlFor={answerId}>{t("yourAnswer", "Your answer")}</label>
          <div className={`quiz-writing-line${isSavingAnswer ? " is-saving" : ""}${lastResult ? lastResult.correct ? " is-correct" : lastResult.revealedAnswer ? " is-revealed" : " is-incorrect" : ""}`}>
            <input id={answerId} ref={inputRef} autoComplete="off" autoCapitalize="off" spellCheck={false} enterKeyHint="done" value={answer} onChange={(event) => setAnswer(event.target.value)} disabled={locked} placeholder={t("typeEnglishMeaning", "Type the English meaning")} />
            {isSavingAnswer && <span className="quiz-saving-ink" aria-hidden="true" />}
          </div>
          {currentItemNeedsGender && <GenderChoices value={genderAnswer} onChange={setGenderAnswer} disabled={locked} t={t} />}
          {isSavingAnswer ? <p className="quiz-saving" role="status"><Feather size={17} aria-hidden="true" />{t("quizAnswerSaving", "Saving your answer...")}</p> : (pendingAnswer || answerSaveError) ? <div className="quiz-save-error" role="alert"><CloudOff size={18} aria-hidden="true" /><p>{t("quizAnswerSaveFailed", "Your answer is not fully saved. Retry to finish without increasing confidence twice.")}</p></div> : lastResult && <QuizFeedback item={currentItem} result={lastResult} t={t} />}
        </div>
        <div className="quiz-actions">
          {isSavingAnswer ? <button className="primary-action" disabled type="button">{t("quizSavingAction", "Saving")}</button> : (pendingAnswer || answerSaveError) ? <button className="primary-action" ref={retryRef} onClick={onRetry} type="button"><RotateCcw size={16} />{t("retryQuizAnswer", "Retry saving answer")}</button> : lastResult ? <>
            {!lastResult.correct && !lastResult.revealedAnswer && <button className="secondary-action" disabled={isMoving} onClick={onMarkCorrect} type="button"><CheckCircle2 size={15} />{t("markCorrect", "Mark as correct")}</button>}
            <button className="primary-action" ref={nextRef} disabled={isMoving} onClick={continueWithMotion} type="button">{t("nextWord", "Next word")}<ArrowRight size={16} /></button>
          </> : <>
            <button className="quiz-reveal" disabled={isMoving} onClick={onReveal} type="button">{t("showCorrectAnswer", "Show correct answer")}</button>
            <button className="primary-action" disabled={isMoving || !answer.trim() || (currentItemNeedsGender && !genderAnswer.trim())} type="submit">{t("checkAnswer", "Check answer")}</button>
          </>}
        </div>
      </div>
    </form>}
  </section>;
}
