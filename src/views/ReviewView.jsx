import { Check, ChevronLeft, ChevronRight, Plus, RotateCcw } from "lucide-react";
import { useEffect, useMemo, useRef, useState } from "react";
import { categories } from "../data/categories";
import { useLanguage } from "../i18n/LanguageContext";
import { getTodayKey, MAX_CONFIDENCE, shuffleItems, uniqueLearningItems } from "../utils/quiz";
import { defaultLearningSettings } from "../utils/learningSettings";
import { StudyCard } from "../components/StudyCard";

const studyCategories = [
  ["vocabulary", "studyVocabularyLimit"],
  ["phrases", "studyPhraseLimit"],
  ["grammar", "studyGrammarLimit"],
];

function createStudyCycle(studyItems, settings, excludedIds = []) {
  const excluded = new Set(excludedIds);
  const cycleIds = studyCategories.flatMap(([category, limitKey]) =>
    shuffleItems(uniqueLearningItems(studyItems.filter(
      (item) => item.category === category && !excluded.has(item.id)
    )))
      .slice(0, settings[limitKey] ?? defaultLearningSettings[limitKey])
      .map((item) => item.id)
  );
  return { cycleIds, seenIds: Array.from(new Set([...excludedIds, ...cycleIds])) };
}

export function ReviewView({
  items,
  learningDay = getTodayKey(),
  learningSettings = defaultLearningSettings,
  onStudyConfidenceChange,
  onStudyComplete,
  onStudyStateChange,
  onExitStudy,
  openEditItem,
  openNewItem,
  savedStudyState,
}) {
  const { t } = useLanguage();
  const studySettings = useMemo(() => ({ ...defaultLearningSettings, ...learningSettings }), [learningSettings]);
  const studyItems = useMemo(() => uniqueLearningItems(items.filter(
    (item) => ["vocabulary", "grammar", "phrases"].includes(item.category) && Number(item.confidence) < MAX_CONFIDENCE
  )).sort((a, b) => {
    const confidenceGap = Number(a.confidence) - Number(b.confidence);
    if (confidenceGap !== 0) return confidenceGap;
    return a.french.localeCompare(b.french, "fr");
  }), [items]);
  const itemsById = useMemo(() => new Map(items.map((item) => [item.id, item])), [items]);
  const savedStateIsCurrent = savedStudyState?.date === learningDay;
  const [cardIndex, setCardIndex] = useState(() => savedStateIsCurrent ? Number(savedStudyState.cardIndex) || 0 : 0);
  const [studyCycle, setStudyCycle] = useState(() => savedStateIsCurrent
    ? { cycleIds: savedStudyState.cycleIds ?? [], seenIds: savedStudyState.seenIds ?? [] }
    : createStudyCycle(studyItems, studySettings));
  const [isFlipped, setIsFlipped] = useState(() => savedStateIsCurrent ? Boolean(savedStudyState.isFlipped) : false);
  const [isStudyComplete, setIsStudyComplete] = useState(() => savedStateIsCurrent ? Boolean(savedStudyState.isStudyComplete) : false);
  const cycleIds = studyCycle.cycleIds;
  const previousCycleLengthRef = useRef(cycleIds.length);
  const cycleItems = useMemo(() => cycleIds.map((id) => itemsById.get(id)).filter(Boolean), [cycleIds, itemsById]);
  const currentItem = cycleItems[cardIndex];
  const cycleGroups = useMemo(() => studyCategories.map(([category, limitKey]) => {
    const groupItems = cycleItems.filter((item) => item.category === category);
    const reviewedCount = cycleItems.slice(0, cardIndex + 1).filter((item) => item.category === category).length;
    return {
      category,
      isCurrent: currentItem?.category === category,
      limit: studySettings[limitKey] ?? defaultLearningSettings[limitKey],
      reviewedCount: Math.min(reviewedCount, groupItems.length),
      total: groupItems.length,
    };
  }), [cardIndex, currentItem?.category, cycleItems, studySettings]);
  const hasUnseenStudyItems = useMemo(() => {
    const seen = new Set(studyCycle.seenIds);
    return studyItems.some((item) => !seen.has(item.id));
  }, [studyCycle.seenIds, studyItems]);
  const sessionRef = useRef(null);
  const flipControlRef = useRef(null);
  const navigationRef = useRef(null);
  const gestureRef = useRef(null);
  const swipedRef = useRef(false);
  const completedRef = useRef(isStudyComplete);
  const cycleItemsRef = useRef(cycleItems);
  cycleItemsRef.current = cycleItems;
  const [direction, setDirection] = useState(1);
  const [isMoving, setIsMoving] = useState(false);

  useEffect(() => {
    setStudyCycle((current) => {
      const existingIds = new Set(items.map((item) => item.id));
      const nextCycleIds = current.cycleIds.filter((id) => existingIds.has(id));
      const nextSeenIds = current.seenIds.filter((id) => existingIds.has(id));
      if (nextCycleIds.length === 0 && studyItems.length > 0 && !isStudyComplete) return createStudyCycle(studyItems, studySettings);
      if (nextCycleIds.length !== current.cycleIds.length || nextSeenIds.length !== current.seenIds.length) {
        return { cycleIds: nextCycleIds, seenIds: nextSeenIds };
      }
      return current;
    });
  }, [items, isStudyComplete, studyItems, studySettings]);

  useEffect(() => {
    setCardIndex((current) => Math.min(current, Math.max(0, cycleItems.length - 1)));
    if (previousCycleLengthRef.current !== cycleItems.length) {
      setIsFlipped(false);
      previousCycleLengthRef.current = cycleItems.length;
    }
  }, [cycleItems.length]);

  useEffect(() => {
    onStudyStateChange?.({ cardIndex, cycleIds: studyCycle.cycleIds, date: learningDay, isFlipped, isStudyComplete, seenIds: studyCycle.seenIds });
  }, [cardIndex, learningDay, isFlipped, isStudyComplete, onStudyStateChange, studyCycle.cycleIds, studyCycle.seenIds]);

  useEffect(() => () => clearTimeout(navigationRef.current), []);

  function moveToCard(nextIndex) {
    if (navigationRef.current || nextIndex < 0 || nextIndex >= cycleItems.length) return;
    const nextId = cycleItems[nextIndex].id;
    const commit = () => {
      // Resolve the destination against the latest queue if a note was removed during the exit.
      setCardIndex(() => Math.max(0, cycleItemsRef.current.findIndex((item) => item.id === nextId)));
      setIsFlipped(false);
      setIsMoving(false);
      navigationRef.current = null;
      sessionRef.current?.focus({ preventScroll: true });
    };
    setDirection(nextIndex > cardIndex ? 1 : -1);
    if (window.matchMedia("(prefers-reduced-motion: reduce)").matches) return commit();
    setIsMoving(true);
    navigationRef.current = setTimeout(commit, 200);
  }
  function flipCard(event) {
    if (swipedRef.current && event?.nativeEvent?.pointerType === "touch") { swipedRef.current = false; return; }
    if (navigationRef.current || !currentItem || isStudyComplete) return;
    // Move focus out before its face becomes inert, without stealing it from footer controls.
    if (document.activeElement?.closest(".study-face")) flipControlRef.current?.focus({ preventScroll: true });
    setIsFlipped((current) => !current);
  }

  function startNewStudyCycle() {
    completedRef.current = false;
    setStudyCycle((current) => createStudyCycle(studyItems, studySettings, current.seenIds));
    setCardIndex(0);
    setIsFlipped(false);
    setIsStudyComplete(false);
    sessionRef.current?.focus({ preventScroll: true });
  }

  function finishStudyCycle() {
    if (navigationRef.current || completedRef.current) return;
    completedRef.current = true;
    setIsStudyComplete(true);
    onStudyComplete?.();
    sessionRef.current?.focus({ preventScroll: true });
  }

  function nextCard() {
    if (cardIndex === cycleItems.length - 1) finishStudyCycle();
    else moveToCard(cardIndex + 1);
  }

  function onKeyDown(event) {
    if (event.altKey || event.ctrlKey || event.metaKey || event.target.closest("input, textarea, select, [contenteditable=true]") || !currentItem || isStudyComplete) return;
    if (event.key === " " && !event.target.closest("button")) { event.preventDefault(); flipCard(); }
    else if (event.key === "ArrowRight" && !event.target.closest('[role="radio"]')) { event.preventDefault(); nextCard(); }
    else if (event.key === "ArrowLeft" && !event.target.closest('[role="radio"]')) { event.preventDefault(); moveToCard(cardIndex - 1); }
    else if (/^[1-4]$/.test(event.key) && isFlipped && currentItem.category !== "vocabulary" && !navigationRef.current) {
      event.preventDefault();
      onStudyConfidenceChange?.(currentItem.id, Number(event.key));
    }
  }

  function onPointerDown(event) {
    swipedRef.current = false;
    if (event.pointerType !== "touch" || event.target.closest("button, a, input, [role=radio]")) {
      // The front is a button, but still accepts a horizontal touch gesture.
      if (event.pointerType !== "touch" || !event.target.closest(".study-front")) return;
    }
    gestureRef.current = { x: event.clientX, y: event.clientY, id: event.pointerId };
  }
  function onPointerUp(event) {
    const start = gestureRef.current;
    gestureRef.current = null;
    if (!start || start.id !== event.pointerId || !window.matchMedia("(max-width: 767px)").matches) return;
    const dx = event.clientX - start.x;
    const dy = event.clientY - start.y;
    if (Math.abs(dx) < 65 || Math.abs(dx) < Math.abs(dy) * 1.5) return;
    event.preventDefault();
    swipedRef.current = true;
    if (dx < 0) nextCard();
    else moveToCard(cardIndex - 1);
  }

  const currentGroup = cycleGroups.find((group) => group.isCurrent);
  const groupLabel = (group) => t(categories[group.category].labelKey, categories[group.category].label);
  const cardProgress = t("cardProgress", "Card {current} of {total}", { current: cardIndex + 1, total: cycleItems.length });
  const sectionLine = currentGroup ? t("studyCurrentSection", "{section} {current}/{total}", { section: groupLabel(currentGroup), current: currentGroup.reviewedCount, total: currentGroup.total }) : "";
  const hasStudiedEverything = studyItems.length > 0 && cycleItems.length === 0;
  const isLastCard = cardIndex === cycleItems.length - 1;

  function progressGroups(complete = false) {
    return <div className={`study-groups${complete ? " is-complete" : ""}`}>
      {cycleGroups.map((group) => <div className={`study-group${group.isCurrent ? " is-current" : ""}`} key={group.category}>
        <div className="study-group-heading"><span>{groupLabel(group)}</span><span>{complete ? group.total : group.reviewedCount}/{group.total}</span></div>
        <div className="study-segments" aria-hidden="true">
          {Array.from({ length: group.total || 1 }, (_, index) => <span key={index} className={complete || index < group.reviewedCount - (group.isCurrent ? 1 : 0) ? "is-reviewed" : group.isCurrent && index === group.reviewedCount - 1 ? "is-current" : ""} />)}
        </div>
        {!complete && <p>{t("studyLimitIndicator", "Limit {limit}, available {total}", { limit: group.limit, total: group.total })}</p>}
      </div>)}
    </div>;
  }

  return (
    <section className="study-page" aria-label={t("studySession", "Study session")} tabIndex={-1} ref={sessionRef} onKeyDown={onKeyDown}>
      <header className="study-mobile-header">
        <button className="icon-action" aria-label={t("backToToday", "Back to Today")} onClick={onExitStudy} type="button"><ChevronLeft size={22} /></button>
        <span>{t("flashcards", "Flashcards")}{currentItem && !isStudyComplete && <small> · {sectionLine}</small>}</span>
        {currentItem && !isStudyComplete && <span className="study-mobile-position" aria-hidden="true">{String(cardIndex + 1).padStart(2, "0")}<small> /{String(cycleItems.length).padStart(2, "0")}</small></span>}
      </header>

      {!currentItem ? <div className="study-empty study-end">
        <div className="study-empty-paper" aria-hidden="true"><span>…</span></div>
        <div><p className="eyebrow">{t("studyMode", "Study mode")}</p>
          <h2 className="editorial-title">{hasStudiedEverything ? t("studyNoUnseenTitle", "All available study cards have appeared.") : t("noStudyCards", "No study cards are due.")}</h2>
          <p>{hasStudiedEverything ? t("studyNoUnseenCopy", "Add more notes or return after confidence levels change.") : t("noStudyCardsCopy", "Add a new note or edit an existing note if you want something in the Study deck.")}</p>
          {!hasStudiedEverything && <button className="primary-action" onClick={() => openNewItem("vocabulary")} type="button"><Plus size={17} />{t("addNote", "Add note")}</button>}
        </div>
      </div> : isStudyComplete ? <div className="study-end study-complete" role="status">
        <span className="study-complete-seal" aria-hidden="true"><Check size={34} /></span>
        <div className="study-complete-intro">
          <p className="eyebrow">{t("studyComplete", "Study complete")} <span lang="fr" aria-hidden="true">· étude terminée</span></p>
          <h2 className="editorial-title">{t("studyCompleteLead", "Nice work. You finished this ")}<em>{t("studyCompleteCycle", "study cycle.")}</em></h2>
          <p>{t("studyCompleteCopy", "You reviewed {count} cards.", { count: cycleItems.length })}</p>
        </div>
        {progressGroups(true)}
        <div className="study-restart"><button className="primary-action" disabled={!hasUnseenStudyItems} onClick={startNewStudyCycle} type="button"><RotateCcw size={17} />{t("startNewStudy", "Start a new study cycle")}</button>
          {!hasUnseenStudyItems && <p>{t("studyNoUnseenCopy", "Add more notes or return after confidence levels change.")}</p>}
        </div>
      </div> : <>
        <div className="study-heading">
          <div><p className="study-mode">{t("studyMode", "Study mode")}</p><div className="study-title-line"><h2 className="editorial-title">{t("flashcards", "Flashcards")}</h2><span>· {sectionLine}</span></div></div>
          <div className="study-position" aria-hidden="true"><strong>{String(cardIndex + 1).padStart(2, "0")}</strong><em>/ {String(cycleItems.length).padStart(2, "0")}</em><span>{cardProgress}</span></div>
        </div>
        <p className="sr-only" role="status" aria-live="polite" aria-atomic="true">{cardProgress}. {sectionLine}. {isFlipped ? t("showingDetails", "Details shown") : t("showingFront", "French shown")}</p>
        {progressGroups()}
        <div className="study-stack" onPointerDown={onPointerDown} onPointerUp={onPointerUp} onPointerCancel={() => { gestureRef.current = null; }}>
          {cardIndex < cycleItems.length - 2 && <div className="study-sheet study-sheet-far" aria-hidden="true" />}
          {cardIndex < cycleItems.length - 1 && <div className="study-sheet study-sheet-near" aria-hidden="true" />}
          <div className={`study-moving${isMoving ? " is-leaving" : ""}`} style={{ "--study-direction": direction, "--study-enter-x": direction > 0 ? "0px" : "-28px", "--study-enter-y": direction > 0 ? "10px" : "0px" }} key={currentItem.id}>
            <StudyCard item={currentItem} index={cardIndex} isFlipped={isFlipped} onFlip={flipCard} openEditItem={openEditItem} onConfidenceChange={onStudyConfidenceChange} />
          </div>
        </div>
        <footer className="study-actions">
          <button className="study-previous" aria-label={t("previous", "Previous")} disabled={cardIndex === 0 || isMoving} onClick={() => moveToCard(cardIndex - 1)} type="button"><ChevronLeft size={17} /><span>{t("previous", "Previous")}</span></button>
          <button className="secondary-action" disabled={isMoving} ref={flipControlRef} onClick={flipCard} type="button"><RotateCcw size={17} /><span>{isFlipped ? t("showFront", "Show front") : t("showDetails", "Show details")}</span></button>
          <button className="primary-action" disabled={isMoving} onClick={nextCard} type="button">{isLastCard ? t("finishStudy", "Finish study") : t("next", "Next")}<ChevronRight size={17} /></button>
        </footer>
      </>}
    </section>
  );
}
