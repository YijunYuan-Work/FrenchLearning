import { Bold, Italic, List, ListOrdered, Underline } from "lucide-react";
import { useEffect, useId, useRef } from "react";
import {
  isRichTextEmpty,
  plainTextToRichText,
  richTextDisplayHtml,
  sanitizeRichTextHtml,
} from "../utils/richText";

const toolbarButtons = [
  { command: "bold", icon: Bold, labelKey: "bold", label: "Bold" },
  { command: "italic", icon: Italic, labelKey: "italic", label: "Italic" },
  { command: "underline", icon: Underline, labelKey: "underline", label: "Underline" },
  {
    command: "insertUnorderedList",
    icon: List,
    labelKey: "bulletList",
    label: "Bullet list",
  },
  {
    command: "insertOrderedList",
    icon: ListOrdered,
    labelKey: "numberedList",
    label: "Numbered list",
  },
];

function insertHtml(html) {
  document.execCommand("insertHTML", false, html);
}

export function RichTextEditor({ label, onChange, placeholder, t, value }) {
  const editorRef = useRef(null);
  const labelId = useId();

  useEffect(() => {
    const editor = editorRef.current;
    if (!editor || document.activeElement === editor) return;

    const nextHtml = richTextDisplayHtml(value);
    if (editor.innerHTML !== nextHtml) {
      editor.innerHTML = nextHtml;
    }
  }, [value]);

  function emitChange() {
    const editor = editorRef.current;
    if (!editor) return;

    const nextHtml = sanitizeRichTextHtml(editor.innerHTML);
    onChange(isRichTextEmpty(nextHtml) ? "" : nextHtml);
  }

  function runCommand(command, trigger) {
    editorRef.current?.focus();
    document.execCommand(command, false);
    emitChange();
    trigger?.blur();
    editorRef.current?.focus();
  }

  function handlePaste(event) {
    event.preventDefault();
    const html = event.clipboardData.getData("text/html");
    const text = event.clipboardData.getData("text/plain");
    const nextHtml = html ? sanitizeRichTextHtml(html) : plainTextToRichText(text);

    if (nextHtml) {
      insertHtml(nextHtml);
      emitChange();
    }
  }

  return (
    <div className="grid gap-1 text-sm font-bold md:col-span-2">
      <span id={labelId}>{label}</span>
      <div className="rounded-xl border border-line bg-white shadow-sm">
        <div className="flex flex-wrap gap-1 border-b border-line bg-sky/35 p-2">
          {toolbarButtons.map((button) => {
            const Icon = button.icon;
            return (
              <button
                aria-label={t(button.labelKey, button.label)}
                className="focus-ring inline-flex size-8 items-center justify-center rounded-lg border border-line bg-white text-slate-700 hover:bg-sky"
                key={button.command}
                onClick={(event) => runCommand(button.command, event.currentTarget)}
                onMouseDown={(event) => event.preventDefault()}
                onPointerDown={(event) => {
                  if (event.pointerType !== "keyboard") {
                    event.preventDefault();
                  }
                }}
                title={t(button.labelKey, button.label)}
                type="button"
              >
                <Icon size={16} />
              </button>
            );
          })}
        </div>
        <div
          aria-labelledby={labelId}
          className="rich-text-editor focus-ring min-h-56 rounded-b-xl px-3 py-2 font-normal outline-none"
          contentEditable
          data-placeholder={placeholder}
          onBlur={emitChange}
          onInput={emitChange}
          onPaste={handlePaste}
          ref={editorRef}
          role="textbox"
          suppressContentEditableWarning
          tabIndex={0}
        />
      </div>
    </div>
  );
}

export function RichTextContent({ html }) {
  return (
    <div
      className="rich-text-content mt-1 text-sm leading-6 text-slate-800"
      dangerouslySetInnerHTML={{ __html: richTextDisplayHtml(html) }}
    />
  );
}
