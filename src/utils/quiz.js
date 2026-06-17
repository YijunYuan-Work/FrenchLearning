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

export function normalizeMeaningText(value) {
  return String(value ?? "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[，。！？、；：（）《》“”‘’]/g, " ")
    .replace(/['â€™]/g, "")
    .replace(/[^\p{Letter}\p{Number}\s]/gu, " ")
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
  const normalizedAnswer = normalizeMeaningText(answer);
  if (!normalizedAnswer) return false;

  const accepted = String(english ?? "")
    .split(/;|,|\/|\bor\b|，|、|；|或/g)
    .map(normalizeMeaningText)
    .filter(Boolean);

  return accepted.some(
    (meaning) =>
      normalizedAnswer === meaning ||
      (normalizedAnswer.length >= 3 && meaning.includes(normalizedAnswer))
  );
}

export function normalizeGenderAnswer(value) {
  return normalizeMeaningText(value)
    .replace(/\b(le|la|un|une|the|a|an|noun|nom|n)\b/g, " ")
    .replace(/\s+/g, " ")
    .trim();
}

export function isGenderCorrect(answer, gender) {
  const normalizedAnswer = normalizeGenderAnswer(answer);
  const normalizedGender = normalizeGenderAnswer(gender);

  if (!normalizedAnswer || !normalizedGender) return false;

  if (normalizedGender === "masculine or feminine") {
    return (
      normalizedAnswer.includes("masculine") &&
      normalizedAnswer.includes("feminine")
    );
  }

  const masculineAnswers = new Set(["masculine", "m", "male", "阳性"]);
  const feminineAnswers = new Set(["feminine", "f", "female", "阴性"]);

  if (normalizedGender === "masculine") {
    return masculineAnswers.has(normalizedAnswer);
  }

  if (normalizedGender === "feminine") {
    return feminineAnswers.has(normalizedAnswer);
  }

  return normalizedAnswer === normalizedGender;
}
