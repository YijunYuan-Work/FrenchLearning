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
    <div className="flex flex-col gap-2 rounded-md border border-frenchBlue/10 bg-paper p-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-600">
        {t("showingRange", "Showing {start}-{end} of {total} {label}", {
          start: (page - 1) * itemsPerPage + 1,
          end: Math.min(page * itemsPerPage, totalItems),
          total: totalItems,
          label: itemLabel,
        })}
      </p>
      <div className="flex gap-2">
        <button
          className="focus-ring inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          disabled={page === 1}
          onClick={onPrevious}
          type="button"
        >
          <ChevronLeft size={16} />
          {t("previous", "Previous")}
        </button>
        <button
          className="focus-ring inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
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
