import { createEmptyAdjectiveForms, createEmptyConjugation } from "../data/wordFields.js";

const morphologyFields = ["partOfSpeech", "gender", "conjugation", "adjectiveForms"];

export function mergeVocabularyAutofill(current, result, editedFields) {
  const fields = {
    category: result.category,
    french: result.word,
    english: result.english,
    example: result.example,
    notes: result.notes,
    tags: (result.tags ?? []).join(", "),
    partOfSpeech: result.partOfSpeech,
    ipa: result.ipa,
    gender: result.gender,
    conjugation: result.conjugation ?? createEmptyConjugation(),
    adjectiveForms: result.adjectiveForms ?? createEmptyAdjectiveForms(),
  };
  // Word type and its dependent forms must stay consistent with manual edits.
  const preserveMorphology = morphologyFields.some((field) => editedFields.has(field));
  return {
    ...current,
    ...Object.fromEntries(Object.entries(fields).filter(([field]) =>
      !editedFields.has(field) && !(preserveMorphology && morphologyFields.includes(field)))),
  };
}
