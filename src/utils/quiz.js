import { defaultLearningSettings } from "./learningSettings.js";

export const DAILY_QUIZ_LIMIT = defaultLearningSettings.quizVocabularyLimit;
export const MAX_CONFIDENCE = 4;

export function getTodayKey() {
  const today = new Date();
  const year = today.getFullYear();
  const month = String(today.getMonth() + 1).padStart(2, "0");
  const day = String(today.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

export function shuffleItems(items) {
  const shuffled = [...items];
  for (let index = shuffled.length - 1; index > 0; index -= 1) {
    const swapIndex = Math.floor(Math.random() * (index + 1));
    [shuffled[index], shuffled[swapIndex]] = [
      shuffled[swapIndex],
      shuffled[index],
    ];
  }
  return shuffled;
}

function normalizeFrenchKey(value) {
  return String(value ?? "")
    .trim()
    .toLocaleLowerCase("fr");
}

export function uniqueLearningItems(items) {
  const seenIds = new Set();
  const seenContent = new Set();

  return items.filter((item) => {
    const id = String(item.id ?? "");
    const wordKey = normalizeFrenchKey(item.french);
    const categoryKey = String(item.category ?? "")
      .trim()
      .toLowerCase();
    const contentKey = wordKey ? `${categoryKey}\u0000${wordKey}` : "";

    if ((id && seenIds.has(id)) || (contentKey && seenContent.has(contentKey))) {
      return false;
    }

    if (id) seenIds.add(id);
    if (contentKey) seenContent.add(contentKey);
    return true;
  });
}

export function getEligibleVocabulary(items) {
  return uniqueLearningItems(
    items.filter(
      (item) =>
        item.category === "vocabulary" &&
        Number(item.confidence) < MAX_CONFIDENCE
    )
  ).sort((a, b) => {
      const confidenceGap = Number(a.confidence) - Number(b.confidence);
      if (confidenceGap !== 0) return confidenceGap;
      return a.french.localeCompare(b.french, "fr");
    });
}

export function createQuizQueueIds(
  items,
  excludedIds = [],
  limit = DAILY_QUIZ_LIMIT
) {
  const excluded = new Set(excludedIds);
  return shuffleItems(
    getEligibleVocabulary(items).filter((item) => !excluded.has(item.id))
  )
    .slice(0, limit)
    .map((item) => item.id);
}

export function createDailyQuizState(
  items,
  date = getTodayKey(),
  excludedIds = [],
  limit = DAILY_QUIZ_LIMIT
) {
  const queueIds = createQuizQueueIds(items, excludedIds, limit);
  return {
    date,
    limit,
    queueIds,
    answered: {},
    seenIds: Array.from(new Set([...excludedIds, ...queueIds])),
  };
}

export function normalizeQuizState(value, date) {
  if (
    !value ||
    value.date !== date ||
    !Array.isArray(value.queueIds) ||
    typeof value.answered !== "object"
  ) {
    return null;
  }

  const limit = Number(value.limit);

  return {
    date,
    ...(Number.isFinite(limit) && limit > 0 ? { limit } : {}),
    queueIds: value.queueIds,
    answered: value.answered ?? {},
    seenIds: Array.isArray(value.seenIds) ? value.seenIds : value.queueIds,
  };
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
  return String(english ?? "")
    .split(/;|,|\/|\bor\b|，|、|；|或/i)
    .map(normalizeMeaningText)
    .filter(Boolean);
}

export function isMeaningCorrect(answer, english) {
  const normalizedAnswer = normalizeMeaningText(answer);
  if (!normalizedAnswer) return false;

  return getAcceptedMeanings(english).includes(normalizedAnswer);
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
