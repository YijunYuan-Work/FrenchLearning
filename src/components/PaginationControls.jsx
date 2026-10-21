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
    <nav
      className="library-pagination"
      aria-label={t("pagination", "Pagination")}
    >
      <p>
        {t("libraryShowingRange", "Showing {start}-{end} of {total} {label}", {
          start: (page - 1) * itemsPerPage + 1,
          end: Math.min(page * itemsPerPage, totalItems),
          total: totalItems,
          label: itemLabel,
        })}
      </p>
      <div>
        <button
          className="text-action"
          disabled={page === 1}
          onClick={onPrevious}
          type="button"
        >
          <ChevronLeft size={16} />
          {t("libraryPreviousPage", "Previous")}
        </button>
        <span>
          {t("libraryPage", "Page {page} of {total}", {
            page,
            total: totalPages,
          })}
        </span>
        <button
          className="text-action"
          disabled={page === totalPages}
          onClick={onNext}
          type="button"
        >
          {t("libraryNextPage", "Next")}
          <ChevronRight size={16} />
        </button>
      </div>
    </nav>
  );
}
