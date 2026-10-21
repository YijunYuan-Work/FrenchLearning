import { Check, CircleAlert, Loader2, Sparkles, X } from "lucide-react";
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
import { mergeVocabularyAutofill } from "../utils/editorAutofill";
import { FrenchCharacterKeyboard } from "./FrenchCharacterKeyboard";
import { RichTextEditor } from "./RichTextEditor";

const inputClass = "editor-input";
const labelClass = "editor-field";

function SectionHeading({ numeral, children }) {
  return <h3 className="editor-section-heading"><i aria-hidden="true">{numeral}.</i><span>{children}</span></h3>;
}

export function EditorModal({
  error,
  isDemo = false,
  isCurrentAccount,
  isSaving = false,
  userId,
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
  const overlayRef = useRef(null);
  const modalRef = useRef(null);
  const onCloseRef = useRef(onClose);
  const previousFocusRef = useRef(null);
  const frenchInputRef = useRef(null);
  const autoFillRequestRef = useRef(null);
  const contextRef = useRef({ form, language });
  contextRef.current = { form, language };
  const [invalidFields, setInvalidFields] = useState({});
  const [highlightedFields, setHighlightedFields] = useState([]);
  const [autoFillState, setAutoFillState] = useState({
    status: "idle",
    message: "",
  });
  useEffect(() => {
    onCloseRef.current = closeEditor;
  });

  useEffect(() => {
    setAutoFillState({ status: "idle", message: "" });
    return () => {
      const request = autoFillRequestRef.current;
      autoFillRequestRef.current = null;
      request?.controller.abort();
    };
  }, [language, userId]);


  useEffect(() => {
    const viewport = window.visualViewport;
    const overlay = overlayRef.current;
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    function updateViewport() {
      overlay.style.setProperty("--editor-viewport-height", `${viewport?.height ?? window.innerHeight}px`);
      overlay.style.setProperty("--editor-viewport-top", `${viewport?.offsetTop ?? 0}px`);
    }
    updateViewport();
    viewport?.addEventListener("resize", updateViewport);
    viewport?.addEventListener("scroll", updateViewport);
    window.addEventListener("resize", updateViewport);
    return () => {
      document.body.style.overflow = previousOverflow;
      viewport?.removeEventListener("resize", updateViewport);
      viewport?.removeEventListener("scroll", updateViewport);
      window.removeEventListener("resize", updateViewport);
    };
  }, []);

  useEffect(() => {
    if (!highlightedFields.length) return;
    const timer = setTimeout(() => setHighlightedFields([]), 650);
    return () => clearTimeout(timer);
  }, [highlightedFields]);

  function invalidateAutoFill() {
    setHighlightedFields([]);
    const request = autoFillRequestRef.current;
    autoFillRequestRef.current = null;
    request?.controller.abort();
    setAutoFillState({ status: "idle", message: "" });
  }

  function closeEditor() {
    invalidateAutoFill();
    onClose();
  }

  useEffect(() => {
    const modal = modalRef.current;
    const focusableSelector =
      'button, [href], input, select, textarea, [contenteditable="true"], [tabindex]:not([tabindex="-1"])';
    previousFocusRef.current = document.activeElement;
    // A focus trap alone does not hide the workspace from assistive technology.
    const siblings = Array.from(overlayRef.current.parentElement.children)
      .filter((element) => element !== overlayRef.current)
      .map((element) => ({ element, inert: element.inert }));
    siblings.forEach(({ element }) => { element.inert = true; });

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
        (element) => !element.matches(":disabled") && !element.closest("[inert]") && element.offsetParent !== null
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
      siblings.forEach(({ element, inert }) => { element.inert = inert; });
      previousFocusRef.current?.focus?.();
    };
  }, []);

  function updateField(field, value) {
    if (isSaving) return;
    onChange?.();
    setInvalidFields((current) => ({ ...current, [field]: false }));
    setHighlightedFields((current) => current.filter((key) => key !== field));
    if (field === "french" || field === "category") invalidateAutoFill();
    else autoFillRequestRef.current?.editedFields.add(field);
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
    if (isSaving) return;
    onChange?.();
    autoFillRequestRef.current?.editedFields.add("conjugation");
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
    if (isSaving) return;
    onChange?.();
    autoFillRequestRef.current?.editedFields.add("adjectiveForms");
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
    if (isDemo || isSaving || autoFillRequestRef.current || form.category !== "vocabulary" || !isCurrentAccount()) return;
    const controller = new AbortController();
    const request = { controller, french: form.french, category: form.category, language, editedFields: new Set() };
    autoFillRequestRef.current = request;
    const isActive = () => autoFillRequestRef.current === request && !controller.signal.aborted &&
      isCurrentAccount() && contextRef.current.language === request.language &&
      contextRef.current.form.french === request.french && contextRef.current.form.category === request.category;
    setHighlightedFields([]);
    setAutoFillState({
      status: "loading",
      message: t("autoFillLoading", "Asking AI to build the vocabulary note..."),
    });

    try {
      const result = await autoFillFrenchVocabulary(form.french, language, {
        userId, isCurrentAccount, signal: controller.signal,
      });
      if (!isActive()) return;
      // Presentation only: the authoritative merge below still owns all form updates.
      const draft = contextRef.current.form;
      const merged = mergeVocabularyAutofill(draft, result, request.editedFields);
      setHighlightedFields(Object.keys(merged).filter((key) =>
        JSON.stringify(merged[key]) !== JSON.stringify(draft[key])));
      setForm((current) => !controller.signal.aborted && isCurrentAccount() && contextRef.current.language === request.language &&
        current.french === request.french && current.category === request.category
        ? mergeVocabularyAutofill(current, result, request.editedFields) : current);
      setAutoFillState({
        status: "success",
        message: t(
          "autoFillSuccess",
          "Auto-filled. Review the details before saving."
        ),
      });
    } catch (error) {
      if (!isActive()) return;
      setAutoFillState({
        status: "error",
        message: [
          t(`autoFillError${error.code}`, error.message),
          typeof error.code === "string" && error.code.startsWith("OPENAI_") ? t("autoFillAttemptNotice", "This attempt counts toward today's AI limit. Retrying uses another attempt.") : "",
        ].filter(Boolean).join(" "),
      });
    } finally {
      if (autoFillRequestRef.current === request) autoFillRequestRef.current = null;
    }
  }

  function handleSubmit(event) {
    invalidateAutoFill();
    onSave(event);
  }

  const isVocabulary = form.category === "vocabulary";
  const frenchInvalid = invalidFields.french && !form.french.trim();
  const meaningInvalid = invalidFields.english && !form.english.trim();
  const flash = (field) => highlightedFields.includes(field) ? " is-autofilled" : "";
  const confidenceChoices = [
    ["1", t("confidenceNeedsPractice", "Needs practice")],
    ["2", t("confidenceLearning", "Learning")],
    ["3", t("confidenceFamiliar", "Familiar")],
    ["4", t("confidenceStrong", "Strong")],
  ];
  const FrenchControl = isPhraseNote ? "textarea" : "input";
  const essentials = (
    <section className="editor-essentials">
      <SectionHeading numeral="I">{t("editorEssentials", "L’essentiel")}</SectionHeading>
      <div className={labelClass + flash("french")}>
        <div className="editor-field-heading">
          <label htmlFor={frenchInputId}>{titleLabel}<span className="editor-required" aria-hidden="true"> *</span></label>
          {isVocabulary && (
            <button className="editor-autofill" disabled={isDemo || isSaving || autoFillState.status === "loading" || !form.french.trim()}
              onClick={handleAutoFill} type="button" title={isDemo ? t("demoAiUnavailable", "AI auto-fill is unavailable in the public demo.") : undefined}>
              {autoFillState.status === "loading" ? <Loader2 className="animate-spin" size={14} /> : <Sparkles size={14} />}
              {t("autoFill", "Auto-fill")}
            </button>
          )}
        </div>
        <FrenchControl className="editor-writing-line" id={frenchInputId} ref={frenchInputRef} required aria-label={titleLabel}
          aria-invalid={frenchInvalid || undefined} aria-describedby={frenchInvalid ? `${frenchInputId}-error` : undefined}
          onInvalid={(event) => {
            event.preventDefault();
            setInvalidFields((current) => ({ ...current, french: true }));
            modalRef.current?.querySelector(":invalid")?.focus();
          }}
          onChange={(event) => updateField("french", event.target.value)} placeholder={titlePlaceholder} value={form.french} />
        {frenchInvalid && <span className="editor-field-error" id={`${frenchInputId}-error`} role="alert">{t("editorTitleRequired", "Enter a French word or title.")}</span>}
      </div>
      <FrenchCharacterKeyboard onInsert={insertFrenchCharacter} />
      {!isGrammarNote && (
        <label className={labelClass + flash("english")}>
          <span>{isPhraseNote ? t("translation", "Translation") : t("english", "English")}<span className="editor-required" aria-hidden="true"> *</span></span>
          {isPhraseNote ? (
            <textarea className={inputClass} required rows={3} aria-label={t("translation", "Translation")} onChange={(event) => updateField("english", event.target.value)} value={form.english} />
          ) : (
            <input className={inputClass} required aria-label={t("english", "English")} aria-invalid={meaningInvalid || undefined}
              aria-describedby={meaningInvalid ? `${frenchInputId}-meaning-error` : undefined}
              onInvalid={(event) => {
                event.preventDefault();
                setInvalidFields((current) => ({ ...current, english: true }));
                modalRef.current?.querySelector(":invalid")?.focus();
              }}
              onChange={(event) => updateField("english", event.target.value)} value={form.english} />
          )}
          {meaningInvalid && <span className="editor-field-error" id={`${frenchInputId}-meaning-error`} role="alert">{t("editorMeaningRequired", "Enter a meaning.")}</span>}
        </label>
      )}
      {(isVocabulary || form.category === "pronunciation") && (
        <label className={labelClass + flash("ipa")}>{t("ipaPronunciation", "IPA pronunciation")}
          <input className={inputClass} aria-label={t("ipaPronunciation", "IPA pronunciation")} onChange={(event) => updateField("ipa", event.target.value)} placeholder="e.g. /bu.lɑ̃.ʒʁi/" value={form.ipa ?? ""} />
        </label>
      )}
      {isDemo && isVocabulary && <p className="editor-demo-notice">{t("demoAiUnavailable", "AI auto-fill is unavailable in the public demo.")}</p>}
    </section>
  );

  return (
    <div className="cahier-editor-overlay" ref={overlayRef}>
      <form aria-labelledby="editor-modal-title" aria-modal="true" className="cahier-editor" aria-busy={isSaving}
        onSubmit={handleSubmit} ref={modalRef} role="dialog">
        <header className="editor-header">
          <div className="editor-heading">
            <div><p className="editor-annotation" lang="fr">{form.id ? "Modifier la note" : "Nouvelle note"}</p>
              <h2 id="editor-modal-title">{title}</h2></div>
            <button aria-label={t("closeEditor", "Close editor")} className="icon-action editor-close" onClick={closeEditor} type="button"><X size={20} /></button>
          </div>
          <fieldset className="editor-categories" disabled={isSaving}>
            <legend className="sr-only">{t("section", "Section")}</legend>
            {categoryOptions.map((option, index) => (
              <label key={option.value} className={form.category === option.value ? "is-active" : ""}>
                <input type="radio" name="editor-category" aria-label={t(option.labelKey, option.label)} value={option.value} checked={form.category === option.value}
                  onChange={() => updateField("category", option.value)} />
                <i aria-hidden="true">{["i", "ii", "iii", "iv"][index]}</i>
                <span>{option.value === "pronunciation" ? t("editorPronunciation", "Pronunciation") : t(option.labelKey, option.label)}</span>
              </label>
            ))}
          </fieldset>
        </header>

        <div className="editor-scroll-body">
          <fieldset className="editor-fields" disabled={isSaving} inert={isSaving}>
            <div className={isVocabulary ? "editor-vocabulary-grid" : "editor-full-width"}>
              {essentials}
              {isVocabulary && (
                <section className="editor-grammar-details">
                  <SectionHeading numeral="II">{t("editorGrammarDetails", "Grammaire")}</SectionHeading>
                  <label className={labelClass + flash("partOfSpeech")}>{t("wordType", "Word type")}
                    <select className={inputClass} aria-label={t("wordType", "Word type")} onChange={(event) => updateField("partOfSpeech", event.target.value)} value={form.partOfSpeech ?? ""}>
                      {partOfSpeechOptions.map((option) => <option key={option.value} value={option.value}>{t(option.labelKey, option.label)}</option>)}
                    </select>
                  </label>
                  {form.partOfSpeech === "noun" && (
                    <fieldset className={"editor-gender" + flash("gender")}>
                      <legend>{t("gender", "Gender")}</legend>
                      <div>{genderOptions.map((option, index) => (
                        <label key={option.value} className={(form.gender ?? "") === option.value ? "is-active" : ""}>
                          <input type="radio" name="editor-gender" aria-label={t(option.labelKey, option.label)} value={option.value} checked={(form.gender ?? "") === option.value} onChange={() => updateField("gender", option.value)} />
                          <span aria-hidden="true">{["—", "le", "la", "le/la"][index]}</span><span>{language === "zh" ? t(option.labelKey, option.label) : ["Unknown", "Masc.", "Fem.", "Both"][index]}</span>
                        </label>
                      ))}</div>
                    </fieldset>
                  )}
                  {form.partOfSpeech === "verb" && (
                    <fieldset className={"editor-morphology" + flash("conjugation")}>
                      <legend>{t("presentTenseConjugation", "Present tense conjugation")}</legend>
                      <div>{conjugationPronouns.map((pronoun) => (
                        <label key={pronoun}><span>{pronoun}</span><input className="editor-form-line" aria-label={pronoun} onChange={(event) => updateConjugation(pronoun, event.target.value)} value={form.conjugation?.[pronoun] ?? ""} /></label>
                      ))}</div>
                    </fieldset>
                  )}
                  {form.partOfSpeech === "adjective" && (
                    <fieldset className={"editor-morphology editor-adjective" + flash("adjectiveForms")}>
                      <legend>{t("adjectiveForms", "Adjective forms")}</legend>
                      <div>{[
                        ["masculine", t("masculine", "Masculine")], ["feminine", t("feminine", "Feminine")],
                        ["masculinePlural", t("masculinePlural", "Masculine plural")], ["femininePlural", t("femininePlural", "Feminine plural")],
                      ].map(([field, label]) => (
                        <label key={field} title={label}><span>{language === "zh" ? label : { masculine: "M.", feminine: "F.", masculinePlural: "M. pl.", femininePlural: "F. pl." }[field]}</span><input className="editor-form-line" aria-label={label} onChange={(event) => updateAdjectiveForm(field, event.target.value)} value={form.adjectiveForms?.[field] ?? ""} /></label>
                      ))}</div>
                    </fieldset>
                  )}
                </section>
              )}
            </div>
            {isGrammarNote && <section className="editor-grammar-content">
              <SectionHeading numeral="II">{t("grammarNote", "Grammar note")}</SectionHeading>
              <RichTextEditor label={t("grammarNote", "Grammar note")} onChange={(value) => updateField("notes", value)}
                placeholder={t("grammarNotePlaceholder", "Paste or write the grammar rule here.")} t={t} value={form.notes} />
            </section>}
            <section className="editor-context">
              <SectionHeading numeral={isVocabulary || isGrammarNote ? "III" : "II"}>{t("editorContext", "Contexte")}</SectionHeading>
              <div className="editor-context-grid">
                {!usesSimpleFullWidthForm && <div className="editor-context-notes">
                  <label className={labelClass + flash("example")}>{t("example", "Example")}
                    <textarea className={inputClass + " editor-example"} aria-label={t("example", "Example")} rows={3} onChange={(event) => updateField("example", event.target.value)} value={form.example} />
                  </label>
                  <label className={labelClass + flash("notes")}>{t("notes", "Notes")}
                    <textarea className={inputClass} aria-label={t("notes", "Notes")} rows={3} onChange={(event) => updateField("notes", event.target.value)} value={form.notes} />
                  </label>
                </div>}
                <div className="editor-context-options">
                  <label className={labelClass + flash("tags")}>{t("tags", "Tags")}
                    <input className={inputClass} aria-label={t("tags", "Tags")} onChange={(event) => updateField("tags", event.target.value)} placeholder="food, travel, A1" value={form.tags} />
                  </label>
                  <fieldset className="editor-confidence">
                    <legend>{t("confidence", "Confidence")}</legend>
                    <div>{confidenceChoices.map(([value, label]) => (
                      <label key={value} className={String(form.confidence) === value ? "is-active" : ""}>
                        <input type="radio" name="editor-confidence" value={value} checked={String(form.confidence) === value} onChange={() => updateField("confidence", value)} />
                        <span className="editor-confidence-ticks" aria-hidden="true">{[1, 2, 3, 4].map((tick) => <i className={tick <= Number(value) ? "is-filled" : ""} key={tick} />)}</span>
                        <span>{label}</span>
                      </label>
                    ))}</div>
                  </fieldset>
                </div>
              </div>
            </section>
          </fieldset>
        </div>
        <footer className="editor-footer">
          <div data-status={isSaving ? "saving" : autoFillState.status} className={"editor-feedback" + (error || autoFillState.status === "error" ? " is-error" : "")}>
            {isSaving ? <p role="status"><Loader2 className="animate-spin" size={16} /><span>{t("savingNote", "Saving note...")}</span></p> : error ? <p role="alert"><CircleAlert size={16} /><span>{error}</span></p> :
              autoFillState.message ? <p role={autoFillState.status === "error" ? "alert" : "status"}>
                {autoFillState.status === "loading" ? <Loader2 className="animate-spin" size={16} /> : autoFillState.status === "error" ? <CircleAlert size={16} /> : <Check size={16} />}
                <span>{autoFillState.message}</span>
              </p> : null}
            {autoFillState.status === "error" && !isSaving && <button className="editor-retry" onClick={handleAutoFill} type="button">{t("editorRetryAutoFill", "Retry auto-fill")}</button>}
          </div>
          <div className="editor-actions">
            <button className="secondary-action" onClick={closeEditor} type="button">{isSaving ? t("close", "Close") : t("cancel", "Cancel")}</button>
            <button className="primary-action" aria-label={isSaving ? t("savingNote", "Saving note...") : t("saveNote", "Save note")} disabled={isSaving} type="submit">
              {isSaving && <Loader2 className="animate-spin" size={16} />}
              {isSaving ? t("savingNote", "Saving note...") : error ? t("editorSaveAgain", "Save again") : t("saveNote", "Save note")}
            </button>
          </div>
        </footer>
      </form>
    </div>
  );
}
