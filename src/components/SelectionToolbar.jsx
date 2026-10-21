import { CheckSquare, Square, Trash2, X } from "lucide-react";
import { useLanguage } from "../i18n/LanguageContext";

export function SelectionToolbar({
  isDeleting = false,
  onClearSelection,
  onDeleteSelected,
  onSelectItems,
  selectedIds,
  visibleItems,
}) {
  const { t } = useLanguage();
  const visibleIds = visibleItems.map((item) => item.id);
  const allSelected =
    visibleIds.length > 0 && visibleIds.every((id) => selectedIds.includes(id));
  return (
    <div className="library-selection-row">
      <button
        className="text-action library-select-page"
        disabled={isDeleting || !visibleIds.length}
        onClick={() => onSelectItems(visibleIds, !allSelected)}
        type="button"
      >
        {allSelected ? <CheckSquare size={16} /> : <Square size={16} />}
        {allSelected
          ? t("unselectPage", "Unselect page")
          : t("selectPage", "Select page")}
      </button>
      {selectedIds.length > 0 && (
        <div
          className="library-selection-bar"
          role="region"
          aria-label={t("selectedNotes", "Selected notes")}
        >
          <span aria-live="polite">
            {t("selectedCount", "{count} selected", {
              count: selectedIds.length,
            })}
          </span>
          <button
            disabled={isDeleting}
            onClick={onClearSelection}
            type="button"
          >
            <X size={16} />
            {t("clearSelection", "Clear selection")}
          </button>
          <button
            className="library-danger"
            disabled={isDeleting}
            onClick={onDeleteSelected}
            type="button"
          >
            <Trash2 size={16} />
            {t("deleteSelected", "Delete selected")}
          </button>
        </div>
      )}
    </div>
  );
}
