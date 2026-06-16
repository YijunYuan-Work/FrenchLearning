import { ChevronLeft, ChevronRight } from "lucide-react";

export function PaginationControls({
  itemLabel = "items",
  itemsPerPage,
  onNext,
  onPrevious,
  page,
  totalItems,
  totalPages,
}) {
  if (totalItems <= itemsPerPage) return null;

  return (
    <div className="flex flex-col gap-2 rounded-md border border-frenchBlue/10 bg-paper p-3 sm:flex-row sm:items-center sm:justify-between">
      <p className="text-sm text-slate-600">
        Showing {(page - 1) * itemsPerPage + 1}-
        {Math.min(page * itemsPerPage, totalItems)} of {totalItems} {itemLabel}
      </p>
      <div className="flex gap-2">
        <button
          className="focus-ring inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          disabled={page === 1}
          onClick={onPrevious}
          type="button"
        >
          <ChevronLeft size={16} />
          Previous
        </button>
        <button
          className="focus-ring inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold disabled:cursor-not-allowed disabled:opacity-50"
          disabled={page === totalPages}
          onClick={onNext}
          type="button"
        >
          Next
          <ChevronRight size={16} />
        </button>
      </div>
    </div>
  );
}
