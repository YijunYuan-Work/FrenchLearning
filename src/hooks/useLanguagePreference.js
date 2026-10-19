import { useEffect, useState } from "react";
import { getLanguagePreference, updateLanguagePreference } from "../api/preferences";
import { isPublicDemoRoute } from "../utils/demoMode";
import { createLanguagePreferenceSync, isSupportedLanguage } from "../utils/languagePreference";

const alwaysCurrent = () => true;
const cacheKey = (userId) => `french-learning-language${userId ? `:${userId}` : ""}`;

function readCachedLanguage(userId, isDemo) {
  if (isDemo) return "en";
  try {
    const saved = localStorage.getItem(cacheKey(userId));
    return isSupportedLanguage(saved) ? saved : "en";
  } catch {
    return "en";
  }
}

// LanguageProvider is keyed by the Auth generation, including A -> B -> A.
export function useLanguagePreference({ userId, isDemo, isCurrentAccount = alwaysCurrent }) {
  const [language, setLanguage] = useState(() => readCachedLanguage(userId, isDemo));
  const [status, setStatus] = useState({ loading: false, saving: false, error: null });
  const [sync] = useState(() => createLanguagePreferenceSync({
    isCurrent: isCurrentAccount,
    load: () => userId && !isDemo
      ? getLanguagePreference(userId, { isCurrent: isCurrentAccount }) : Promise.resolve(language),
    save: (value) => userId && !isDemo
      ? updateLanguagePreference(userId, value, { isCurrent: isCurrentAccount }) : Promise.resolve(value),
    onStatus: setStatus,
    onLanguage: (value) => {
      setLanguage(value);
      if (isDemo || isPublicDemoRoute()) return;
      try {
        localStorage.setItem(cacheKey(userId), value);
      } catch {
        // The cache is optional; Supabase remains authoritative for accounts.
      }
    },
  }));

  useEffect(() => {
    sync.activate();
    return () => sync.deactivate();
  }, [sync]);

  return { language, setLanguage: sync.select, languagePreferenceStatus: status, retryLanguagePreference: sync.retry };
}
