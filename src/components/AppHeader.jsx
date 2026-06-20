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
  const displayName =
    user?.user_metadata?.name ||
    user?.user_metadata?.username ||
    user?.email?.split("@")[0] ||
    "Learner";

  return (
    <header className="border-b border-line bg-cloud/90 px-4 py-3 backdrop-blur md:px-7 md:py-4">
      <div className="flex min-w-0 flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div className="min-w-0">
          <p className="hidden items-center gap-2 text-sm font-bold text-frenchRed sm:inline-flex">
            <Sparkle size={15} />
            {t("personalWorkspace", "Personal French workspace")}
          </p>
          <h2 className="max-w-3xl break-words text-xl font-black leading-tight tracking-[-0.01em] sm:text-2xl md:text-3xl">
            {pageTitle}
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row">
          <LanguageToggle />
          {user && (
            <div className="hidden h-10 items-center rounded-lg border border-line bg-white px-3 text-sm font-bold text-slate-600 shadow-sm sm:flex">
              {displayName}
            </div>
          )}
          <button
            className="primary-action order-3 col-span-2 h-10 sm:order-none sm:col-span-1"
            onClick={() =>
              openNewItem(
                activeSection === "today" ||
                  activeSection === "review" ||
                  activeSection === "quiz" ||
                  activeSection === "import" ||
                  activeSection === "profile"
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
            className="secondary-action order-2 h-10 hover:text-frenchRed sm:order-none"
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
