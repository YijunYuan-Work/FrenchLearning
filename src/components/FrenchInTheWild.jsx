import { Headphones } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

export function FrenchInTheWild() {
  const { t } = useLanguage();

  return (
    <div className="rounded-xl bg-butter p-4 shadow-inset">
      <div className="mb-3 flex items-center gap-2">
        <Headphones size={18} className="text-brass" />
        <h3 className="font-black">{t("frenchInTheWild", "French in the wild")}</h3>
      </div>
      <p className="text-sm font-medium leading-6 text-slate-700">
        {t(
          "frenchInTheWildCopy",
          "Keep short real-world snippets here: cafe menus, train signs, text messages, song lines, and anything you want to recognize faster next time."
        )}
      </p>
    </div>
  );
}
