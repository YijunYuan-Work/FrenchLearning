import { createContext, useContext, useMemo, useState } from "react";
import { zhCN } from "./zhCN";

const dictionaries = {
  en: {},
  zh: zhCN,
};

const LanguageContext = createContext(null);

export function LanguageProvider({ children }) {
  const [language, setLanguage] = useState(() => {
    try {
      return localStorage.getItem("french-learning-language") || "en";
    } catch {
      return "en";
    }
  });

  function changeLanguage(nextLanguage) {
    setLanguage(nextLanguage);
    try {
      localStorage.setItem("french-learning-language", nextLanguage);
    } catch {
      // Ignore storage failures; the in-memory toggle still works.
    }
  }

  const value = useMemo(
    () => ({
      language,
      setLanguage: changeLanguage,
      t(key, fallback, replacements = {}) {
        const template = dictionaries[language]?.[key] ?? fallback;
        return Object.entries(replacements).reduce(
          (text, [name, value]) => text.replaceAll(`{${name}}`, value),
          template
        );
      },
    }),
    [language]
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
