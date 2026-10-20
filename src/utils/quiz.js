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
    .normalize("NFC")
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
        isQuizVocabularyNote(item) &&
        Number(item.confidence) < MAX_CONFIDENCE
    )
  ).sort((a, b) => {
      const confidenceGap = Number(a.confidence) - Number(b.confidence);
      if (confidenceGap !== 0) return confidenceGap;
      return a.french.localeCompare(b.french, "fr");
    });
}

export function isQuizVocabularyNote(item) {
  return Boolean(item && typeof item.id === "string" && item.id.trim() &&
    item.category === "vocabulary" && typeof item.french === "string" && item.french.trim() &&
    typeof item.english === "string" && item.english.trim() &&
    typeof item.confidence === "number" && Number.isInteger(item.confidence) &&
    item.confidence >= 1 && item.confidence <= MAX_CONFIDENCE);
}

export function isCompletedQuizAnswer(result) {
  return Boolean(result && !Array.isArray(result) && typeof result.correct === "boolean" &&
    (result.status === undefined || result.status === "complete"));
}

export function reconcileQuizState(state, items) {
  const byId = new Map(items.filter((item) => item && typeof item.id === "string").map((item) => [item.id, item]));
  const ids = (values) => [...new Set((Array.isArray(values) ? values : []).filter((id) => typeof id === "string" && id.trim()))];
  const answers = state.answered && !Array.isArray(state.answered) ? state.answered : {};
  const originalQueue = ids([...(Array.isArray(state.queueIds) ? state.queueIds : []),
    ...Object.keys(answers).filter((id) => isCompletedQuizAnswer(answers[id]))]);
  const historyKeys = new Set(originalQueue.filter((id) => isCompletedQuizAnswer(answers[id]))
    .map((id) => byId.get(id)?.french).filter((word) => typeof word === "string").map(normalizeFrenchKey));
  const wordKeys = new Set(historyKeys);
  const queueIds = [];
  const answered = {};
  for (const id of originalQueue) {
    const result = answers[id];
    // Completed outcomes are history, even after deletion/reclassification.
    // Pending outcomes are not history and require a still-valid Vocabulary note.
    if (isCompletedQuizAnswer(result)) {
      queueIds.push(id);
      answered[id] = result;
      continue;
    }
    const item = byId.get(id);
    const pending = result?.status === "pending" && Number.isInteger(result.targetConfidence) &&
      result.targetConfidence >= 1 && result.targetConfidence <= MAX_CONFIDENCE &&
      typeof result.answer === "string" && (result.genderAnswer === undefined || typeof result.genderAnswer === "string");
    if (Object.hasOwn(answers, id) && !pending) continue;
    if (!isQuizVocabularyNote(item) || (!pending && item.confidence >= MAX_CONFIDENCE)) continue;
    const key = normalizeFrenchKey(item.french);
    if (wordKeys.has(key)) continue;
    wordKeys.add(key);
    queueIds.push(id);
    if (pending) answered[id] = result;
  }
  // Keep removed IDs seen so restoring/reclassifying a note cannot repeat it today.
  const seenIds = ids([...(Array.isArray(state.seenIds) ? state.seenIds : []), ...originalQueue, ...Object.keys(answers)]);
  const sameIds = (left, right) => Array.isArray(left) && left.length === right.length && left.every((id, index) => id === right[index]);
  const sameAnswers = Object.keys(answers).length === Object.keys(answered).length && Object.keys(answered).every((id) => answers[id] === answered[id]);
  return sameIds(state.queueIds, queueIds) && sameIds(state.seenIds, seenIds) && sameAnswers && state.answered === answers
    ? state : { ...state, queueIds, answered, seenIds };
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
    answered: value.answered && !Array.isArray(value.answered) ? value.answered : {},
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
