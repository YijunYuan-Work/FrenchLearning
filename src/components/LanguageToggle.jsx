import { useLanguage } from "../i18n/LanguageContext";

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <button
      className="secondary-action h-10 px-3"
      onClick={() => setLanguage(language === "en" ? "zh" : "en")}
      type="button"
    >
      {language === "en" ? "简体中文" : "English"}
    </button>
  );
}
