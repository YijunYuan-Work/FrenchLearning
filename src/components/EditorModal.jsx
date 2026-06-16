import { Loader2, Sparkles, X } from "lucide-react";
import { useRef, useState } from "react";
import { FrenchCharacterKeyboard } from "./FrenchCharacterKeyboard";
import { categoryOptions } from "../data/categories";
import {
  createEmptyWordDetails,
  conjugationPronouns,
  createEmptyAdjectiveForms,
  createEmptyConjugation,
  genderOptions,
  partOfSpeechOptions,
} from "../data/wordFields";
import { autoFillFrenchVocabulary } from "../services/vocabularyAutofill";

export function EditorModal({
  error,
  form,
  onChange,
  onClose,
  onSave,
  setForm,
  title,
}) {
  const frenchInputRef = useRef(null);
  const [autoFillState, setAutoFillState] = useState({
    status: "idle",
    message: "",
  });

  function updateField(field, value) {
    onChange?.();
    if (field === "french") {
      setForm((current) => ({
        ...current,
        french: value,
        english: "",
        example: "",
        notes: "",
        tags: "",
        ...createEmptyWordDetails(),
      }));
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
      message: "Asking AI to build the vocabulary note...",
    });

    try {
      const result = await autoFillFrenchVocabulary(form.french);
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
        message: "Auto-filled. Review the details before saving.",
      });
    } catch (error) {
      setAutoFillState({
        status: "error",
        message: error.message,
      });
    }
  }

  return (
    <div className="fixed inset-0 z-50 grid place-items-center bg-ink/45 p-4">
      <form
        className="max-h-[92vh] w-full max-w-2xl overflow-auto rounded-md bg-paper p-5 shadow-soft"
        onSubmit={onSave}
      >
        <div className="mb-4 flex items-center justify-between gap-3">
          <h2 className="text-xl font-bold">{title}</h2>
          <button
            aria-label="Close editor"
            className="focus-ring grid size-9 place-items-center rounded-md border border-slate-200 bg-white"
            onClick={onClose}
            type="button"
          >
            <X size={18} />
          </button>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {error && (
            <p className="rounded-md bg-frenchRed/10 px-3 py-2 text-sm font-semibold text-frenchRed md:col-span-2">
              {error}
            </p>
          )}

          <label className="grid gap-1 text-sm font-semibold">
            Section
            <select
              className="focus-ring h-10 rounded-md border border-slate-200 bg-white px-3 font-normal"
              onChange={(event) => updateField("category", event.target.value)}
              value={form.category}
            >
              {categoryOptions.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            Confidence
            <select
              className="focus-ring h-10 rounded-md border border-slate-200 bg-white px-3 font-normal"
              onChange={(event) =>
                updateField("confidence", event.target.value)
              }
              value={form.confidence}
            >
              <option value="1">Needs practice</option>
              <option value="2">Learning</option>
              <option value="3">Familiar</option>
              <option value="4">Strong</option>
            </select>
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            <span className="flex items-center justify-between gap-3">
              French
              {form.category === "vocabulary" && (
                <button
                  className="focus-ring inline-flex h-8 items-center justify-center gap-2 rounded-md border border-frenchBlue/20 bg-white px-3 text-xs font-semibold text-frenchBlue hover:bg-frenchBlue/5 disabled:cursor-not-allowed disabled:opacity-60"
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
                  Auto-fill
                </button>
              )}
            </span>
            <input
              className="focus-ring h-10 rounded-md border border-slate-200 bg-white px-3 font-normal"
              onChange={(event) => updateField("french", event.target.value)}
              placeholder="e.g. boulangerie, parler, heureux"
              ref={frenchInputRef}
              required
              value={form.french}
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold">
            English
            <input
              className="focus-ring h-10 rounded-md border border-slate-200 bg-white px-3 font-normal"
              onChange={(event) => updateField("english", event.target.value)}
              required
              value={form.english}
            />
          </label>
          <div className="md:col-span-2">
            <FrenchCharacterKeyboard onInsert={insertFrenchCharacter} />
          </div>
          {form.category === "vocabulary" && (
            <>
              <label className="grid gap-1 text-sm font-semibold md:col-span-2">
                Word type
                <select
                  className="focus-ring h-10 rounded-md border border-slate-200 bg-white px-3 font-normal"
                  onChange={(event) =>
                    updateField("partOfSpeech", event.target.value)
                  }
                  value={form.partOfSpeech ?? ""}
                >
                  {partOfSpeechOptions.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>

              <label className="grid gap-1 text-sm font-semibold md:col-span-2">
                IPA pronunciation
                <input
                  className="focus-ring h-10 rounded-md border border-slate-200 bg-white px-3 font-normal"
                  onChange={(event) => updateField("ipa", event.target.value)}
                  placeholder="e.g. /bu.lɑ̃ʒ.ʁi/"
                  value={form.ipa ?? ""}
                />
              </label>

              {form.partOfSpeech === "noun" && (
                <label className="grid gap-1 text-sm font-semibold md:col-span-2">
                  Gender
                  <select
                    className="focus-ring h-10 rounded-md border border-slate-200 bg-white px-3 font-normal"
                    onChange={(event) => updateField("gender", event.target.value)}
                    value={form.gender ?? ""}
                  >
                    {genderOptions.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </label>
              )}

              {form.partOfSpeech === "verb" && (
                <div className="grid gap-3 rounded-md border border-frenchBlue/10 bg-white p-3 md:col-span-2">
                  <p className="text-sm font-semibold">Present tense conjugation</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {conjugationPronouns.map((pronoun) => (
                      <label
                        className="grid gap-1 text-sm font-semibold"
                        key={pronoun}
                      >
                        {pronoun}
                        <input
                          className="focus-ring h-10 rounded-md border border-slate-200 bg-white px-3 font-normal"
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
                <div className="grid gap-3 rounded-md border border-frenchBlue/10 bg-white p-3 md:col-span-2">
                  <p className="text-sm font-semibold">Adjective forms</p>
                  <div className="grid gap-3 md:grid-cols-2">
                    {[
                      ["masculine", "Masculine"],
                      ["feminine", "Feminine"],
                      ["masculinePlural", "Masculine plural"],
                      ["femininePlural", "Feminine plural"],
                    ].map(([field, label]) => (
                      <label className="grid gap-1 text-sm font-semibold" key={field}>
                        {label}
                        <input
                          className="focus-ring h-10 rounded-md border border-slate-200 bg-white px-3 font-normal"
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
              className={`rounded-md px-3 py-2 text-sm md:col-span-2 ${
                autoFillState.status === "error"
                  ? "bg-frenchRed/10 text-frenchRed"
                  : autoFillState.status === "success"
                    ? "bg-sage/10 text-sage"
                    : "bg-frenchBlue/8 text-frenchBlue"
              }`}
            >
              {autoFillState.message}
            </p>
          )}
          <label className="grid gap-1 text-sm font-semibold md:col-span-2">
            Example
            <textarea
              className="focus-ring min-h-20 rounded-md border border-slate-200 bg-white px-3 py-2 font-normal"
              onChange={(event) => updateField("example", event.target.value)}
              value={form.example}
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold md:col-span-2">
            Notes
            <textarea
              className="focus-ring min-h-24 rounded-md border border-slate-200 bg-white px-3 py-2 font-normal"
              onChange={(event) => updateField("notes", event.target.value)}
              value={form.notes}
            />
          </label>
          <label className="grid gap-1 text-sm font-semibold md:col-span-2">
            Tags
            <input
              className="focus-ring h-10 rounded-md border border-slate-200 bg-white px-3 font-normal"
              onChange={(event) => updateField("tags", event.target.value)}
              placeholder="food, travel, A1"
              value={form.tags}
            />
          </label>
        </div>

        <div className="mt-5 flex justify-end gap-2">
          <button
            className="focus-ring h-10 rounded-md border border-slate-200 bg-white px-4 text-sm font-semibold"
            onClick={onClose}
            type="button"
          >
            Cancel
          </button>
          <button
            className="focus-ring h-10 rounded-md bg-frenchBlue px-4 text-sm font-semibold text-white"
            type="submit"
          >
            Save note
          </button>
        </div>
      </form>
    </div>
  );
}
