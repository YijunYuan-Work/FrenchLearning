import { supabase } from "../lib/supabase";
import { createDailyProgress } from "../utils/dailyProgress";
import { normalizeQuizState } from "../utils/quiz";
import { normalizeStudyState } from "../utils/studyState";
import { assertAccountAccess } from "../utils/demoMode";
import { sameSnapshot } from "../utils/dailyPersistence";

const dailyLearningStorageKey = "french-learning-daily-learning-state-v1";
const dailyLearningSyncEnabled =
  import.meta.env.VITE_ENABLE_DAILY_LEARNING_SYNC === "true";
let dailyLearningTableAvailable = dailyLearningSyncEnabled;
const columns = "add_note, study, quiz, quiz_state, study_state";
const localQueues = new Map();

function getLocalStateKey(userId, date) {
  return `${dailyLearningStorageKey}:${userId}:${date}`;
}

function isMissingDailyLearningTable(error) {
  const message = error?.message?.toLowerCase() ?? "";
  return ["PGRST205", "PGRST204", "42P01"].includes(error?.code) ||
    (message.includes("does not exist") && message.includes("daily_learning_state"));
}

function toDailyLearningState(row, date) {
  return {
    progress: {
      ...createDailyProgress(date),
      addNote: Boolean(row?.add_note), study: Boolean(row?.study), quiz: Boolean(row?.quiz),
    },
    quizState: normalizeQuizState(row?.quiz_state, date),
    studyState: normalizeStudyState(row?.study_state, date),
    // Raw JSON is the compare-and-set baseline, including legacy states normalized on read.
    persisted: { quizState: row?.quiz_state ?? {}, studyState: row?.study_state ?? {} },
    exists: Boolean(row),
  };
}

function loadLocalRow(userId, date) {
  return JSON.parse(localStorage.getItem(getLocalStateKey(userId, date)));
}

function conflict() {
  return Object.assign(new Error("This session changed in another tab or device. Reload saved progress before continuing."),
    { code: "DAILY_SESSION_CONFLICT" });
}

async function withLocalLock(userId, date, isCurrent, operation) {
  const key = getLocalStateKey(userId, date);
  const run = () => {
    assertAccountAccess();
    if (!isCurrent()) throw new Error("Account changed before daily progress could be saved.");
    return operation();
  };
  if (navigator.locks) return navigator.locks.request(key, run);
  const previous = localQueues.get(key) ?? Promise.resolve();
  const next = previous.catch(() => {}).then(run);
  localQueues.set(key, next);
  try { return await next; } finally { if (localQueues.get(key) === next) localQueues.delete(key); }
}

export async function getDailyLearningState(userId, date) {
  assertAccountAccess();
  if (!dailyLearningSyncEnabled || !dailyLearningTableAvailable) {
    return toDailyLearningState(loadLocalRow(userId, date), date);
  }
  const { data, error } = await supabase.from("daily_learning_state").select(columns)
    .eq("user_id", userId).eq("date", date).maybeSingle();
  if (error) {
    if (isMissingDailyLearningTable(error)) {
      dailyLearningTableAvailable = false;
      return getDailyLearningState(userId, date);
    }
    throw error;
  }
  return toDailyLearningState(data, date);
}

export async function updateDailyProgress(userId, progress, { isCurrent = () => true } = {}) {
  assertAccountAccess();
  if (!isCurrent()) throw new Error("Account changed.");
  const completed = Object.fromEntries([
    ["add_note", progress.addNote], ["study", progress.study], ["quiz", progress.quiz],
  ].filter(([, value]) => value).map(([key]) => [key, true]));
  if (!Object.keys(completed).length) return getDailyLearningState(userId, progress.date);
  if (!dailyLearningSyncEnabled || !dailyLearningTableAvailable) {
    return withLocalLock(userId, progress.date, isCurrent, () => {
      const current = loadLocalRow(userId, progress.date) ?? {};
      const next = { ...current, ...completed };
      if (!sameSnapshot(current, next)) localStorage.setItem(getLocalStateKey(userId, progress.date), JSON.stringify(next));
      return toDailyLearningState(next, progress.date);
    });
  }
  // Only send true flags: an independent completion can never unset an existing goal.
  const { data, error } = await supabase.from("daily_learning_state")
    .upsert({ user_id: userId, date: progress.date, ...completed }, { onConflict: "user_id,date" })
    .select(columns).single();
  if (error) {
    if (isMissingDailyLearningTable(error)) {
      dailyLearningTableAvailable = false;
      return updateDailyProgress(userId, progress, { isCurrent });
    }
    throw error;
  }
  return toDailyLearningState(data, progress.date);
}

async function updateSession(userId, value, field, options = {}) {
  assertAccountAccess();
  const { isCurrent = () => true } = options;
  if (!isCurrent()) throw new Error("Account changed.");
  const key = field === "quiz_state" ? "quizState" : "studyState";
  if (!dailyLearningSyncEnabled || !dailyLearningTableAvailable) {
    return withLocalLock(userId, value.date, isCurrent, () => {
      const current = loadLocalRow(userId, value.date) ?? {};
      const expected = options.expected ?? current[field] ?? {};
      if (!sameSnapshot(current[field] ?? {}, value) && !sameSnapshot(current[field] ?? {}, expected)) throw conflict();
      const next = { ...current, [field]: value };
      if (!sameSnapshot(current, next)) localStorage.setItem(getLocalStateKey(userId, value.date), JSON.stringify(next));
      return toDailyLearningState(next, value.date);
    });
  }

  const previous = options.expected === undefined
    ? await getDailyLearningState(userId, value.date) : null;
  const expected = options.expected ?? previous.persisted[key];
  const exists = options.exists ?? previous?.exists;
  const payload = { user_id: userId, date: value.date, [field]: value };
  if (!isCurrent()) throw new Error("Account changed.");
  let result;
  if (!exists) {
    result = await supabase.from("daily_learning_state").insert(payload).select(columns).single();
    if (result.error?.code === "23505") result = null;
  }
  if (!result) {
    if (!isCurrent()) throw new Error("Account changed.");
    let query = supabase.from("daily_learning_state").update(payload)
      .eq("user_id", userId).eq("date", value.date);
    query = query.eq(field, JSON.stringify(expected));
    result = await query.select(columns).maybeSingle();
  }
  if (result.error) {
    if (isMissingDailyLearningTable(result.error)) {
      dailyLearningTableAvailable = false;
      return updateSession(userId, value, field, options);
    }
    throw result.error;
  }
  if (!result.data) {
    // A response may have been lost after committing. Identical retries are safe.
    const current = await getDailyLearningState(userId, value.date);
    if (sameSnapshot(current.persisted[key], value)) return current;
    throw conflict();
  }
  return toDailyLearningState(result.data, value.date);
}

export const updateDailyQuizState = (userId, value, options) => updateSession(userId, value, "quiz_state", options);
export const updateDailyStudyState = (userId, value, options) => updateSession(userId, value, "study_state", options);
