import { getTodayKey } from "./quiz";

export function createDailyProgress(date = getTodayKey()) {
  return {
    date,
    addNote: false,
    study: false,
    quiz: false,
  };
}
