import { Loader2, Sparkles, X } from "lucide-react";
import { useEffect, useId, useRef, useState } from "react";
import { categoryOptions } from "../data/categories";
import {
  conjugationPronouns,
  createEmptyAdjectiveForms,
  createEmptyConjugation,
  genderOptions,
  partOfSpeechOptions,
} from "../data/wordFields";
import { useLanguage } from "../i18n/LanguageContext";
import { autoFillFrenchVocabulary } from "../services/vocabularyAutofill";
import { FrenchCharacterKeyboard } from "./FrenchCharacterKeyboard";

const inputClass =
  "focus-ring h-10 rounded-lg border border-line bg-white px-3 font-normal shadow-sm";
const labelClass = "grid gap-1 text-sm font-bold";

export function EditorModal({
  error,
  form,
  onChange,
  onClose,
  onSave,
  setForm,
  title,
}) {
  const { language, t } = useLanguage();
  const frenchInputId = useId();
  const isGrammarNote = form.category === "grammar";
  const isPhraseNote = form.category === "phrases";
  const usesSimpleFullWidthForm = isGrammarNote || isPhraseNote;
  const titleLabel = isGrammarNote
    ? t("title", "Title")
    : isPhraseNote
      ? t("originalFrench", "Original French")
      : t("french", "French");
  const titlePlaceholder = isGrammarNote
    ? t("grammarTitlePlaceholder", "e.g. Prepositions before cities and countries")
    : isPhraseNote
      ? t("phraseFrenchPlaceholder", "e.g. À bientôt !")
      : "e.g. boulangerie, parler, heureux";
  const modalRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const previousFocusRef = useRef(null);
  const frenchInputRef = useRef(null);
  const [autoFillState, setAutoFillState] = useState({
    status: "idle",
    message: "",
  });

  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  useEffect(() => {
    const modal = modalRef.current;
    const focusableSelector =
      'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])';
    previousFocusRef.current = document.activeElement;

    function focusInitialControl() {
      frenchInputRef.current?.focus();
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        event.preventDefault();
        onCloseRef.current();
        return;
      }

      if (event.key !== "Tab" || !modal) return;

      const focusable = Array.from(modal.querySelectorAll(focusableSelector)).filter(
        (element) => !element.disabled && element.offsetParent !== null
      );
      if (focusable.length === 0) return;

      const first = focusable[0];
      const last = focusable[focusable.length - 1];

      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }

    focusInitialControl();
    document.addEventListener("keydown", handleKeyDown);

    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      previousFocusRef.current?.focus?.();
    };
  }, []);

  function updateField(field, value) {
    onChange?.();
    if (field === "french") {
      setForm((current) => ({ ...current, french: value }));
      setAutoFillState({ status: "idle", message: "" });
      return;
    }

    setForm((current) => ({ ...current, [field]: value }));
  }

  function insertFrenchCharacter(character) {
    const input = frenchInputRef.current;
    const start = input?.selectionStart ?? form.french.length;
    const end = input?.selectionEnd ?? form.french.length;
    const nextValue = `${form.french.slice(0, start)}${character}${form.french.slice(end)}`;

    updateField("french", nextValue);

    requestAnimationFrame(() => {
      input?.focus();
      const cursor = start + character.length;
      input?.setSelectionRange(cursor, cursor);
    });
  }

  function updateConjugation(pronoun, value) {
    setForm((current) => ({
      ...current,
      conjugation: {
        ...createEmptyConjugation(),
        ...(current.conjugation ?? {}),
        [pronoun]: value,
      },
    }));
  }

  function updateAdjectiveForm(field, value) {
    setForm((current) => ({
      ...current,
      adjectiveForms: {
        ...createEmptyAdjectiveForms(),
        ...(current.adjectiveForms ?? {}),
        [field]: value,
      },
    }));
  }

  async function handleAutoFill() {
    setAutoFillState({
      status: "loading",
      message: t("autoFillLoading", "Asking AI to build the vocabulary note..."),
    });

    try {
      const result = await autoFillFrenchVocabulary(form.french, language);
      setForm((current) => ({
        ...current,
        category: result.category,
        french: result.word,
        partOfSpeech: result.partOfSpeech,
        ipa: result.ipa,
        gender: result.gender,
        conjugation: result.conjugation ?? createEmptyConjugation(),
        adjectiveForms: result.adjectiveForms ?? createEmptyAdjectiveForms(),
        english: result.english,
        example: result.example,
        notes: result.notes,
        tags: (result.tags ?? []).join(", "),
      }));
      setAutoFillState({
        status: "success",
        message: t(
          "autoFillSuccess",
          "Auto-filled. Review the details before saving."
        ),
      });
    } catch (error) {
      setAutoFillState({
        status: "error",
        message: error.message,
      });
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-4 backdrop-blur-sm">
      <form
        aria-labelledby="editor-modal-title"
        aria-modal="true"
        className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-xl bg-paper p-5 shadow-lift"
        onSubmit={onSave}
        ref={modalRef}
        role="dialog"
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-black tracking-[-0.01em]" id="editor-modal-title">{title}</h2>
          <button
            aria-label={t("closeEditor", "Close editor")}
            className="focus-ring grid size-9 place-items-center rounded-lg border border-line bg-white"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {error && (
            <p className="rounded-xl bg-blush px-3 py-2 text-sm font-bold text-frenchRed md:col-span-2">
              {error}
            </p>
          )}

          <label className={labelClass}>
            {t("section", "Section")}
            <select
              className={inputClass}
              onChange={(event) => updateField("category", event.target.value)}
              value={form.category}
            >
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {t(option.labelKey, option.label)}
                </option>
              ))}
            </select>
          </label>
          <label className={labelClass}>
            {t("confidence", "Confidence")}
            <select
              className={inputClass}
              onChange={(event) =>
                updateField("confidence", event.target.value)
              }
              value={form.confidence}
            >
              <option value="1">{t("confidenceNeedsPractice", "Needs practice")}</option>
              <option value="2">{t("confidenceLearning", "Learning")}</option>
              <option value="3">{t("confidenceFamiliar", "Familiar")}</option>
              <option value="4">{t("confidenceStrong", "Strong")}</option>
            </select>
          </label>
          <div className={`${labelClass} ${usesSimpleFullWidthForm ? "md:col-span-2" : ""}`}>
            <span className="flex items-center justify-between gap-3">
              <label htmlFor={frenchInputId}>{titleLabel}</label>
              {form.category === "vocabulary" && (
                <button
                  className="focus-ring inline-flex h-8 items-center justify-center gap-2 rounded-lg border border-frenchBlue/25 bg-white px-3 text-xs font-bold text-frenchBlue hover:bg-sky/60 disabled:cursor-not-allowed disabled:opacity-60"
                  disabled={
                    autoFillState.status === "loading" || !form.french.trim()
                  }
                  onClick={handleAutoFill}
                  type="button"
                >
                  {autoFillState.status === "loading" ? (
                    <Loader2 className="animate-spin" size={14} />
                  ) : (
                    <Sparkles size={14} />
                  )}
                  {t("autoFill", "Auto-fill")}
                </button>
              )}
            </span>
            <input
              className={inputClass}
              id={frenchInputId}
              onChange={(event) => updateField("french", event.target.value)}
              placeholder={titlePlaceholder}
              ref={frenchInputRef}
              required
              value={form.french}
            />
          </div>
          {!usesSimpleFullWidthForm && (
            <>
              <label className={labelClass}>
                {t("english", "English")}
                <input
                  className={inputClass}
                  onChange={(event) => updateField("english", event.target.value)}
                  required
                  value={form.english}
                />
              </label>
              <div className="md:col-span-2">
                <FrenchCharacterKeyboard onInsert={insertFrenchCharacter} />
              </div>
            </>
          )}
          {isPhraseNote && (
            <>
              <label className={`${labelClass} md:col-span-2`}>
                {t("translation", "Translation")}
                <textarea
                  className="focus-ring min-h-20 rounded-lg border border-line bg-white px-3 py-2 font-normal shadow-sm"
                  onChange={(event) => updateField("english", event.target.value)}
                  required
                  value={form.english}
                />
              </label>
              <div className="md:col-span-2">
                <FrenchCharacterKeyboard onInsert={insertFrenchCharacter} />
              </div>
            </>
          )}
          {isGrammarNote && (
            <div className="md:col-span-2">
              <FrenchCharacterKeyboard onInsert={insertFrenchCharacter} />
            </div>
          )}
          {form.category === "vocabulary" && (
            <>
              <label className={`${labelClass} md:col-span-2`}>
                {t("wordType", "Word type")}
                <select
                  className={inputClass}
                  onChange={(event) =>
                    updateField("partOfSpeech", event.target.value)
                  }
                  value={form.partOfSpeech ?? ""}
                >
                  {partOfSpeechOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {t(option.labelKey, option.label)}
                    </option>
                  ))}
                </select>
              </label>

              <label className={`${labelClass} md:col-span-2`}>
                {t("ipaPronunciation", "IPA pronunciation")}
                <input
                  className={inputClass}
                  onChange={(event) => updateField("ipa", event.target.value)}
                  placeholder="e.g. /bu.lɑ̃.ʒʁi/"
                  value={form.ipa ?? ""}
                />
              </label>

              {form.partOfSpeech === "noun" && (
                <label className={`${labelClass} md:col-span-2`}>
                  {t("gender", "Gender")}
                  <select
                    className={inputClass}
                    onChange={(event) => updateField("gender", event.target.value)}
                    value={form.gender ?? ""}
                  >
                    {genderOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {t(option.labelKey, option.label)}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {form.partOfSpeech === "verb" && (
                <div className="grid gap-3 rounded-xl border border-line bg-sky/35 p-3 md:col-span-2">
                  <p className="text-sm font-black">
                    {t("presentTenseConjugation", "Present tense conjugation")}
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {conjugationPronouns.map((pronoun) => (
                      <label className={labelClass} key={pronoun}>
                        {pronoun}
                        <input
                          className={inputClass}
                          onChange={(event) =>
                            updateConjugation(pronoun, event.target.value)
                          }
                          value={form.conjugation?.[pronoun] ?? ""}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}

              {form.partOfSpeech === "adjective" && (
                <div className="grid gap-3 rounded-xl border border-line bg-sky/35 p-3 md:col-span-2">
                  <p className="text-sm font-black">
                    {t("adjectiveForms", "Adjective forms")}
                  </p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {[
                      ["masculine", t("masculine", "Masculine")],
                      ["feminine", t("feminine", "Feminine")],
                      ["masculinePlural", t("masculinePlural", "Masculine plural")],
                      ["femininePlural", t("femininePlural", "Feminine plural")],
                    ].map(([field, label]) => (
                      <label className={labelClass} key={field}>
                        {label}
                        <input
                          className={inputClass}
                          onChange={(event) =>
                            updateAdjectiveForm(field, event.target.value)
                          }
                          value={form.adjectiveForms?.[field] ?? ""}
                        />
                      </label>
                    ))}
                  </div>
                </div>
              )}
            </>
          )}
          {autoFillState.message && (
            <p
              className={`rounded-xl px-3 py-2 text-sm font-semibold md:col-span-2 ${
                autoFillState.status === "error"
                  ? "bg-blush text-frenchRed"
                  : autoFillState.status === "success"
                    ? "bg-mint text-sage"
                    : "bg-sky text-frenchBlue"
              }`}
            >
              {autoFillState.message}
            </p>
          )}
          <label className={`${labelClass} md:col-span-2`}>
            {t("tags", "Tags")}
            <input
              className={inputClass}
              onChange={(event) => updateField("tags", event.target.value)}
              placeholder="food, travel, A1"
              value={form.tags}
            />
          </label>
          {!usesSimpleFullWidthForm && (
            <label className={`${labelClass} md:col-span-2`}>
              {t("example", "Example")}
              <textarea
                className="focus-ring min-h-20 rounded-lg border border-line bg-white px-3 py-2 font-normal shadow-sm"
                onChange={(event) => updateField("example", event.target.value)}
                value={form.example}
              />
            </label>
          )}
          {!isPhraseNote && (
            <label className={`${labelClass} md:col-span-2`}>
              {isGrammarNote ? t("grammarNote", "Grammar note") : t("notes", "Notes")}
              <textarea
                className={`focus-ring rounded-lg border border-line bg-white px-3 py-2 font-normal shadow-sm ${
                  isGrammarNote ? "min-h-56" : "min-h-24"
                }`}
                onChange={(event) => updateField("notes", event.target.value)}
                required={isGrammarNote}
                value={form.notes}
              />
            </label>
          )}
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button className="secondary-action h-10" onClick={onClose} type="button">
            {t("cancel", "Cancel")}
          </button>
          <button className="primary-action h-10" type="submit">
            {t("saveNote", "Save note")}
          </button>
        </div>
      </form>
    </div>
  );
}
