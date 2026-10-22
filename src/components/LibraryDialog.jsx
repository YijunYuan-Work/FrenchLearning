import { X } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import { useLanguage } from "../i18n/LanguageContext";

export function LibraryDialog({ children, title, onClose, confirm = false }) {
  const { t } = useLanguage();
  const id = useId();
  const dialogRef = useRef(null);
  const closeRef = useRef(onClose);
  closeRef.current = onClose;
  useEffect(() => {
    const dialog = dialogRef.current;
    const trigger = document.activeElement;
    dialog.showModal();
    return () => {
      dialog.close();
      if (trigger?.isConnected && trigger.getClientRects().length)
        trigger.focus({ preventScroll: true });
    };
  }, []);
  return (
    <dialog
      className={`library-dialog${confirm ? " library-confirm" : " library-sheet"}`}
      ref={dialogRef}
      role={confirm ? "alertdialog" : "dialog"}
      aria-modal="true"
      aria-labelledby={id}
      onCancel={(event) => {
        event.preventDefault();
        closeRef.current();
      }}
      onClick={(event) => {
        if (event.target === event.currentTarget) closeRef.current();
      }}
    >
      <div className="library-dialog-heading">
        <h2 className="editorial-title" id={id}>
          {title}
        </h2>
        <button
          className="icon-action"
          aria-label={t("close", "Close")}
          onClick={onClose}
          type="button"
        >
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
