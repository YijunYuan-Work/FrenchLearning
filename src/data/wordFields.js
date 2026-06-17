export const partOfSpeechOptions = [
  { value: "", label: "Select word type", labelKey: "selectWordType" },
  { value: "noun", label: "Noun", labelKey: "categoryNoun" },
  { value: "verb", label: "Verb", labelKey: "categoryVerb" },
  { value: "adjective", label: "Adjective", labelKey: "categoryAdjective" },
  { value: "adverb", label: "Adverb", labelKey: "categoryAdverb" },
  { value: "pronoun", label: "Pronoun", labelKey: "categoryPronoun" },
  { value: "preposition", label: "Preposition", labelKey: "categoryPreposition" },
  { value: "conjunction", label: "Conjunction", labelKey: "categoryConjunction" },
  { value: "interjection", label: "Interjection", labelKey: "categoryInterjection" },
  { value: "article", label: "Article", labelKey: "categoryArticle" },
  { value: "numeral", label: "Numeral", labelKey: "categoryNumeral" },
];

export const genderOptions = [
  { value: "", label: "Unknown", labelKey: "unknown" },
  { value: "masculine", label: "Masculine", labelKey: "masculine" },
  { value: "feminine", label: "Feminine", labelKey: "feminine" },
  {
    value: "masculine or feminine",
    label: "Masculine or feminine",
    labelKey: "masculineOrFeminine",
  },
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

export function partOfSpeechLabel(value, t) {
  const option = partOfSpeechOptions.find((option) => option.value === value);
  if (!option) return "";
  return t ? t(option.labelKey, option.label) : option.label;
}
