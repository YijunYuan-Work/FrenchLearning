import { useLanguage } from "../i18n/LanguageContext";

export function LanguageToggle() {
  const { language, setLanguage } = useLanguage();

  return (
    <button
      className="focus-ring inline-flex h-10 items-center justify-center rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 hover:text-frenchBlue"
      onClick={() => setLanguage(language === "en" ? "zh" : "en")}
      type="button"
    >
      {language === "en" ? "简体中文" : "English"}
    </button>
  );
}
