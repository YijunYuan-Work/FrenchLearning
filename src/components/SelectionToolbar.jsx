import { CheckSquare, Square, Trash2, X } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

export function SelectionToolbar({
  onClearSelection,
  onDeleteSelected,
  onSelectItems,
  selectedIds,
  visibleItems,
}) {
  const { t } = useLanguage();
  if (!visibleItems.length) return null;

  const visibleIds = visibleItems.map((item) => item.id);
  const allVisibleSelected = visibleIds.every((id) => selectedIds.includes(id));

  return (
    <div className="flex flex-col gap-2 rounded-xl border border-line bg-white/90 p-3 shadow-soft sm:flex-row sm:items-center sm:justify-between">
      <div className="flex flex-wrap items-center gap-2">
        <button
          className="secondary-action h-9 px-3 text-frenchBlue"
          onClick={() => onSelectItems(visibleIds, !allVisibleSelected)}
          type="button"
        >
          {allVisibleSelected ? <CheckSquare size={16} /> : <Square size={16} />}
          {allVisibleSelected
            ? t("unselectPage", "Unselect page")
            : t("selectPage", "Select page")}
        </button>
        <span className="text-sm font-semibold text-slate-600">
          {t("selectedCount", "{count} selected", { count: selectedIds.length })}
        </span>
      </div>
      <div className="flex flex-wrap gap-2">
        <button
          className="secondary-action h-9 px-3"
          disabled={selectedIds.length === 0}
          onClick={onClearSelection}
          type="button"
        >
          <X size={16} />
          {t("clearSelection", "Clear selection")}
        </button>
        <button
          className="focus-ring inline-flex h-9 items-center gap-2 rounded-lg bg-frenchRed px-3 text-sm font-bold text-white hover:bg-frenchRed/90 disabled:cursor-not-allowed disabled:opacity-50"
          disabled={selectedIds.length === 0}
          onClick={onDeleteSelected}
          type="button"
        >
          <Trash2 size={16} />
          {t("deleteSelected", "Delete selected")}
        </button>
      </div>
    </div>
  );
}
