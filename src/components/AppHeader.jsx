import { LogOut, Plus } from "lucide-react";
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
    <header className="border-b border-frenchBlue/10 bg-paper/70 px-4 py-4 backdrop-blur md:px-7">
      <div className="flex flex-col gap-3 xl:flex-row xl:items-center xl:justify-between">
        <div>
          <p className="text-sm font-semibold text-frenchRed">
            {t("personalWorkspace", "Personal French workspace")}
          </p>
          <h2 className="max-w-3xl text-2xl font-bold leading-tight md:text-3xl">
            {pageTitle}
          </h2>
        </div>
        <div className="flex flex-col gap-2 sm:flex-row">
          <LanguageToggle />
          {user && (
            <div className="flex h-10 items-center rounded-md border border-frenchBlue/10 bg-white px-3 text-sm font-semibold text-slate-600">
              {user.user_metadata?.name || user.email?.split("@")[0] || "Learner"}
            </div>
          )}
          <button
            className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-md bg-frenchRed px-4 text-sm font-semibold text-white hover:bg-frenchRed/90"
            onClick={() =>
              openNewItem(
                activeSection === "today" || activeSection === "review"
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
            className="focus-ring inline-flex h-10 items-center justify-center gap-2 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold text-slate-600 hover:text-frenchRed"
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
