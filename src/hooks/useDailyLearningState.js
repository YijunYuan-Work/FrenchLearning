import { useCallback, useEffect, useRef, useState } from "react";
import {
  getDailyLearningState,
  updateDailyProgress,
  updateDailyQuizState,
  updateDailyStudyState,
} from "../api/dailyLearning";
import { createDailyProgress } from "../utils/dailyProgress";
import { getTodayKey, normalizeQuizState } from "../utils/quiz";
import { normalizeStudyState } from "../utils/studyState";

function createInitialState(userId = null) {
  return {
    userId,
    status: "idle",
    error: "",
    progress: createDailyProgress(),
    quizState: null,
    studyState: null,
    pendingTasks: [],
  };
}

const stateWriters = {
  progress: updateDailyProgress,
  quizState: updateDailyQuizState,
  studyState: updateDailyStudyState,
};

export function useDailyLearningState(user, setDataError) {
  const userId = user?.id ?? null;
  const [state, setState] = useState(createInitialState);
  const [loadAttempt, setLoadAttempt] = useState(0);
  const submittedSnapshotsRef = useRef({});
  const dailyStateLoaded = state.userId === userId && state.status === "ready";

  useEffect(() => {
    if (!userId) {
      setState(createInitialState());
      return undefined;
    }

    let isMounted = true;
    const today = getTodayKey();

    setState((current) => ({
      ...(current.userId === userId ? current : createInitialState(userId)),
      status: "loading",
      error: "",
    }));

    getDailyLearningState(userId, today)
      .then(({ progress, quizState, studyState }) => {
        if (!isMounted) return;
        // Hydration is the baseline, not a change to write back to storage.
        submittedSnapshotsRef.current = {
          progress: JSON.stringify(progress),
          quizState: JSON.stringify(quizState),
          studyState: JSON.stringify(studyState),
        };
        setState((current) => {
          if (current.userId !== userId) return current;
          const mergedProgress = { ...progress };
          for (const task of current.pendingTasks) mergedProgress[task] = true;
          return {
            ...current,
            status: "ready",
            error: "",
            progress: mergedProgress,
            quizState,
            studyState,
            pendingTasks: [],
          };
        });
      })
      .catch((error) => {
        if (!isMounted) return;
        setState((current) => current.userId === userId
          ? { ...current, status: "error", error: error.message || "Could not load daily progress." }
          : current);
      });

    return () => {
      isMounted = false;
    };
  }, [loadAttempt, userId]);

  useEffect(() => {
    if (!userId || !dailyStateLoaded) return;

    for (const [key, writeState] of Object.entries(stateWriters)) {
      const value = state[key];
      const snapshot = JSON.stringify(value);
      if (!value || submittedSnapshotsRef.current[key] === snapshot) continue;
      submittedSnapshotsRef.current[key] = snapshot;
      writeState(userId, value).catch((error) => setDataError(error.message));
    }
  }, [dailyStateLoaded, setDataError, state, userId]);

  function completeDailyTask(task) {
    const today = getTodayKey();
    setState((current) => {
      if (!userId || current.userId !== userId) return current;
      if (current.status !== "ready") {
        return { ...current, pendingTasks: Array.from(new Set([...current.pendingTasks, task])) };
      }
      const progress = current.progress.date === today
        ? current.progress
        : createDailyProgress(today);
      if (progress[task]) return current;
      return { ...current, progress: { ...progress, [task]: true } };
    });
  }

  const setDailyQuizState = useCallback((value) => {
    setState((current) => {
      if (current.userId !== userId || (userId && current.status !== "ready")) return current;
      const quizState = normalizeQuizState(value, value?.date);
      return JSON.stringify(current.quizState) === JSON.stringify(quizState)
        ? current
        : { ...current, quizState };
    });
  }, [userId]);

  const setDailyStudyState = useCallback((value) => {
    setState((current) => {
      if (current.userId !== userId || (userId && current.status !== "ready")) return current;
      const studyState = normalizeStudyState(value, value?.date);
      return JSON.stringify(current.studyState) === JSON.stringify(studyState)
        ? current
        : { ...current, studyState };
    });
  }, [userId]);

  const retryDailyLearningState = useCallback(() => setLoadAttempt((current) => current + 1), []);
  const resetDailyLearningState = useCallback(() => {
    setState(createInitialState());
    submittedSnapshotsRef.current = {};
  }, []);

  return {
    completeDailyTask,
    dailyProgress: state.progress,
    dailyQuizState: state.quizState,
    dailyStudyState: state.studyState,
    dailyStateLoaded,
    dailyStateError: state.userId === userId ? state.error : "",
    resetDailyLearningState,
    retryDailyLearningState,
    setDailyQuizState,
    setDailyStudyState,
  };
}
