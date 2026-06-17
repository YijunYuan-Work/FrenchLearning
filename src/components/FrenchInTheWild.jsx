import { Headphones } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

export function FrenchInTheWild() {
  const { t } = useLanguage();

  return (
    <div className="rounded-md border border-frenchBlue/10 bg-paper p-4">
      <div className="mb-3 flex items-center gap-2">
        <Headphones size={18} className="text-brass" />
        <h3 className="font-bold">{t("frenchInTheWild", "French in the wild")}</h3>
      </div>
      <p className="text-sm leading-6 text-slate-700">
        {t(
          "frenchInTheWildCopy",
          "Keep short real-world snippets here: cafe menus, train signs, text messages, song lines, and anything you want to recognize faster next time."
        )}
      </p>
    </div>
  );
}
