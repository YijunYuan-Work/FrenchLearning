export const defaultLearningSettings = {
  quizVocabularyLimit: 50,
  studyVocabularyLimit: 50,
  studyGrammarLimit: 20,
  studyPhraseLimit: 20,
};

const limits = {
  quizVocabularyLimit: { min: 1, max: 200 },
  studyVocabularyLimit: { min: 0, max: 200 },
  studyGrammarLimit: { min: 0, max: 100 },
  studyPhraseLimit: { min: 0, max: 100 },
};

export function clampLearningSetting(key, value) {
  const limit = limits[key];
  const fallback = defaultLearningSettings[key];
  const numericValue = Number(value);

  if (!limit || !Number.isFinite(numericValue)) {
    return fallback;
  }

  return Math.min(limit.max, Math.max(limit.min, Math.round(numericValue)));
}

export function normalizeLearningSettings(settings = {}) {
  return Object.fromEntries(
    Object.entries(defaultLearningSettings).map(([key, fallback]) => [
      key,
      clampLearningSetting(key, settings[key] ?? fallback),
    ])
  );
}

export function getLearningSettingLimits() {
  return limits;
}
