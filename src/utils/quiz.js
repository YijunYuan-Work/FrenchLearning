export const DAILY_QUIZ_LIMIT = 20;
export const MAX_CONFIDENCE = 4;
export const QUIZ_STORAGE_KEY = "french-learning-daily-quiz-v1";

function getQuizStorageKey(userId) {
  return userId ? `${QUIZ_STORAGE_KEY}:${userId}` : QUIZ_STORAGE_KEY;
}

export function getTodayKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function getEligibleVocabulary(items) {
  return items
    .filter(
      (item) =>
        item.category === "vocabulary" &&
        Number(item.confidence) < MAX_CONFIDENCE
    )
    .sort((a, b) => {
      const confidenceGap = Number(a.confidence) - Number(b.confidence);
      if (confidenceGap !== 0) return confidenceGap;
      return a.french.localeCompare(b.french, "fr");
    });
}

export function createDailyQuizState(items, date = getTodayKey()) {
  return {
    date,
    queueIds: getEligibleVocabulary(items)
      .slice(0, DAILY_QUIZ_LIMIT)
      .map((item) => item.id),
    answered: {},
  };
}

export function loadDailyQuizState(items, userId) {
  try {
    const today = getTodayKey();
    const saved = JSON.parse(localStorage.getItem(getQuizStorageKey(userId)));
    if (!saved || saved.date !== today || !Array.isArray(saved.queueIds)) {
      return createDailyQuizState(items, today);
    }

    const existingIds = new Set(items.map((item) => item.id));
    return {
      date: today,
      queueIds: saved.queueIds.filter((id) => existingIds.has(id)),
      answered: saved.answered ?? {},
    };
  } catch {
    return createDailyQuizState(items);
  }
}

export function saveDailyQuizState(state, userId) {
  localStorage.setItem(getQuizStorageKey(userId), JSON.stringify(state));
}

export function normalizeAnswer(value) {
  return value
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9\s]/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function getAcceptedMeanings(english) {
  return english
    .split(/;|,|\/|\bor\b/i)
    .map(normalizeAnswer)
    .filter(Boolean);
}

export function isMeaningCorrect(answer, english) {
  const normalizedAnswer = normalizeAnswer(answer);
  if (!normalizedAnswer) return false;

  const accepted = getAcceptedMeanings(english);
  return accepted.some(
    (meaning) =>
      normalizedAnswer === meaning ||
      (normalizedAnswer.length >= 3 && meaning.includes(normalizedAnswer))
  );
}
