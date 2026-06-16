import { CheckSquare, Square, Trash2, X } from "lucide-react";

export function SelectionToolbar({
  onClearSelection,
  onDeleteSelected,
  onSelectItems,
  selectedIds,
  visibleItems,
}) {
  if (!visibleItems.length) return null;

  const visibleIds = visibleItems.map((item) => item.id);
  const allVisibleSelected = visibleIds.every((id) => selectedIds.includes(id));

  return (
    <div className="flex flex-col gap-2 rounded-md border border-frenchBlue/10 bg-paper p-3 sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="focus-ring inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-frenchBlue hover:border-frenchBlue/30"
          onClick={() => onSelectItems(visibleIds, !allVisibleSelected)}
          type="button"
        >
          {allVisibleSelected ? <CheckSquare size={16} /> : <Square size={16} />}
          {allVisibleSelected ? "Unselect page" : "Select page"}
        </button>
        <span className="text-sm text-slate-600">
          {selectedIds.length} selected
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className="focus-ring inline-flex h-9 items-center gap-2 rounded-md border border-slate-200 bg-white px-3 text-sm font-semibold text-slate-600 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={selectedIds.length === 0}
          onClick={onClearSelection}
          type="button"
        >
          <X size={16} />
          Clear selection
        </button>
        <button
          className="focus-ring inline-flex h-9 items-center gap-2 rounded-md bg-frenchRed px-3 text-sm font-semibold text-white disabled:cursor-not-allowed disabled:opacity-50"
          disabled={selectedIds.length === 0}
          onClick={onDeleteSelected}
          type="button"
        >
          <Trash2 size={16} />
          Delete selected
        </button>
      </div>
    </div>
  );
}
