import { getTodayKey } from "./quiz";

const DAILY_PROGRESS_STORAGE_KEY = "french-learning-daily-progress-v1";

function getDailyProgressStorageKey(userId) {
  return userId
    ? `${DAILY_PROGRESS_STORAGE_KEY}:${userId}`
    : DAILY_PROGRESS_STORAGE_KEY;
}

export function createDailyProgress(date = getTodayKey()) {
  return {
    date,
    addNote: false,
    study: false,
    quiz: false,
  };
}

export function loadDailyProgress(userId) {
  try {
    const today = getTodayKey();
    const saved = JSON.parse(
      localStorage.getItem(getDailyProgressStorageKey(userId))
    );

    if (!saved || saved.date !== today) {
      return createDailyProgress(today);
    }

    return {
      ...createDailyProgress(today),
      ...saved,
      date: today,
    };
  } catch {
    return createDailyProgress();
  }
}

export function saveDailyProgress(userId, progress) {
  localStorage.setItem(
    getDailyProgressStorageKey(userId),
    JSON.stringify(progress)
  );
}
