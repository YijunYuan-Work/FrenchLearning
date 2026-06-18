import { ListChecks } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

export function PracticeQueue({ items, markReviewed }) {
  const { t } = useLanguage();

  return (
    <div className="app-card p-4">
      <div className="mb-3 flex items-center justify-between gap-2">
        <div className="flex items-center gap-2">
          <ListChecks size={18} className="text-frenchRed" />
          <h3 className="font-black">{t("reviewQueue", "Review queue")}</h3>
        </div>
        <span className="rounded-full bg-blush px-2 py-1 text-xs font-black text-frenchRed">
          {items.length}
        </span>
      </div>
      <div className="grid gap-2">
        {items.slice(0, 4).map((item) => (
          <button
            className="focus-ring rounded-xl border border-line bg-white p-3 text-left transition hover:border-frenchBlue/35 hover:bg-sky/45"
            key={item.id}
            onClick={() => markReviewed(item, 1)}
            type="button"
          >
            <p className="font-black">{item.french}</p>
            <p className="text-sm text-slate-600">{item.english}</p>
          </button>
        ))}
        {items.length === 0 && (
          <p className="rounded-xl bg-mint p-3 text-sm font-semibold text-sage">
            {t("wildEmptyQueue", "Your weak-item queue is clear.")}
          </p>
        )}
      </div>
    </div>
  );
}
