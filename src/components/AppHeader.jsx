import { Plus } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { Brand } from "./Brand";

export function AppHeader({ activeSection, openNewItem, pageTitle, learningDay }) {
  const { language, t } = useLanguage();
  const date = new Date(`${learningDay}T12:00:00`);
  const dateLabel = date.toLocaleDateString(language === "zh" ? "zh-CN" : "fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return (
    <header className="cahier-header">
      <div className="cahier-header-row">
        <div className="cahier-mobile-brand"><Brand compact /></div>
        <p className="eyebrow cahier-workspace-label">{t("personalWorkspace", "Personal French workspace")}</p>
        <div className="cahier-header-actions">
          <time dateTime={learningDay} lang={language === "zh" ? "zh-CN" : "fr"}>{dateLabel}</time>
          <button
            aria-label={t("addNote", "Add note")}
            className="primary-action cahier-add-note"
            onClick={() => openNewItem(["today", "review", "quiz", "import", "settings"].includes(activeSection) ? "vocabulary" : activeSection)}
            title={t("addNote", "Add note")}
            type="button"
          >
            <Plus size={17} aria-hidden="true" /><span>{t("addNote", "Add note")}</span>
          </button>
        </div>
      </div>
      <div className="editorial-rule" />
      {activeSection !== "today" && activeSection !== "review" && <h2 className="cahier-page-title editorial-title">{pageTitle}</h2>}
    </header>
  );
}
