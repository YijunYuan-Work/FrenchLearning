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
    <header className="px-3 pb-4 pt-5 md:px-7 md:pb-5 md:pt-7">
      <div className="flex min-w-0 flex-col gap-4 xl:flex-row xl:items-end xl:justify-between">
        <div className="min-w-0">
          <p className="hidden items-center gap-2 text-sm font-medium text-frenchRed sm:inline-flex">
            <Sparkle size={15} />
            {t("personalWorkspace", "Personal French workspace")}
          </p>
          <h2 className="max-w-3xl break-words text-[1.35rem] font-light leading-[1.12] tracking-[-0.02em] sm:text-2xl md:text-3xl">
            {pageTitle}
          </h2>
        </div>
        <div className="grid grid-cols-2 gap-2 sm:flex sm:flex-row">
          <LanguageToggle />
          {user && (
            <div className="hidden h-10 items-center rounded-full border border-line bg-white px-3 text-sm font-medium text-inkSecondary shadow-sm sm:flex">
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
                  activeSection === "settings"
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
            className="secondary-action order-2 h-10 hover:border-frenchRed hover:bg-blush hover:text-frenchRed sm:order-none"
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
