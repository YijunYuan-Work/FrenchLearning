import { useEffect, useState } from "react";
import {
  getDailyLearningState,
  updateDailyProgress,
  updateDailyQuizState,
  updateDailyStudyState,
} from "../api/dailyLearning";
import { createDailyProgress } from "../utils/dailyProgress";
import { getTodayKey } from "../utils/quiz";

export function useDailyLearningState(user, setDataError) {
  const [dailyProgress, setDailyProgress] = useState(() =>
    createDailyProgress()
  );
  const [dailyQuizState, setDailyQuizState] = useState(null);
  const [dailyStudyState, setDailyStudyState] = useState(null);
  const [dailyStateLoaded, setDailyStateLoaded] = useState(false);

  useEffect(() => {
    if (!user?.id) {
      setDailyStateLoaded(false);
      return undefined;
    }

    let isMounted = true;
    const today = getTodayKey();

    setDailyStateLoaded(false);
    getDailyLearningState(user.id, today)
      .then(({ progress, quizState, studyState }) => {
        if (!isMounted) return;
        setDailyProgress(progress);
        setDailyQuizState(quizState);
        setDailyStudyState(studyState);
        setDailyStateLoaded(true);
      })
      .catch((error) => {
        if (!isMounted) return;
        setDailyProgress(createDailyProgress(today));
        setDailyQuizState(null);
        setDailyStudyState(null);
        setDailyStateLoaded(true);
        setDataError(error.message);
      });

    return () => {
      isMounted = false;
    };
  }, [setDataError, user?.id]);

  useEffect(() => {
    if (!user?.id || !dailyStateLoaded) return;
    updateDailyProgress(user.id, dailyProgress).catch((error) => {
      setDataError(error.message);
    });
  }, [dailyProgress, dailyStateLoaded, setDataError, user?.id]);

  useEffect(() => {
    if (!user?.id || !dailyStateLoaded || !dailyQuizState) return;
    updateDailyQuizState(user.id, dailyQuizState).catch((error) => {
      setDataError(error.message);
    });
  }, [dailyQuizState, dailyStateLoaded, setDataError, user?.id]);

  useEffect(() => {
    if (!user?.id || !dailyStateLoaded || !dailyStudyState) return;
    updateDailyStudyState(user.id, dailyStudyState).catch((error) => {
      setDataError(error.message);
    });
  }, [dailyStateLoaded, dailyStudyState, setDataError, user?.id]);

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
    setDailyStudyState(null);
    setDailyStateLoaded(false);
  }

  return {
    completeDailyTask,
    dailyProgress,
    dailyQuizState,
    dailyStudyState,
    dailyStateLoaded,
    resetDailyLearningState,
    setDailyQuizState,
    setDailyStudyState,
  };
}
