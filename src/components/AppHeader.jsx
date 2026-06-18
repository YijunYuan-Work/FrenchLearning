import { LogOut, Plus, Sparkle } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";
import { LanguageToggle } from "./LanguageToggle";

export function AppHeader({
  activeSection,
  onSignOut,
  openNewItem,
  pageTitle,
  user,
}) {
  const { t } = useLanguage();

  return (
    <header className="border-b border-line bg-cloud/80 px-4 py-4 backdrop-blur md:px-7">
      <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="inline-flex items-center gap-2 text-sm font-bold text-frenchRed">
            <Sparkle size={15} />
            {t("personalWorkspace", "Personal French workspace")}
          </p>
          <h2 className="max-w-3xl break-words text-2xl font-black leading-tight tracking-[-0.01em] md:text-3xl">
            {pageTitle}
          </h2>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <LanguageToggle />
          {user && (
            <div className="flex h-10 items-center rounded-lg border border-line bg-white px-3 text-sm font-bold text-slate-600 shadow-sm">
              {user.user_metadata?.name || user.email?.split("@")[0] || "Learner"}
            </div>
          )}
          <button
            className="primary-action h-10"
            onClick={() =>
              openNewItem(
                activeSection === "today" ||
                  activeSection === "review" ||
                  activeSection === "quiz" ||
                  activeSection === "import"
                  ? "vocabulary"
                  : activeSection
              )
            }
            type="button"
          >
            <Plus size={17} />
            {t("addNote", "Add note")}
          </button>
          <button
            className="secondary-action h-10 hover:text-frenchRed"
            onClick={onSignOut}
            type="button"
          >
            <LogOut size={17} />
            {t("signOut", "Sign out")}
          </button>
        </div>
      </div>
    </header>
  );
}
