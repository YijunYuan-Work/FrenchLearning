import { createContext, useContext, useEffect, useMemo } from "react";
import { zhCN } from "./zhCN";
import { useLanguagePreference } from "../hooks/useLanguagePreference";

const dictionaries = {
  en: {},
  zh: zhCN,
};

const LanguageContext = createContext(null);

export function LanguageProvider({ children, isDemo = false, userId, isCurrentAccount }) {
  const { language, setLanguage, languagePreferenceStatus, retryLanguagePreference } =
    useLanguagePreference({ userId, isDemo, isCurrentAccount });

  useEffect(() => {
    document.documentElement.lang = language === "zh" ? "zh-CN" : "en";
  }, [language]);

  const value = useMemo(
    () => ({
      language,
      setLanguage,
      languagePreferenceStatus,
      retryLanguagePreference,
      t(key, fallback, replacements = {}) {
        const template = dictionaries[language]?.[key] ?? fallback;
        return Object.entries(replacements).reduce(
          (text, [name, value]) => text.replaceAll(`{${name}}`, value),
          template
        );
      },
    }),
    [language, languagePreferenceStatus, retryLanguagePreference, setLanguage]
  );

  return (
    <LanguageContext.Provider value={value}>
      {children}
    </LanguageContext.Provider>
  );
}

export function useLanguage() {
  const context = useContext(LanguageContext);
  if (!context) {
    throw new Error("useLanguage must be used inside LanguageProvider.");
  }
  return context;
}
