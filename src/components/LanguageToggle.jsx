import { useLanguage } from "../i18n/LanguageContext";

export function LanguageToggle() {
  const { language, setLanguage, t } = useLanguage();

  return (
    <div className="language-segment" role="group" aria-label={t("interfaceLanguage", "Interface language")}>
      <button aria-label="English" aria-pressed={language === "en"} lang="en" onClick={() => setLanguage("en")} type="button">EN</button>
      <button aria-label="简体中文" aria-pressed={language === "zh"} lang="zh-CN" onClick={() => setLanguage("zh")} type="button">中文</button>
    </div>
  );
}
