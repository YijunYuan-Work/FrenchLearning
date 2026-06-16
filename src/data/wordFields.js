export const partOfSpeechOptions = [
  { value: "", label: "Select word type" },
  { value: "noun", label: "Noun" },
  { value: "verb", label: "Verb" },
  { value: "adjective", label: "Adjective" },
  { value: "adverb", label: "Adverb" },
  { value: "pronoun", label: "Pronoun" },
  { value: "preposition", label: "Preposition" },
  { value: "conjunction", label: "Conjunction" },
  { value: "interjection", label: "Interjection" },
  { value: "article", label: "Article" },
  { value: "numeral", label: "Numeral" },
];

export const genderOptions = [
  { value: "", label: "Unknown" },
  { value: "masculine", label: "Masculine" },
  { value: "feminine", label: "Feminine" },
  { value: "masculine or feminine", label: "Masculine or feminine" },
];

export const conjugationPronouns = [
  "je",
  "tu",
  "il/elle",
  "nous",
  "vous",
  "ils/elles",
];

export function createEmptyConjugation() {
  return conjugationPronouns.reduce((forms, pronoun) => {
    forms[pronoun] = "";
    return forms;
  }, {});
}

export function createEmptyAdjectiveForms() {
  return {
    masculine: "",
    feminine: "",
    masculinePlural: "",
    femininePlural: "",
  };
}

export function createEmptyWordDetails() {
  return {
    partOfSpeech: "",
    ipa: "",
    gender: "",
    conjugation: createEmptyConjugation(),
    adjectiveForms: createEmptyAdjectiveForms(),
  };
}

export function normalizeWordDetails(item) {
  const empty = createEmptyWordDetails();
  return {
    partOfSpeech: item.partOfSpeech ?? empty.partOfSpeech,
    ipa: item.ipa ?? empty.ipa,
    gender: item.gender ?? empty.gender,
    conjugation: {
      ...empty.conjugation,
      ...(item.conjugation ?? {}),
    },
    adjectiveForms: {
      ...empty.adjectiveForms,
      ...(item.adjectiveForms ?? {}),
    },
  };
}

export function partOfSpeechLabel(value) {
  return partOfSpeechOptions.find((option) => option.value === value)?.label ?? "";
}
