import { useCallback, useEffect, useRef, useState } from "react";
import { getDailyLearningState, updateDailyProgress, updateDailyQuizState, updateDailyStudyState } from "../api/dailyLearning";
import { createDailyProgress } from "../utils/dailyProgress";
import { getTodayKey, normalizeQuizState } from "../utils/quiz";
import { normalizeStudyState } from "../utils/studyState";
import { createDailySaver, sameSnapshot } from "../utils/dailyPersistence";

function createInitialState(userId = null, date = getTodayKey()) {
  return { userId, date, status: "idle", error: "", progress: createDailyProgress(date),
    quizState: null, studyState: null, pendingTasks: [] };
}

const stateWriters = {
  progress: updateDailyProgress, quizState: updateDailyQuizState, studyState: updateDailyStudyState,
};

export function useDailyLearningState(user, isCurrentAccount, day) {
  const userId = user?.id ?? null;
  const [state, setState] = useState(createInitialState);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const [saveStatus, setSaveStatus] = useState({});
  const savers = useRef(new Map());
  const allowReload = useRef(false);
  const dailyStateLoaded = state.userId === userId && state.date === day && state.status === "ready";

  useEffect(() => () => {
    for (const group of savers.current.values()) for (const saver of Object.values(group)) saver.stop();
  }, []);

  useEffect(() => {
    if (!userId) {
      setState({ ...createInitialState(null, day), status: "ready" });
      return undefined;
    }
    let mounted = true;
    setState((current) => ({
      ...(current.userId === userId && current.date === day ? current : createInitialState(userId, day)),
      status: "loading", error: "",
    }));
    getDailyLearningState(userId, day).then((saved) => {
      if (!mounted || !isCurrentAccount()) return;
      const group = {};
      let exists = saved.exists;
      for (const [key, write] of Object.entries(stateWriters)) {
        group[key] = createDailySaver({
          initial: saved[key], expected: saved.persisted[key], isCurrent: isCurrentAccount,
          write: async (value, expected) => {
            const result = await write(userId, value, { expected, exists, isCurrent: isCurrentAccount });
            exists = true;
            return result.persisted[key];
          },
          onChange: (status) => {
            if (!isCurrentAccount()) return;
            setSaveStatus((current) => {
              const id = `${day}:${key}`;
              return current[id]?.dirty === status.dirty && current[id]?.error === status.error
                ? current : { ...current, [id]: status };
            });
          },
        });
      }
      savers.current.set(day, group);
      setState((current) => {
        if (current.userId !== userId || current.date !== day) return current;
        const progress = { ...saved.progress };
        for (const task of current.pendingTasks) progress[task] = true;
        return { ...current, ...saved, progress, status: "ready", error: "", pendingTasks: [] };
      });
    }).catch((error) => {
      if (!mounted || !isCurrentAccount()) return;
      setState((current) => current.userId === userId && current.date === day
        ? { ...current, status: "error", error: error.message || "Could not load daily progress." } : current);
    });
    return () => { mounted = false; };
  }, [day, isCurrentAccount, loadAttempt, userId]);

  useEffect(() => {
    if (!userId || state.userId !== userId || state.status !== "ready" || !isCurrentAccount()) return;
    const group = savers.current.get(state.date);
    for (const key of Object.keys(stateWriters)) if (state[key]) group?.[key].submit(state[key]);
  }, [isCurrentAccount, state, userId]);

  const hasUnsavedChanges = Object.values(saveStatus).some((status) => status.dirty);
  const saveFailure = Object.entries(saveStatus).find(([, status]) => status.error);
  useEffect(() => {
    if (!hasUnsavedChanges) return undefined;
    const warn = (event) => {
      if (allowReload.current) return;
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", warn);
    return () => window.removeEventListener("beforeunload", warn);
  }, [hasUnsavedChanges]);

  function completeDailyTask(task, sessionDay) {
    const today = getTodayKey();
    if (sessionDay && sessionDay !== today) return;
    setState((current) => {
      if (!userId || !isCurrentAccount()) return current;
      const owned = current.userId === userId && current.date === today
        ? current : createInitialState(userId, today);
      if (owned.status !== "ready") return {
        ...owned, pendingTasks: Array.from(new Set([...owned.pendingTasks, task])),
      };
      if (owned.progress[task]) return owned;
      return { ...owned, progress: { ...owned.progress, [task]: true } };
    });
  }

  const setSession = useCallback((key, normalize, value) => {
    if (value?.date !== day || day !== getTodayKey()) return;
    setState((current) => {
      if (!isCurrentAccount() || current.userId !== userId || current.date !== day || current.status !== "ready") return current;
      const next = normalize(value, day);
      return sameSnapshot(current[key], next) ? current : { ...current, [key]: next };
    });
  }, [day, isCurrentAccount, userId]);
  const setDailyQuizState = useCallback((value) => setSession("quizState", normalizeQuizState, value), [setSession]);
  const setDailyStudyState = useCallback((value) => setSession("studyState", normalizeStudyState, value), [setSession]);
  const retryDailyLearningState = useCallback(() => setLoadAttempt((current) => current + 1), []);
  function retryDailySaves() {
    for (const group of savers.current.values()) for (const saver of Object.values(group)) saver.retry();
  }
  function reloadSavedDailyProgress() {
    if (!isCurrentAccount()) return;
    // The caller has explicitly confirmed discarding this tab's unsaved work.
    allowReload.current = true;
    for (const group of savers.current.values()) for (const saver of Object.values(group)) saver.stop();
    window.location.reload();
  }

  return {
    completeDailyTask,
    dailyProgress: state.date === day ? state.progress : createDailyProgress(day),
    dailyQuizState: state.date === day ? state.quizState : null,
    dailyStudyState: state.date === day ? state.studyState : null,
    dailyStateLoaded,
    dailyStateError: state.userId === userId && state.date === day ? state.error : "",
    dailySaveError: saveFailure ? `${saveFailure[0].slice(0, 10)}: ${saveFailure[1].error.message}` : "",
    dailySaveConflict: saveFailure?.[1].error.code === "DAILY_SESSION_CONFLICT",
    retryDailyLearningState, retryDailySaves, reloadSavedDailyProgress, setDailyQuizState, setDailyStudyState,
  };
}
