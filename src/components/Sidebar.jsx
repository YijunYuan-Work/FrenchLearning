import { BookOpen, CalendarDays, CircleHelp, ListChecks, Menu, X } from "lucide-react";
import { useEffect, useRef, useState } from "react";
import { categories } from "../data/categories";
import { useLanguage } from "../i18n/LanguageContext";
import { getDisplayName } from "../utils/accountIdentity";
import { Brand } from "./Brand";
import { LanguageToggle } from "./LanguageToggle";

const groups = [
  { label: "Pratique", keys: ["today", "review", "quiz"] },
  { label: "Le cahier", keys: ["vocabulary", "phrases", "grammar", "pronunciation"] },
  { label: "Bureau", keys: ["import", "settings"] },
];
const glosses = ["aujourd'hui", "étude", "dictée", "mots", "expressions", "grammaire", "phonétique"];
const sectionKeys = Object.keys(categories);

export function Sidebar({ activeSection, setActiveSection, isDemo, onSignOut, user }) {
  const { t } = useLanguage();
  const [panel, setPanel] = useState(null);
  const dialogRef = useRef(null);
  const displayName = getDisplayName(user);
  const notesActive = groups[1].keys.includes(activeSection);
  const moreActive = groups[2].keys.includes(activeSection);

  useEffect(() => {
    if (!panel) return undefined;
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    dialog.showModal();
    const desktop = window.matchMedia("(min-width: 1024px)");
    const closeOnDesktop = () => { if (desktop.matches) setPanel(null); };
    desktop.addEventListener("change", closeOnDesktop);
    return () => {
      desktop.removeEventListener("change", closeOnDesktop);
      dialog.close();
      if (trigger?.isConnected && trigger.getClientRects().length > 0) trigger.focus();
    };
  }, [panel]);

  function navigate(key) {
    setActiveSection(key);
    setPanel(null);
  }

  function navItem(key, inSheet = false) {
    const item = categories[key];
    const index = sectionKeys.indexOf(key);
    const label = t(item.labelKey, item.label);
    return (
      <button
        aria-current={activeSection === key ? "page" : undefined}
        aria-label={label}
        className={`cahier-nav-item${activeSection === key ? " is-active" : ""}`}
        key={key}
        onClick={() => navigate(key)}
        title={label}
        type="button"
      >
        <span className="cahier-nav-number" aria-hidden="true">{String(index + 1).padStart(2, "0")}</span>
        <span className={inSheet ? "" : "cahier-nav-label"}>{key === "pronunciation" ? t("navPronunciation", "Pronunciation") : label}</span>
        {glosses[index] && <span className="cahier-nav-gloss" aria-hidden="true" lang="fr">{glosses[index]}</span>}
      </button>
    );
  }

  const accountControls = (
    <div className="cahier-account">
      <LanguageToggle />
      <div className="cahier-account-row">
        <button className="text-action account-name" onClick={() => navigate("settings")} title={displayName} type="button">{displayName}</button>
        {!isDemo && <button className="text-action sign-out" onClick={onSignOut} type="button">{t("signOut", "Sign out")}</button>}
      </div>
    </div>
  );

  return (
    <>
      <aside className="cahier-sidebar">
        <div className="cahier-sidebar-brand">
          <Brand />
          <img className="cahier-rail-brand cahier-brand-icon" alt="French Desk" src="/brand/icon-192.png" width="32" height="32" />
          <span className="eyebrow cahier-brand-caption">{t("learningHub", "Learning Hub")}</span>
        </div>
        <nav className="cahier-desktop-nav" aria-label={t("mainNavigation", "Main navigation")}>
          {groups.map((group) => (
            <div className="cahier-nav-group" key={group.label}>
              <span className="cahier-nav-group-title" lang="fr" aria-hidden="true">{group.label}</span>
              {group.keys.map((key) => navItem(key))}
            </div>
          ))}
        </nav>
        <div className="cahier-sidebar-account">{accountControls}</div>
        <button className="cahier-rail-more icon-action" onClick={() => setPanel("more")} aria-label={t("more", "More")} type="button"><Menu size={20} /></button>
      </aside>

      <nav className="cahier-mobile-nav" aria-label={t("mainNavigation", "Main navigation")}>
        {[["today", CalendarDays], ["review", ListChecks], ["quiz", CircleHelp]].map(([key, Icon]) => (
          <button aria-current={activeSection === key ? "page" : undefined} key={key} onClick={() => navigate(key)} type="button">
            <Icon size={20} aria-hidden="true" /><span>{t(categories[key].labelKey, categories[key].label)}</span>
          </button>
        ))}
        <button aria-expanded={panel === "notes"} aria-haspopup="dialog" aria-current={notesActive ? "page" : undefined} onClick={() => setPanel("notes")} type="button"><BookOpen size={20} aria-hidden="true" /><span>{t("navNotes", "Notes")}</span></button>
        <button aria-expanded={panel === "more"} aria-haspopup="dialog" aria-current={moreActive ? "page" : undefined} onClick={() => setPanel("more")} type="button"><Menu size={20} aria-hidden="true" /><span>{t("more", "More")}</span></button>
      </nav>

      {panel && (
        <dialog className="cahier-nav-sheet" ref={dialogRef} aria-labelledby="navigation-sheet-title" onCancel={() => setPanel(null)} onClick={(event) => { if (event.target === event.currentTarget) setPanel(null); }}>
          <div className="cahier-sheet-heading">
            <h2 id="navigation-sheet-title" className="editorial-title">{panel === "notes" ? t("navNotes", "Notes") : t("more", "More")}</h2>
            <button className="icon-action" aria-label={t("close", "Close")} onClick={() => setPanel(null)} type="button"><X size={20} /></button>
          </div>
          <nav aria-label={panel === "notes" ? t("navNotes", "Notes") : t("more", "More")}>
            {(panel === "notes" ? groups[1].keys : groups[2].keys).map((key) => navItem(key, true))}
          </nav>
          {panel === "more" && accountControls}
        </dialog>
      )}
    </>
  );
}
