import { Plus } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { Brand } from "./Brand";

const libraryChapters = { vocabulary: ["04", "mots", "Vocabulary"], phrases: ["05", "expressions", "Phrases"], grammar: ["06", "grammaire", "Grammar"], pronunciation: ["07", "phonétique", "Pronunciation"] };

export function AppHeader({ activeSection, openNewItem, pageTitle, learningDay }) {
  const { language, t } = useLanguage();
  const chapter = libraryChapters[activeSection];
  const title = activeSection === "pronunciation" ? t("navPronunciation", "Pronunciation") : pageTitle;
  const heading = chapter && language === "zh" ? <>{chapter[2]} <span className="library-title-translation">{title}</span></> : title;
  const date = new Date(`${learningDay}T12:00:00`);
  const dateLabel = date.toLocaleDateString(language === "zh" ? "zh-CN" : "fr-FR", { weekday: "long", day: "numeric", month: "long", year: "numeric" });
  return (
    <header className={`cahier-header${chapter ? " library-header" : ""}`}>
      <div className="cahier-header-row">
        <div className="cahier-mobile-brand">{chapter ? <div className="library-mobile-heading"><p className="eyebrow">{t("notebook", "Notebook")} · {chapter[0]}</p><h2 aria-label={pageTitle} className="editorial-title">{heading}</h2></div> : <Brand compact />}</div>
        <p className="eyebrow cahier-workspace-label">{chapter ? `${t("notebook", "Notebook")} · ${chapter[0]}` : t("personalWorkspace", "Personal French workspace")}</p>
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
      {!["today", "review", "quiz"].includes(activeSection) && <h2 aria-label={chapter ? pageTitle : undefined} className={`cahier-page-title editorial-title${chapter ? " library-heading" : ""}`}>{heading}{chapter && language !== "zh" && <em lang="fr"> · {chapter[1]}</em>}</h2>}
    </header>
  );
}
