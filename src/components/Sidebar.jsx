import { Menu, Sparkles, X } from "lucide-react";
import { useState } from "react";
import { categories } from "../data/categories";
import { useLanguage } from "../i18n/LanguageContext";

export function Sidebar({ activeSection, setActiveSection }) {
  const { t } = useLanguage();
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);
  const activeCategory = categories[activeSection] ?? categories.today;
  const ActiveIcon = activeCategory.icon;

  return (
    <aside className="fixed inset-x-0 top-0 z-30 border-b border-line bg-white/92 shadow-soft backdrop-blur md:inset-y-0 md:right-auto md:w-64 md:border-b-0 md:border-r">
      <div className="flex h-full flex-col gap-2 px-3 py-2 sm:px-4 md:px-4 md:py-5">
        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2 lg:gap-3">
            <div className="grid size-10 place-items-center rounded-xl bg-frenchBlue text-white shadow-soft">
              <Sparkles size={20} />
            </div>
            <div className="min-w-0">
              <p className="truncate text-xs font-bold text-frenchRed">
                {t("frenchDesk", "French Desk")}
              </p>
              <h1 className="truncate text-lg font-black tracking-[-0.01em] sm:text-xl">
                {t("learningHub", "Learning Hub")}
              </h1>
            </div>
          </div>

          <button
            aria-expanded={isMobileMenuOpen}
            className="focus-ring inline-flex h-10 shrink-0 cursor-pointer items-center gap-2 rounded-full border border-line bg-white px-3 text-sm font-medium text-ink shadow-sm md:hidden"
            onClick={() => setIsMobileMenuOpen((current) => !current)}
            type="button"
          >
            <ActiveIcon size={16} className="text-frenchBlue" />
            <span>{t(activeCategory.labelKey, activeCategory.label)}</span>
            {isMobileMenuOpen ? <X size={16} /> : <Menu size={16} />}
          </button>
        </div>

        <nav
          className={`grid max-w-full gap-1.5 border-t border-line pt-2 md:mt-5 md:flex-1 md:content-start md:border-t-0 md:pt-0 ${
            isMobileMenuOpen ? "" : "hidden md:grid"
          }`}
        >
          {Object.entries(categories).map(([key, item]) => {
            const Icon = item.icon;
            const isActive = activeSection === key;
            return (
              <button
                className={`focus-ring flex min-h-10 cursor-pointer items-center gap-2 rounded-xl px-3 text-left text-sm font-medium transition ${
                  isActive
                    ? "bg-frenchBlue text-white shadow-soft"
                    : "text-inkSecondary hover:bg-sky hover:text-frenchBlue"
                }`}
                key={key}
                onClick={() => {
                  setActiveSection(key);
                  setIsMobileMenuOpen(false);
                }}
                type="button"
              >
                <Icon size={17} />
                <span className="whitespace-nowrap">{t(item.labelKey, item.label)}</span>
              </button>
            );
          })}
        </nav>
      </div>
    </aside>
  );
}
