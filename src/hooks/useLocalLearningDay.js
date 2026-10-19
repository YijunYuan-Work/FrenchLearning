import { useEffect, useState } from "react";
import { getTodayKey } from "../utils/quiz";

export function useLocalLearningDay() {
  const [day, setDay] = useState(getTodayKey);
  useEffect(() => {
    let midnight;
    function checkDay() {
      setDay(getTodayKey());
      clearTimeout(midnight);
      const next = new Date();
      next.setHours(24, 0, 0, 0);
      midnight = setTimeout(checkDay, Math.max(1, next.getTime() - Date.now()));
    }
    checkDay();
    // Resume events handle suspended timers; the interval catches clock/timezone changes.
    const interval = setInterval(checkDay, 60_000);
    window.addEventListener("focus", checkDay);
    window.addEventListener("pageshow", checkDay);
    document.addEventListener("visibilitychange", checkDay);
    return () => {
      clearTimeout(midnight);
      clearInterval(interval);
      window.removeEventListener("focus", checkDay);
      window.removeEventListener("pageshow", checkDay);
      document.removeEventListener("visibilitychange", checkDay);
    };
  }, []);
  return day;
}
