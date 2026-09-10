export function normalizeStudyState(value, date) {
  if (
    !value ||
    value.date !== date ||
    !Array.isArray(value.cycleIds) ||
    !Array.isArray(value.seenIds)
  ) {
    return null;
  }

  return {
    cardIndex: Math.max(0, Number(value.cardIndex) || 0),
    cycleIds: value.cycleIds,
    date,
    isFlipped: Boolean(value.isFlipped),
    isStudyComplete: Boolean(value.isStudyComplete),
    seenIds: value.seenIds,
  };
}

export function shouldDelayStudyMount({
  activeSection,
  dailyStateLoaded,
  isDemo,
}) {
  return !isDemo && activeSection === "review" && !dailyStateLoaded;
}
