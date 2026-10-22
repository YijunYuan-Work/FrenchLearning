import { useEffect, useMemo, useRef, useState } from "react";
import { QuizExperience } from "../components/QuizExperience";
import {
  DAILY_QUIZ_LIMIT,
  createDailyQuizState,
  getEligibleVocabulary,
  getTodayKey,
  isGenderCorrect,
  isMeaningCorrect,
  isCompletedQuizAnswer,
  isQuizVocabularyNote,
  reconcileQuizState,
  MAX_CONFIDENCE,
} from "../utils/quiz";

export function QuizView({
  items,
  learningDay = getTodayKey(),
  isCurrentAccount,
  onQuizAnswer,
  onPersistQuizState,
  onQuizComplete,
  onQuizStateChange,
  openNewItem,
  onExitQuiz,
  savedQuizState,
  learningSettings,
}) {
  const quizLimit = learningSettings?.quizVocabularyLimit ?? DAILY_QUIZ_LIMIT;
  const [rawQuizState, setRawQuizState] = useState(() =>
    savedQuizState ?? createDailyQuizState(items, learningDay, [], quizLimit)
  );
  const restoredAnswer = Object.values(reconcileQuizState(rawQuizState, items).answered).find((result) => result?.status === "pending");
  const [answer, setAnswer] = useState(restoredAnswer?.answer ?? "");
  const [genderAnswer, setGenderAnswer] = useState(restoredAnswer?.genderAnswer ?? "");
  const [resultState, setLastResult] = useState(null);
  const [attemptState, setAttemptItem] = useState(null);
  const [isSavingAnswer, setIsSavingAnswer] = useState(false);
  const [answerSaveError, setAnswerSaveError] = useState(false);
  const attemptRef = useRef(null);
  const savingRef = useRef(false);
  const mountedRef = useRef(true);
  const itemsRef = useRef(items);
  itemsRef.current = items;
  const quizState = useMemo(() => reconcileQuizState(rawQuizState, items), [rawQuizState, items]);
  const quizStateRef = useRef(quizState);
  quizStateRef.current = quizState;
  const isCurrentQuestion = (id) => quizState.queueIds.includes(id) && isQuizVocabularyNote(items.find((item) => item?.id === id));
  const lastResult = resultState && isCurrentQuestion(resultState.item.id) ? resultState : null;
  const attemptItem = attemptState && isCurrentQuestion(attemptState.id) ? attemptState : null;

  function setQuizState(update) {
    const next = typeof update === "function" ? update(quizStateRef.current) : update;
    const reconciled = reconcileQuizState(next, itemsRef.current);
    quizStateRef.current = reconciled;
    setRawQuizState(reconciled);
  }

  useEffect(() => {
    if ((attemptState && !attemptItem) || (resultState && !lastResult)) {
      attemptRef.current = null;
      savingRef.current = false;
      setAttemptItem(null);
      setLastResult(null);
      setIsSavingAnswer(false);
      setAnswerSaveError(false);
      setAnswer("");
      setGenderAnswer("");
    }
  }, [attemptState, attemptItem, resultState, lastResult]);
  useEffect(() => {
    mountedRef.current = true;
    return () => { mountedRef.current = false; };
  }, []);
  const appliedSavedQuizKeyRef = useRef("");
  const reportedCompletionRef = useRef(false);

  const eligibleItems = useMemo(() => getEligibleVocabulary(items), [items]);

  useEffect(() => {
    setQuizState((current) => {
      const today = learningDay;
      if (current.date !== today) {
        return createDailyQuizState(items, today, [], quizLimit);
      }

      const eligible = getEligibleVocabulary(items);
      const currentSeenIds = Array.from(
        new Set(
          current.seenIds ?? [
            ...current.queueIds,
            ...Object.keys(current.answered ?? {}),
          ]
        )
      );
      if (
        current.queueIds.length === 0 &&
        Object.keys(current.answered).length === 0 &&
        eligible.length > 0 &&
        currentSeenIds.length === 0
      ) {
        return createDailyQuizState(items, today, [], quizLimit);
      }

      if (
        Object.keys(current.answered).length === 0 &&
        current.limit != null &&
        current.limit !== quizLimit &&
        eligible.length > 0
      ) {
        return createDailyQuizState(items, today, [], quizLimit);
      }

      return current;
    });
  }, [items, learningDay, quizLimit]);

  useEffect(() => {
    onQuizStateChange?.(quizState);
  }, [onQuizStateChange, quizState]);

  useEffect(() => {
    if (!savedQuizState) return;

    const savedQuizKey = JSON.stringify(savedQuizState);
    if (appliedSavedQuizKeyRef.current === savedQuizKey) return;

    appliedSavedQuizKeyRef.current = savedQuizKey;
    setQuizState(savedQuizState);
  }, [savedQuizState]);

  const quizItems = useMemo(() => {
    const byId = new Map(items.filter(isQuizVocabularyNote).map((item) => [item.id, item]));
    return quizState.queueIds
      .map((id) => byId.get(id))
      .filter(isQuizVocabularyNote)
      .filter(
        (item) =>
          quizState.answered[item.id] ||
          Number(item.confidence) < MAX_CONFIDENCE
      );
  }, [items, quizState]);
  const seenQuizIds = useMemo(
    () =>
      new Set(
        quizState.seenIds ?? [
          ...quizState.queueIds,
          ...Object.keys(quizState.answered ?? {}),
        ]
      ),
    [quizState]
  );
  const unseenEligibleItems = useMemo(
    () => eligibleItems.filter((item) => !seenQuizIds.has(item.id)),
    [eligibleItems, seenQuizIds]
  );

  const answeredResults = quizState.queueIds
    .map((id) => quizState.answered[id])
    .filter(isCompletedQuizAnswer);
  const answeredCount = answeredResults.length;
  const currentItem =
    attemptItem ??
    lastResult?.item ??
    quizItems.find(
      (item) =>
        quizState.answered[item.id]?.status === "pending" ||
        (!quizState.answered[item.id] && Number(item.confidence) < MAX_CONFIDENCE)
    ) ??
    null;
  const correctCount = answeredResults.filter((result) => result.correct).length;
  const remainingCount = Math.max(quizState.queueIds.length - answeredCount, 0);
  const isQuizComplete =
    quizState.queueIds.length > 0 && answeredCount >= quizState.queueIds.length && !lastResult && !attemptItem && !isSavingAnswer;
  const pendingAnswer = quizState.answered[currentItem?.id]?.status === "pending";
  const currentItemNeedsGender =
    currentItem?.partOfSpeech === "noun" && Boolean(currentItem.gender);
  const quizQueueKey = quizState.queueIds.join("|");
  const previousQuestionRef = useRef(currentItem?.id);
  const currentAnswer = quizState.answered[currentItem?.id];

  useEffect(() => {
    if (previousQuestionRef.current === currentItem?.id) return;
    previousQuestionRef.current = currentItem?.id;
    setAnswer(currentAnswer?.status === "pending" ? currentAnswer.answer ?? "" : "");
    setGenderAnswer(currentAnswer?.status === "pending" ? currentAnswer.genderAnswer ?? "" : "");
  }, [currentItem?.id, currentAnswer]);

  useEffect(() => {
    reportedCompletionRef.current = false;
  }, [quizQueueKey, quizState.date]);

  useEffect(() => {
    if (!isQuizComplete || reportedCompletionRef.current) return;
    reportedCompletionRef.current = true;
    onQuizComplete?.();
  }, [isQuizComplete, onQuizComplete]);

  function submitAnswer(event) {
    event.preventDefault();
    if (!currentItem || !isCurrentQuestion(currentItem.id) || lastResult || savingRef.current || pendingAnswer) return;

    const meaningCorrect = isMeaningCorrect(answer, currentItem.english);
    const needsGender =
      currentItem.partOfSpeech === "noun" && Boolean(currentItem.gender);
    const genderCorrect = needsGender
      ? isGenderCorrect(genderAnswer, currentItem.gender)
      : true;
    const correct = meaningCorrect && genderCorrect;
    if (correct) {
      void saveCorrectAnswer(currentItem, {
        answer, genderAnswer, targetConfidence: Math.min(Number(currentItem.confidence) + 1, MAX_CONFIDENCE),
      });
      return;
    }
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
    if (savingRef.current || answerSaveError || pendingAnswer) return;
    setAnswer("");
    setGenderAnswer("");
    setLastResult(null);
  }

  function showCorrectAnswer() {
    if (!currentItem || !isCurrentQuestion(currentItem.id) || lastResult || savingRef.current || pendingAnswer) return;

    setQuizState((current) => ({
      ...current,
      answered: {
        ...current.answered,
        [currentItem.id]: {
          answer: "",
          correct: false,
          genderAnswer: "",
          revealedAnswer: true,
        },
      },
    }));

    setLastResult({
      answer: "",
      correct: false,
      genderAnswer: "",
      genderCorrect: false,
      item: currentItem,
      meaningCorrect: false,
      needsGender: currentItemNeedsGender,
      revealedAnswer: true,
    });
  }

  function markLastResultCorrect() {
    if (!lastResult || lastResult.correct || savingRef.current) return;
    void saveCorrectAnswer(lastResult.item, {
      answer: lastResult.answer, genderAnswer: lastResult.genderAnswer, manuallyMarkedCorrect: true,
      targetConfidence: Math.min(Number(lastResult.item.confidence) + 1, MAX_CONFIDENCE),
    });
  }

  async function saveCorrectAnswer(item, result) {
    const attempt = { item, result };
    const active = () => mountedRef.current && isCurrentAccount() && learningDay === getTodayKey() && attemptRef.current === attempt;
    const eligible = () => quizStateRef.current.queueIds.includes(item.id) && isQuizVocabularyNote(itemsRef.current.find((note) => note?.id === item.id));
    if (savingRef.current || !mountedRef.current || !isCurrentAccount() || learningDay !== getTodayKey() || !eligible()) return;
    savingRef.current = true;
    attemptRef.current = attempt;
    setAttemptItem(item);
    setLastResult(null);
    setIsSavingAnswer(true);
    setAnswerSaveError(false);
    const pending = { ...result, correct: false, status: "pending" };
    const next = { ...quizStateRef.current, answered: { ...quizStateRef.current.answered, [item.id]: pending } };
    setQuizState(next);
    try {
      // The durable fixed target makes a note commit followed by a lost response
      // or a refresh safe to retry, without calculating another increment.
      await onPersistQuizState(next);
      if (!active() || !eligible()) return;
      const saved = await onQuizAnswer(item.id, result.targetConfidence);
      if (!active() || !eligible()) return;
      const completed = { ...result, correct: true, status: "complete", confidence: saved.confidence };
      const latest = quizStateRef.current;
      const finalState = { ...latest, answered: { ...latest.answered, [item.id]: completed } };
      setQuizState(finalState);
      await onPersistQuizState(finalState);
      if (!active()) return;
      if (eligible()) setLastResult({ ...completed, item });
      setAttemptItem(null);
      attempt.completed = true;
    } catch (error) {
      if (active() && error.code === "QUIZ_ITEM_INELIGIBLE") {
        setQuizState((current) => {
          const answered = { ...current.answered };
          delete answered[item.id];
          return { ...current, queueIds: current.queueIds.filter((id) => id !== item.id), answered };
        });
        setAttemptItem(null);
        setAnswer("");
        setGenderAnswer("");
        attempt.completed = true;
      } else if (active()) setAnswerSaveError(true);
    } finally {
      if (attemptRef.current === attempt) {
        savingRef.current = false;
        if (attempt.completed) attemptRef.current = null;
        if (mountedRef.current) setIsSavingAnswer(false);
      }
    }
  }

  function retryAnswerSave() {
    const attempt = attemptRef.current ?? { item: currentItem, result: quizState.answered[currentItem?.id] };
    if (attempt.item && attempt.result) void saveCorrectAnswer(attempt.item, attempt.result);
  }

  function startNewQuiz() {
    setAnswer("");
    setGenderAnswer("");
    setLastResult(null);
    setQuizState((current) => {
      const today = learningDay;
      const excludedIds =
        current.date === today
          ? current.seenIds ?? [
              ...current.queueIds,
              ...Object.keys(current.answered ?? {}),
            ]
          : [];
      return createDailyQuizState(items, today, excludedIds, quizLimit);
    });
  }

  return (
    <QuizExperience
      answer={answer}
      genderAnswer={genderAnswer}
      setAnswer={setAnswer}
      setGenderAnswer={setGenderAnswer}
      currentItem={currentItem}
      currentItemNeedsGender={currentItemNeedsGender}
      quizState={quizState}
      quizLimit={quizLimit}
      answeredCount={answeredCount}
      correctCount={correctCount}
      remainingCount={remainingCount}
      eligibleCount={eligibleItems.length}
      quizItemCount={quizItems.length}
      unseenCount={unseenEligibleItems.length}
      isQuizComplete={isQuizComplete}
      isSavingAnswer={isSavingAnswer}
      answerSaveError={answerSaveError}
      pendingAnswer={pendingAnswer}
      lastResult={lastResult}
      onSubmit={submitAnswer}
      onContinue={continueQuiz}
      onReveal={showCorrectAnswer}
      onMarkCorrect={markLastResultCorrect}
      onRetry={retryAnswerSave}
      onStartNew={startNewQuiz}
      onExit={onExitQuiz}
      openNewItem={openNewItem}
    />
  );
}
