import { ChevronLeft, ChevronRight } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

export function PaginationControls({
  itemLabel = "items",
  itemsPerPage,
  onNext,
  onPrevious,
  page,
  totalItems,
  totalPages,
}) {
  const { t } = useLanguage();
  if (totalItems <= itemsPerPage) return null;

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-white/90 p-3 shadow-soft sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm font-semibold text-slate-600">
        {t("showingRange", "Showing {start}-{end} of {total} {label}", {
          start: (page - 1) * itemsPerPage + 1,
          end: Math.min(page * itemsPerPage, totalItems),
          total: totalItems,
          label: itemLabel,
        })}
      </p>
      <div className="flex gap-2">
        <button
          className="secondary-action h-9 px-3"
          disabled={page === 1}
          onClick={onPrevious}
          type="button"
        >
          <ChevronLeft size={16} />
          {t("previous", "Previous")}
        </button>
        <button
          className="secondary-action h-9 px-3"
          disabled={page === totalPages}
          onClick={onNext}
          type="button"
        >
          {t("next", "Next")}
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
