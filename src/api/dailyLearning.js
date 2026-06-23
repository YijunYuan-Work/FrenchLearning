import { supabase } from "../lib/supabase";
import { createDailyProgress } from "../utils/dailyProgress";

const dailyLearningStorageKey = "french-learning-daily-learning-state-v1";
const dailyLearningSyncEnabled =
  import.meta.env.VITE_ENABLE_DAILY_LEARNING_SYNC === "true";
let dailyLearningTableAvailable = dailyLearningSyncEnabled;

function getLocalStateKey(userId, date) {
  return `${dailyLearningStorageKey}:${userId}:${date}`;
}

function isMissingDailyLearningTable(error) {
  const message = error?.message?.toLowerCase() ?? "";
  return (
    error?.code === "PGRST205" ||
    error?.code === "PGRST204" ||
    error?.code === "42P01" ||
    message.includes("daily_learning_state") ||
    message.includes("study_state")
  );
}

function normalizeQuizState(value, date) {
  if (
    !value ||
    value.date !== date ||
    !Array.isArray(value.queueIds) ||
    typeof value.answered !== "object"
  ) {
    return null;
  }

  return {
    date,
    queueIds: value.queueIds,
    answered: value.answered ?? {},
    seenIds: Array.isArray(value.seenIds) ? value.seenIds : value.queueIds,
  };
}

function normalizeStudyState(value, date) {
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

function toDailyLearningState(row, date) {
  return {
    progress: {
      ...createDailyProgress(date),
      addNote: Boolean(row?.add_note),
      study: Boolean(row?.study),
      quiz: Boolean(row?.quiz),
    },
    quizState: normalizeQuizState(row?.quiz_state, date),
    studyState: normalizeStudyState(row?.study_state, date),
  };
}

function loadLocalDailyLearningState(userId, date) {
  try {
    const saved = JSON.parse(localStorage.getItem(getLocalStateKey(userId, date)));
    return toDailyLearningState(saved, date);
  } catch {
    return toDailyLearningState(null, date);
  }
}

function saveLocalDailyLearningState(userId, date, nextState) {
  try {
    localStorage.setItem(getLocalStateKey(userId, date), JSON.stringify(nextState));
  } catch {
    // Local fallback is best effort only.
  }
}

export async function getDailyLearningState(userId, date) {
  if (!dailyLearningSyncEnabled || !dailyLearningTableAvailable) {
    return loadLocalDailyLearningState(userId, date);
  }

  const { data, error } = await supabase
    .from("daily_learning_state")
    .select("add_note, study, quiz, quiz_state, study_state")
    .eq("user_id", userId)
    .eq("date", date)
    .maybeSingle();

  if (error) {
    if (isMissingDailyLearningTable(error)) {
      dailyLearningTableAvailable = false;
      return loadLocalDailyLearningState(userId, date);
    }
    throw error;
  }

  return toDailyLearningState(data, date);
}

export async function updateDailyProgress(userId, progress) {
  if (!dailyLearningSyncEnabled || !dailyLearningTableAvailable) {
    const current = loadLocalDailyLearningState(userId, progress.date);
    saveLocalDailyLearningState(userId, progress.date, {
      add_note: Boolean(progress.addNote),
      study: Boolean(progress.study),
      quiz: Boolean(progress.quiz),
      quiz_state: current.quizState ?? {},
      study_state: current.studyState ?? {},
    });
    return loadLocalDailyLearningState(userId, progress.date);
  }

  const { data, error } = await supabase
    .from("daily_learning_state")
    .upsert(
      {
        user_id: userId,
        date: progress.date,
        add_note: Boolean(progress.addNote),
        study: Boolean(progress.study),
        quiz: Boolean(progress.quiz),
      },
      { onConflict: "user_id,date" }
    )
    .select("add_note, study, quiz, quiz_state, study_state")
    .single();

  if (error) {
    if (isMissingDailyLearningTable(error)) {
      dailyLearningTableAvailable = false;
      return updateDailyProgress(userId, progress);
    }
    throw error;
  }

  return toDailyLearningState(data, progress.date);
}

export async function updateDailyQuizState(userId, quizState) {
  if (!dailyLearningSyncEnabled || !dailyLearningTableAvailable) {
    const current = loadLocalDailyLearningState(userId, quizState.date);
    saveLocalDailyLearningState(userId, quizState.date, {
      add_note: Boolean(current.progress.addNote),
      study: Boolean(current.progress.study),
      quiz: Boolean(current.progress.quiz),
      quiz_state: quizState,
      study_state: current.studyState ?? {},
    });
    return loadLocalDailyLearningState(userId, quizState.date);
  }

  const { data, error } = await supabase
    .from("daily_learning_state")
    .upsert(
      {
        user_id: userId,
        date: quizState.date,
        quiz_state: quizState,
      },
      { onConflict: "user_id,date" }
    )
    .select("add_note, study, quiz, quiz_state, study_state")
    .single();

  if (error) {
    if (isMissingDailyLearningTable(error)) {
      dailyLearningTableAvailable = false;
      return updateDailyQuizState(userId, quizState);
    }
    throw error;
  }

  return toDailyLearningState(data, quizState.date);
}

export async function updateDailyStudyState(userId, studyState) {
  if (!dailyLearningSyncEnabled || !dailyLearningTableAvailable) {
    const current = loadLocalDailyLearningState(userId, studyState.date);
    saveLocalDailyLearningState(userId, studyState.date, {
      add_note: Boolean(current.progress.addNote),
      study: Boolean(current.progress.study),
      quiz: Boolean(current.progress.quiz),
      quiz_state: current.quizState ?? {},
      study_state: studyState,
    });
    return loadLocalDailyLearningState(userId, studyState.date);
  }

  const { data, error } = await supabase
    .from("daily_learning_state")
    .upsert(
      {
        user_id: userId,
        date: studyState.date,
        study_state: studyState,
      },
      { onConflict: "user_id,date" }
    )
    .select("add_note, study, quiz, quiz_state, study_state")
    .single();

  if (error) {
    if (isMissingDailyLearningTable(error)) {
      dailyLearningTableAvailable = false;
      return updateDailyStudyState(userId, studyState);
    }
    throw error;
  }

  return toDailyLearningState(data, studyState.date);
}
