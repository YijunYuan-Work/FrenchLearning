import { useEffect, useState } from "react";
import {
  getDailyLearningState,
  updateDailyProgress,
  updateDailyQuizState,
} from "../api/dailyLearning";
import { createDailyProgress } from "../utils/dailyProgress";
import { getTodayKey } from "../utils/quiz";

export function useDailyLearningState(user, setDataError) {
  const [dailyProgress, setDailyProgress] = useState(() =>
    createDailyProgress()
  );
  const [dailyQuizState, setDailyQuizState] = useState(null);
  const [dailyStateLoaded, setDailyStateLoaded] = useState(false);

  useEffect(() => {
    if (!user) {
      setDailyStateLoaded(false);
      return undefined;
    }

    let isMounted = true;
    const today = getTodayKey();

    setDailyStateLoaded(false);
    getDailyLearningState(user.id, today)
      .then(({ progress, quizState }) => {
        if (!isMounted) return;
        setDailyProgress(progress);
        setDailyQuizState(quizState);
        setDailyStateLoaded(true);
      })
      .catch((error) => {
        if (!isMounted) return;
        setDailyProgress(createDailyProgress(today));
        setDailyQuizState(null);
        setDailyStateLoaded(true);
        setDataError(error.message);
      });

    return () => {
      isMounted = false;
    };
  }, [setDataError, user]);

  useEffect(() => {
    if (!user || !dailyStateLoaded) return;
    updateDailyProgress(user.id, dailyProgress).catch((error) => {
      setDataError(error.message);
    });
  }, [dailyProgress, dailyStateLoaded, setDataError, user]);

  useEffect(() => {
    if (!user || !dailyStateLoaded || !dailyQuizState) return;
    updateDailyQuizState(user.id, dailyQuizState).catch((error) => {
      setDataError(error.message);
    });
  }, [dailyQuizState, dailyStateLoaded, setDataError, user]);

  function completeDailyTask(task) {
    const today = getTodayKey();
    setDailyProgress((current) => ({
      ...(current.date === today ? current : createDailyProgress(today)),
      date: today,
      [task]: true,
    }));
  }

  function resetDailyLearningState() {
    setDailyProgress(createDailyProgress());
    setDailyQuizState(null);
    setDailyStateLoaded(false);
  }

  return {
    completeDailyTask,
    dailyProgress,
    dailyQuizState,
    dailyStateLoaded,
    resetDailyLearningState,
    setDailyQuizState,
  };
}
